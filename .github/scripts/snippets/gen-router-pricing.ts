#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatAmount, formatDate, formatOption, formatUnit, pricingCopy, type PricingCategory, type PricingLocale } from "./router-pricing-display.ts";

const ROOT = join(import.meta.dir, "../../..");
const METRONOME_FILE = join(ROOT, "router-pricing/metronome-rates.json");
const OUTPUT_FILE = join(ROOT, "development/comfy-router/pricing.mdx");
const MODEL_GLOB = "development/comfy-router/models/**/code.mdx";
const MAX_RESOLUTION_COLUMNS = 5;

type CatalogModel = {
  id: string;
  title: string;
  page: string;
  providers: string[];
  category: PricingCategory;
};

type MetronomeRate = {
  model_id: string;
  serving_provider: string;
  kind: "usage" | "flat" | "metered";
  unit: string;
  price_usd?: string;
  credits?: string;
  conditions?: string;
  effective_from: string;
  effective_until?: string;
  replace_existing?: boolean;
  entitled?: boolean;
};

type MetronomeData = {
  snapshot_at: string;
  credits_per_usd: number;
  source_sha256: string;
  rates: MetronomeRate[];
  supplemental_sources?: Array<{
    source: string;
    source_ref: string;
    source_sha256?: string;
    file_id?: string;
    checked_at: string;
    rates: MetronomeRate[];
  }>;
};

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  beeble: "Beeble",
  bfl: "Black Forest Labs",
  bria: "Bria",
  byteplus: "BytePlus",
  elevenlabs: "ElevenLabs",
  fal: "fal",
  freepik: "Freepik",
  "gemini-interactions": "Gemini Interactions",
  heygen: "HeyGen",
  higgsfield: "Higgsfield",
  ideogram: "Ideogram",
  kling: "Kling",
  krea: "Krea",
  ltx: "LTX",
  luma: "Luma",
  luma_2: "Luma 2",
  meshy: "Meshy",
  minimax: "MiniMax",
  moonvalley: "Moonvalley",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  pruna: "Pruna",
  qwen: "Qwen",
  recraft: "Recraft",
  runway: "Runway",
  tencent: "Tencent",
  veo: "Veo",
  vertexai: "Google",
  wan: "Wan",
  wavespeed: "WaveSpeed",
  xai: "xAI",
};

const PRICING_PROVIDER_ORDER = ["Comfy", "fal", "Higgsfield", "Runware", "WaveSpeed"];

const providerLabel = (modelId: string) => PROVIDER_LABEL[modelId.split("/")[0]] ?? modelId.split("/")[0];

function servingProviders(pageText: string, modelId: string): string[] {
  const sectionStart = pageText.indexOf("## Serving providers");
  if (sectionStart < 0) {
    const ownerProvider = providerLabel(modelId);
    const provider = PRICING_PROVIDER_ORDER.slice(1).find((candidate) => candidate.toLowerCase() === ownerProvider.toLowerCase());
    return [provider ?? "Comfy"];
  }
  const nextHeading = pageText.indexOf("\n## ", sectionStart + 4);
  const section = pageText.slice(sectionStart, nextHeading < 0 ? undefined : nextHeading);
  const alternatives = [...section.matchAll(/^- \*\*(.+?)\*\*/gm)]
    .map((match) => match[1].replace(/ \(default\)$/, "").trim())
    .filter((provider) => provider.toLowerCase() !== "comfy");
  return ["Comfy", ...new Set(alternatives)];
}

export function displayProvider(modelId: string, providers: string[], metronomeProvider: string): string {
  const owner = providerLabel(modelId).toLowerCase();
  const alternate = providers.find((provider) => provider.toLowerCase() === metronomeProvider.toLowerCase());
  if (alternate) return alternate;
  if (metronomeProvider.toLowerCase() === owner) return "Comfy";
  throw new Error(`Pricing provider ${metronomeProvider} for ${modelId} is neither its owner provider nor a declared Router alternate`);
}

function modelTitle(pageText: string, model: string): string {
  const title = pageText.match(/^title: "([^"]+)"$/m)?.[1];
  if (title) return title.replace(/^Use /, "").replace(/ with Comfy Router$/, "");
  return model
    .split("/")
    .at(-1)!
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function loadCatalog(): CatalogModel[] {
  const modalities = new Map<string, string[]>();
  for (const rel of new Bun.Glob("router-schemas/**/*.json").scanSync({ cwd: ROOT })) {
    const schema = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
    if (schema["x-comfy-router-model-id"]) {
      modalities.set(schema["x-comfy-router-model-id"], schema["x-comfy-router-output-modalities"] ?? []);
    }
  }
  const models = new Map<string, CatalogModel>();
  for (const rel of [...new Bun.Glob(MODEL_GLOB).scanSync({ cwd: ROOT })].sort()) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const match of text.matchAll(/\*\*Model ID:\*\*\s*`([^`]+)`/g)) {
      const id = match[1];
      models.set(id, {
        id,
        title: modelTitle(text, id),
        page: rel.replace(/\.mdx$/, ""),
        providers: servingProviders(text, id),
        category: modelCategory(id, modalities.get(id) ?? []),
      });
    }
  }
  if (models.size === 0) throw new Error(`no Router model pages matched ${MODEL_GLOB}`);
  return [...models.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function modelCategory(id: string, outputs: string[]): PricingCategory {
  if (id.startsWith("gemini-interactions/")) return "text";
  if (outputs.includes("3d")) return "3d";
  if (outputs.includes("video")) return "video";
  if (outputs.includes("image")) return "images";
  if (outputs.includes("audio") && !outputs.includes("text")) return "audio";
  if (outputs.includes("text")) return "text";
  if (id.startsWith("vertexai/")) return /image|imagen/.test(id) ? "images" : "text";
  if (id.startsWith("wan/")) return /[ti]2i/.test(id) ? "images" : "video";
  if (id.startsWith("bfl/")) return /video/.test(id) ? "video" : "images";
  if (id.startsWith("minimax/")) return "video";
  if (id.startsWith("ideogram/")) return "images";
  throw new Error(`No pricing category for ${id}`);
}

function loadMetronomeData(): MetronomeData {
  const data = JSON.parse(readFileSync(METRONOME_FILE, "utf8")) as MetronomeData;
  if (!data.snapshot_at || data.credits_per_usd <= 0 || !Array.isArray(data.rates)) {
    throw new Error(`${METRONOME_FILE}: invalid Metronome pricing data`);
  }
  const supplementalSources = data.supplemental_sources ?? [];
  for (const source of supplementalSources) {
    if (source.source.endsWith("services/comfy-api/scripts/metronome/fal/rates/rates.json")
      && source.rates.some((rate) => rate.entitled !== true)) {
      throw new Error(`${METRONOME_FILE}: fal rates require an active, entitled rate-card entry`);
    }
  }
  data.rates.push(...supplementalSources.flatMap(({ rates }) => rates));
  for (const rate of data.rates) {
    if (!rate.model_id || !rate.serving_provider || !rate.unit || !rate.effective_from) {
      throw new Error(`${METRONOME_FILE}: every route rate requires a model, serving provider, unit, and start date`);
    }
    if (rate.kind !== "usage" && (!rate.price_usd || !rate.credits)) {
      throw new Error(`${METRONOME_FILE}: fixed and metered rates require USD and credit amounts`);
    }
    if (rate.kind === "usage" && (rate.price_usd !== undefined || rate.credits !== undefined)) {
      throw new Error(`${METRONOME_FILE}: usage-based rates must not expose a fixed amount`);
    }
    if (rate.price_usd !== undefined && rate.credits !== undefined) {
      validateCreditConversion(rate, data.credits_per_usd);
    }
    if (rate.effective_until && rate.effective_until <= rate.effective_from) {
      throw new Error(`${METRONOME_FILE}: rate end must follow its start for ${rate.model_id}`);
    }
  }
  return data;
}

function validateCreditConversion(rate: MetronomeRate, creditsPerUsd: number): void {
  const expected = Number(rate.price_usd) * creditsPerUsd;
  const actual = Number(rate.credits);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || Math.abs(expected - actual) > 0.000051) {
    throw new Error(`${METRONOME_FILE}: credit conversion does not match USD amount for ${rate.model_id}`);
  }
}

type DisplayRate = {
  rates: MetronomeRate[];
  options: string[];
};

function groupRates(rates: MetronomeRate[], locale: PricingLocale): DisplayRate[] {
  const groups = new Map<string, DisplayRate>();
  for (const rate of rates) {
    const key = JSON.stringify([rate.kind, rate.price_usd, rate.credits, rate.unit, rate.effective_from, rate.effective_until]);
    const group = groups.get(key) ?? { rates: [], options: [] };
    group.rates.push(rate);
    const option = formatOption(rate.conditions, locale);
    if (!group.options.includes(option)) group.options.push(option);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function compactOptions(options: string[]): string {
  const groups = new Map<string, string[]>();
  for (const option of options) {
    const parts = option.split(" · ");
    const value = parts.pop()!;
    const last = /^\d+\s*[x×]\s*\d+$/i.test(value) ? resolutionLabel(value) : value;
    const prefix = parts.join(" · ");
    const values = groups.get(prefix) ?? [];
    if (!values.includes(last)) values.push(last);
    groups.set(prefix, values);
  }
  return [...groups].map(([prefix, values]) =>
    [prefix, values.join(" / ")].filter(Boolean).join(" · "),
  ).join("<br />");
}

function displayTitle(model: CatalogModel): string {
  if (model.id === "bfl/video-edit-v1") return "Video Edit V1";
  if (model.id === "bfl/flux-pro-1.1") return "FLUX 1.1 Pro";
  if (model.id === "bfl/flux-pro-1.1-ultra") return "FLUX 1.1 Pro Ultra";
  if (model.id === "bfl/flux-kontext-max") return `${model.title} Max`;
  if (model.id === "bfl/flux-kontext-pro") return `${model.title} Pro`;
  return model.title.replace(/^Image Edit /, "").replace(/^Video Edit /, "").replace(/Gen Fill$/, "Generative Fill")
    .replace(/ (?:20\d{6}|\d{6})$/, "");
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isTokenRoute(rates: MetronomeRate[]): boolean {
  const tokenCondition = /^(?:(?:Input|Output) (?:text|audio|image|video) tokens|Cached input(?: (?:text|audio|image|video))? tokens|Cache-write input text tokens|(?:5-minute|1-hour) cache-write input tokens|Reasoning tokens)$/;
  return rates.length > 0 && rates.every((rate) => rate.kind !== "usage" && rate.unit === "per 1M tokens" && tokenCondition.test(rate.conditions ?? ""));
}

function tokenPriceCell(rates: MetronomeRate[], direction: "input" | "output" | "cached", locale: PricingLocale): string {
  const selected = rates.filter((rate) => {
    const condition = rate.conditions ?? "";
    if (/^Cached input/.test(condition) || /cache-write/i.test(condition)) return direction === "cached";
    if (/^(Output|Reasoning)/.test(condition)) return direction === "output";
    return direction === "input";
  });
  // The header supplies the token unit. Equal amounts share one value,
  // including media and reasoning charges that match the text baseline.
  const groups = new Map<string, MetronomeRate[]>();
  for (const rate of selected) {
    const amount = formatAmount(rate.credits!);
    const group = groups.get(amount) ?? [];
    group.push(rate);
    groups.set(amount, group);
  }
  const baseline = selected.find((rate) => rate.conditions === (direction === "input" ? "Input text tokens" : direction === "output" ? "Output text tokens" : "Cached input text tokens"))
    ?? (direction === "cached" ? selected.find((rate) => rate.conditions === "Cached input tokens") : undefined)
    ?? (groups.size === 1 ? selected[0] : undefined);
  const primary = baseline ? formatAmount(baseline.credits!) : undefined;
  const localeIndex = ["en", "ja", "zh", "ko"].indexOf(locale);
  const label = (condition: string) => {
    if (/^Cached input/.test(condition)) return ["Cached input read", "キャッシュ入力の読み取り", "缓存输入读取", "캐시 입력 읽기"][localeIndex];
    const modality = condition.match(/^(?:Input|Output|Cached input) (text|audio|image|video) tokens$/)?.[1];
    const labels: Record<string, string[]> = {
      text: ["Text", "テキスト", "文本", "텍스트"],
      audio: ["Audio", "音声", "音频", "오디오"],
      image: ["Image", "画像", "图像", "이미지"],
      video: ["Video", "動画", "视频", "동영상"],
    };
    if (modality) return labels[modality][localeIndex];
    if (condition.startsWith("5-minute")) return ["Cached input write (5m)", "キャッシュ入力の書き込み（5 分）", "缓存输入写入（5 分钟）", "캐시 입력 쓰기(5분)"][localeIndex];
    if (condition.startsWith("1-hour")) return ["Cached input write (1h)", "キャッシュ入力の書き込み（1 時間）", "缓存输入写入（1 小时）", "캐시 입력 쓰기(1시간)"][localeIndex];
    if (condition.startsWith("Cache-write")) return ["Cached input write", "キャッシュ入力の書き込み", "缓存输入写入", "캐시 입력 쓰기"][localeIndex];
    if (condition === "Reasoning tokens") return ["Reasoning", "推論", "推理", "추론"][localeIndex];
    return formatOption(condition, locale);
  };
  const ordered = [...groups].sort(([a], [b]) => a === primary ? -1 : b === primary ? 1 : 0);
  return ordered.map(([amount, group]) => {
    const labels = [...new Set(group.map((rate) => label(rate.conditions ?? "")))];
    const isPlainTextBaseline = amount === primary && direction !== "cached" && labels.length === 1 && labels[0] === "Text";
    const prefix = isPlainTextBaseline ? "" : `${tableCell(labels.join(" / "))}: `;
    return `${prefix}${amount}`;
  }).join("<br />") || "-";
}

function groupImageTiers(rates: MetronomeRate[]) {
  const remaining: MetronomeRate[] = [];
  const groups = new Map<string, { operation: string; quality: string; tiers: Map<string, MetronomeRate> }>();
  for (const rate of rates) {
    const parts = (rate.conditions ?? "").split(";").map((part) => part.trim());
    const operation = parts.find((part) => part === "Edit" || part === "Text to image");
    const quality = parts.find((part) => part.startsWith("quality="))?.slice(8);
    const size = parts.find((part) => part.startsWith("output size="))?.slice(12);
    const supportedParts = parts.every((part) => part === operation || part === `quality=${quality}` || part === `output size=${size}` || (rate.kind === "usage" && part === "The amount depends on reported usage"));
    const supportedUnit = rate.kind === "usage" ? rate.unit === "variable based on reported usage" : rate.unit === "per request";
    if (!operation || !quality || !size || !["1K", "2K", "4K"].includes(size) || !supportedParts || !supportedUnit) {
      remaining.push(rate);
      continue;
    }
    const key = JSON.stringify([rate.model_id, rate.serving_provider, operation, quality, rate.effective_from, rate.effective_until]);
    const group = groups.get(key) ?? { operation, quality, tiers: new Map<string, MetronomeRate>() };
    // Preserve conflicting records in the ordinary table instead of selecting one.
    if (group.tiers.has(size)) return { remaining: rates, groups: [] };
    group.tiers.set(size, rate);
    groups.set(key, group);
  }
  const qualityOrder = ["low", "medium", "high", "xhigh", "max"];
  return { remaining, groups: [...groups.values()].sort((a, b) =>
    (a.operation === b.operation ? qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality) : a.operation === "Text to image" ? -1 : 1),
  ) };
}

function resolutionLabel(value: string): string {
  const sizes: Record<string, string> = {
    "1280x720": "720p", "720x1280": "720p", "1920x1080": "1080p", "1080x1920": "1080p",
    "2560x1440": "1440p", "1440x2560": "1440p", "3840x2160": "4K", "2160x3840": "4K",
  };
  const normalized = value.trim().replace(/\s*[x×]\s*/gi, "x");
  return sizes[normalized] ?? normalized.replace(/P$/, "p").replace(/k$/, "K").replace(/^(720|1080)$/, "$1p");
}

function groupResolutionTiers(rates: MetronomeRate[]) {
  const remaining: MetronomeRate[] = [];
  const groups = new Map<string, { conditions: string; tiers: Map<string, { rate: MetronomeRate; sources: MetronomeRate[] }> }>();
  const resolutions = new Set<string>();
  for (const rate of rates) {
    const parts = (rate.conditions ?? "").split(";").map((part) => part.trim());
    const resolution = parts.find((part) => part.startsWith("resolution="))
      ?? parts.find((part) => /^(?:\d+(?:\.\d+)?[pK]|\d+\s*[x×]\s*\d+)$/i.test(part));
    if (!resolution) { remaining.push(rate); continue; }
    const label = resolutionLabel(resolution.startsWith("resolution=") ? resolution.slice(11) : resolution);
    resolutions.add(label);
    const conditions = parts.filter((part) => part !== resolution && !(rate.model_id === "minimax/minimax-h3" && rate.unit === "per second" && ["Output video", "Reference video input"].includes(part))).join("; ");
    const key = JSON.stringify([rate.model_id, rate.serving_provider, conditions, rate.unit, rate.kind, rate.effective_from, rate.effective_until]);
    const group = groups.get(key) ?? { conditions, tiers: new Map() };
    const existing = group.tiers.get(label);
    if (existing && (existing.rate.price_usd !== rate.price_usd || existing.rate.credits !== rate.credits)) {
      return { remaining: rates, groups: [] };
    }
    if (existing) existing.sources.push(rate);
    else group.tiers.set(label, { rate, sources: [rate] });
    groups.set(key, group);
  }
  if (resolutions.size < 2 || resolutions.size > 4) return { remaining: rates, groups: [] };
  return { remaining, groups: [...groups.values()] };
}

function resolutionOrder(a: string, b: string): number {
  const pixels = (value: string) => value.toUpperCase().endsWith("K") ? parseFloat(value) * 1000 : parseFloat(value);
  return pixels(a) - pixels(b) || a.localeCompare(b);
}

function render(locale: PricingLocale = "en"): string {
  const models = loadCatalog();
  const data = loadMetronomeData();
  const copy = pricingCopy[locale];
  const modelIds = new Set(models.map((model) => model.id));
  const missingModels = [...new Set(data.rates.map((rate) => rate.model_id).filter((id) => !modelIds.has(id)))];
  if (missingModels.length) throw new Error(`${METRONOME_FILE}: Router model IDs are absent from the current catalog: ${missingModels.join(", ")}`);
  const modelsById = new Map(models.map((model) => [model.id, model]));
  for (const rate of data.rates) {
    const model = modelsById.get(rate.model_id)!;
    displayProvider(model.id, model.providers, rate.serving_provider);
  }
  const categories: PricingCategory[] = ["images", "video", "text", "audio", "3d"];
  const tabs = categories.map((category) => {
    const providers = new Map<string, Array<{ model: CatalogModel; rates: MetronomeRate[] }>>();
    for (const model of models.filter((candidate) => candidate.category === category)) {
      for (const provider of model.providers) {
        const routes = providers.get(provider) ?? [];
        routes.push({ model, rates: data.rates.filter((rate) => rate.model_id === model.id && displayProvider(model.id, model.providers, rate.serving_provider) === provider) });
        providers.set(provider, routes);
      }
    }
    let opened = false;
    const sections = [...providers].sort(([a], [b]) => {
      const ai = PRICING_PROVIDER_ORDER.indexOf(a);
      const bi = PRICING_PROVIDER_ORDER.indexOf(b);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.localeCompare(b);
    }).map(([provider, routes]) => {
      const hasNumeric = routes.some(({ rates }) => rates.some((rate) => rate.kind !== "usage"));
      const defaultOpen = !opened && hasNumeric;
      if (defaultOpen) opened = true;
      const tokenRoutes = routes.filter(({ rates }) => isTokenRoute(rates));
      const hasCachedInput = tokenRoutes.some(({ rates }) => rates.some((rate) =>
        /^Cached input/.test(rate.conditions ?? "") || /cache-write/i.test(rate.conditions ?? "")));
      const ordinaryRoutes = routes.filter((route) => !tokenRoutes.includes(route));
      const imageRoutes = ordinaryRoutes.map((route) => {
        const image = category === "images" ? groupImageTiers(route.rates) : { remaining: route.rates, groups: [] };
        return { ...route, image, resolution: groupResolutionTiers(image.remaining) };
      });
      const ordinaryRows = imageRoutes.flatMap(({ model, rates: originalRates, resolution }) => {
        const rates = resolution.remaining;
        const name = `[${tableCell(displayTitle(model))}](/${model.page})`;
        const modelId = `\`${model.id}\``;
        if (!originalRates.length) return [{ name, modelId, option: "-", credits: copy.unavailable, kind: "unavailable", unit: "" }];
        return groupRates(rates, locale).map((group) => {
          const rate = group.rates[0];
          const unit = tableCell(formatUnit(rate.unit, locale));
          const credits = rate.kind === "usage" ? `${copy.variable}<br />${unit}` : `${formatAmount(rate.credits!)} / ${unit}`;
          return { name, modelId, option: compactOptions(group.options), credits, kind: rate.kind, unit: rate.unit };
        });
      });
      const renderOrdinaryRows = (items: typeof ordinaryRows, hasOptions: boolean) => {
        if (!items.length) return "";
        const options = items.map((item) => item.option).filter((option) => option !== "-");
        const optionHeader = options.every((option) => /^(\d+(?:p|K)|\d+ × \d+)$/.test(option)) ? copy.resolution
          : options.every((option) => /^\d+s$/.test(option)) ? copy.duration : copy.option;
        const header = `| ${copy.model} | ${copy.modelId} | ${hasOptions ? `${optionHeader} | ` : ""}${copy.credits} |`;
        const separator = `| --- | --- | ${hasOptions ? "--- | " : ""}---: |`;
        const body = items.map((item) => `| ${item.name} | ${item.modelId} | ${hasOptions ? `${tableCell(item.option)} | ` : ""}${item.credits} |`).join("\n");
        return `${header}\n${separator}\n${body}`;
      };
      const ordinaryGroups = new Map<string, typeof ordinaryRows>();
      for (const row of ordinaryRows) {
        const title = row.kind === "usage" ? copy.usageRates
          : row.kind === "unavailable" ? copy.unavailable
          : copy.ratesPer(formatUnit(row.unit, locale));
        const group = ordinaryGroups.get(title) ?? [];
        group.push(row);
        ordinaryGroups.set(title, group);
      }
      const textToImage = formatOption("Text to image", locale);
      const imageEdit = formatOption("Edit", locale);
      const imageRequestSources = ordinaryRows.filter((row) => {
        if (row.unit !== "per request" || row.kind === "unavailable") return false;
        const options = row.option.split(/<br\s*\/?\s*>/).map((option) => option.trim());
        return options.every((option) => option === textToImage || option === imageEdit
          || (option.startsWith(`${imageEdit} · `)
            && option.slice(imageEdit.length + 3).split(" / ").every((size) => ["1K", "2K", "4K"].includes(size))));
      });
      const imageRequestByModel = new Map<string, { name: string; rows: typeof imageRequestSources; values: Map<string, string> }>();
      const imageRequestOptions = new Set<string>();
      for (const row of imageRequestSources) {
        const modelId = row.modelId.slice(1, -1);
        const model = imageRequestByModel.get(modelId) ?? { name: row.name, rows: [], values: new Map<string, string>() };
        const options = row.option.split(/<br\s*\/?\s*>/).map((option) => option.trim());
        if (options.some((option) => model.values.has(option) && model.values.get(option) !== row.credits)) continue;
        options.forEach((option) => {
          model.values.set(option, row.credits);
          imageRequestOptions.add(option);
        });
        model.rows.push(row);
        imageRequestByModel.set(modelId, model);
      }
      const requestOptionOrder = (option: string) => option === textToImage ? 0
        : option === imageEdit ? 1
        : option.includes("1K") || option.includes("2K") ? 2 : 3;
      const requestColumns = [...imageRequestOptions].sort((a, b) => requestOptionOrder(a) - requestOptionOrder(b) || a.localeCompare(b));
      const imageRequestModels = [...imageRequestByModel].filter(([, model]) => model.values.size > 1);
      const imageRequestPivotRows = new Set(imageRequestModels.flatMap(([, model]) => model.rows));
      const imageRequestTable = category === "images" && imageRequestModels.length
        ? `| ${copy.model} | ${copy.modelId} | ${requestColumns.map((option) => `${tableCell(option)} ${copy.credits}`).join(" | ")} |\n| --- | --- | ${requestColumns.map(() => "---:").join(" | ")} |\n${imageRequestModels.map(([modelId, model]) => `| ${model.name} | \`${modelId}\` | ${requestColumns.map((option) => model.values.get(option) ?? "-").join(" | ")} |`).join("\n")}`
        : "";

      const kreaModes = ["moodboards", "style_references", "text"].map((mode) => formatOption(`feature=${mode}`, locale));
      const kreaSourceRows = category === "images" ? ordinaryRows.filter((row) =>
        row.modelId.includes("krea/krea-2") && row.unit === "per generation" && kreaModes.includes(row.option)) : [];
      const kreaModelIds = [...new Set(kreaSourceRows.map((row) => row.modelId))];
      const kreaMatrixModels = kreaModelIds.flatMap((modelId) => {
        const rows = kreaSourceRows.filter((row) => row.modelId === modelId);
        if (rows.length !== kreaModes.length || new Set(rows.map((row) => row.option)).size !== kreaModes.length) return [];
        return [{ modelId, name: rows[0].name, rows }];
      });
      const kreaPivotRows = new Set(kreaMatrixModels.flatMap((model) => model.rows));
      const kreaTable = kreaMatrixModels.length
        ? `| ${copy.model} | ${copy.modelId} | ${kreaModes.map((mode) => `${tableCell(mode)} ${copy.credits}`).join(" | ")} |\n| --- | --- | ---: | ---: | ---: |\n${kreaMatrixModels.map(({ modelId, name, rows }) => `| ${name} | ${modelId} | ${kreaModes.map((mode) => rows.find((row) => row.option === mode)?.credits ?? "-").join(" | ")} |`).join("\n")}`
        : "";

      const pivotedOrdinaryRows = new Set([...imageRequestPivotRows, ...kreaPivotRows]);
      for (const [title, rows] of ordinaryGroups) {
        const remaining = rows.filter((row) => !pivotedOrdinaryRows.has(row));
        if (remaining.length) ordinaryGroups.set(title, remaining);
        else ordinaryGroups.delete(title);
      }
      const imageOperationTitles = new Set([
        "per request", "per generation", "per image", "per output image",
      ].map((unit) => copy.ratesPer(formatUnit(unit, locale))));
      const imageOperationGroups = [...ordinaryGroups].filter(([title]) => imageOperationTitles.has(title));
      if (category === "images" && imageOperationGroups.length > 1) {
        const merged = new Map<string, typeof ordinaryRows>();
        let addedImageOperationGroup = false;
        for (const [title, rows] of ordinaryGroups) {
          if (imageOperationTitles.has(title)) {
            if (!addedImageOperationGroup) {
              merged.set(copy.imageOperationRates, imageOperationGroups.flatMap(([, groupedRows]) => groupedRows));
              addedImageOperationGroup = true;
            }
          } else merged.set(title, rows);
        }
        ordinaryGroups.clear();
        for (const [title, rows] of merged) ordinaryGroups.set(title, rows);
      }
      const audioDurationTitles = new Set([
        copy.ratesPer(formatUnit("per minute", locale)),
        copy.ratesPer(formatUnit("per second", locale)),
      ]);
      const audioDurationGroups = [...ordinaryGroups].filter(([title]) => audioDurationTitles.has(title));
      if (category === "audio" && audioDurationGroups.length > 1) {
        const merged = new Map<string, typeof ordinaryRows>();
        let addedDurationGroup = false;
        for (const [title, rows] of ordinaryGroups) {
          if (audioDurationTitles.has(title)) {
            if (!addedDurationGroup) {
              merged.set(copy.durationRates, audioDurationGroups.flatMap(([, groupedRows]) => groupedRows));
              addedDurationGroup = true;
            }
          } else merged.set(title, rows);
        }
        ordinaryGroups.clear();
        for (const [title, rows] of merged) ordinaryGroups.set(title, rows);
      }
      const seedanceIds = new Set([
        "byteplus/dreamina-seedance-2-0-260128",
        "byteplus/dreamina-seedance-2-5-260628",
      ]);
      const seedanceOperationLabels = [formatOption("Image to video", locale), formatOption("Text to video", locale)];
      const seedanceRows = category === "video" && provider === "WaveSpeed"
        ? ordinaryRows.filter((row) => seedanceIds.has(row.modelId.slice(1, -1)) && seedanceOperationLabels.includes(row.option))
        : [];
      const seedancePivot = [...seedanceIds].flatMap((id) => {
        const rows = seedanceRows.filter((row) => row.modelId === `\`${id}\``);
        const [image, text] = seedanceOperationLabels.map((label) => rows.filter((row) => row.option === label));
        if (image.length !== 1 || text.length !== 1 || image[0].credits !== text[0].credits
          || image[0].unit !== "per request" || text[0].unit !== "per request") return [];
        return [{ modelId: `\`${id}\``, name: image[0].name, image: image[0].credits, text: text[0].credits }];
      });
      if (seedancePivot.length === seedanceIds.size) {
        const pivoted = new Set(seedanceRows);
        for (const [title, rows] of ordinaryGroups) {
          const remaining = rows.filter((row) => !pivoted.has(row));
          if (remaining.length) ordinaryGroups.set(title, remaining);
          else ordinaryGroups.delete(title);
        }
      }
      const tokenRows = tokenRoutes.map(({ model, rates }) =>
        `| [${tableCell(displayTitle(model))}](/${model.page}) | \`${model.id}\` | ${hasCachedInput ? `${tokenPriceCell(rates, "cached", locale)} | ` : ""}${tokenPriceCell(rates, "input", locale)} | ${tokenPriceCell(rates, "output", locale)} |`,
      ).join("\n");
      const imageRows = imageRoutes.flatMap(({ model, image }) => {
        let firstRow = true;
        let previousOperation = "";
        return image.groups.map((group) => {
          const values = ["1K", "2K", "4K"].map((size) => {
            const rate = group.tiers.get(size);
            return !rate ? "-" : rate.kind === "usage" ? copy.variable : `${formatAmount(rate.credits!)} / ${formatUnit(rate.unit, locale)}`;
          });
          const operation = formatOption(group.operation, locale);
          const quality = formatOption(`quality=${group.quality}`, locale);
          const name = firstRow ? `[${tableCell(displayTitle(model))}](/${model.page})` : "";
          const modelId = firstRow ? `\`${model.id}\`` : "";
          const operationCell = operation === previousOperation ? "" : tableCell(operation);
          firstRow = false;
          previousOperation = operation;
          return `| ${name} | ${modelId} | ${operationCell} | ${tableCell(quality)} | ${values.join(" | ")} |`;
        });
      }).flat().join("\n");
      const resolutionGroups = imageRoutes.flatMap(({ model, resolution }) => {
        const options = [...new Set(resolution.groups.map((group) => formatOption(group.conditions, locale)))];
        const onlyOperation = options.length === 1 && [formatOption("Text to video", locale), formatOption("Text-to-video", locale), "-"].includes(options[0]);
        const putModeInName = model.id === "pruna/p-video-2";
        return resolution.groups.map((group) => ({
          model,
          group,
          option: onlyOperation || putModeInName ? "-" : formatOption(group.conditions, locale),
        }));
      });
      // Different model families can expose unrelated size bands under one provider.
      // Keep their matrices compact without reverting all of that provider's rows.
      const resolutionTables: Array<{
        unit: string;
        optionHeader: string;
        columns: Set<string>;
        rows: typeof resolutionGroups;
      }> = [];
      for (const row of resolutionGroups) {
        const { group } = row;
        const unit = group.tiers.values().next().value!.rate.unit;
        const optionHeader = row.option === "-" ? copy.option
          : group.conditions.includes("draft=") ? copy.mode
          : /generate_?Audio=|generate_audio=/.test(group.conditions) ? copy.audio
          : group.conditions.includes("video_type=") ? copy.inputType
          : group.conditions.includes("type=") ? copy.type : copy.option;
        const columns = [...group.tiers.keys()];
        const table = resolutionTables.find((candidate) =>
          candidate.unit === unit && candidate.optionHeader === optionHeader
          && columns.some((column) => candidate.columns.has(column))
          && new Set([...candidate.columns, ...columns]).size <= MAX_RESOLUTION_COLUMNS,
        );
        if (table) {
          columns.forEach((column) => table.columns.add(column));
          const matchingRow = table.rows.find((candidate) =>
            candidate.model.id === row.model.id && candidate.group.conditions === group.conditions
            && [...group.tiers].every(([label, { rate }]) => {
              const existing = candidate.group.tiers.get(label)?.rate;
              return !existing || (existing.kind === rate.kind && existing.price_usd === rate.price_usd && existing.credits === rate.credits);
            }),
          );
          if (matchingRow) {
            for (const [label, tier] of group.tiers) {
              const existing = matchingRow.group.tiers.get(label);
              if (existing) existing.sources.push(...tier.sources);
              else matchingRow.group.tiers.set(label, tier);
            }
          } else table.rows.push(row);
        } else {
          resolutionTables.push({ unit, optionHeader, columns: new Set(columns), rows: [row] });
        }
      }
      // A narrow, disjoint band can share a matrix when the combined table stays
      // compact. Preserve a specific variant label when the other table has none.
      for (let left = 0; left < resolutionTables.length; left++) {
        for (let right = left + 1; right < resolutionTables.length; right++) {
          const candidate = resolutionTables[left];
          const other = resolutionTables[right];
          const columns = new Set([...candidate.columns, ...other.columns]);
          const overlaps = [...candidate.columns].some((column) => other.columns.has(column));
          if (candidate.unit !== other.unit || candidate.optionHeader !== other.optionHeader
            || overlaps || columns.size > MAX_RESOLUTION_COLUMNS) continue;
          candidate.columns = columns;
          candidate.rows.push(...other.rows);
          resolutionTables.splice(right, 1);
          right--;
        }
      }
      const resolutionTablesText = resolutionTables.map((table) => {
        const columns = [...table.columns].sort(resolutionOrder);
        const hasOptions = table.rows.some(({ option }) => option !== "-");
        let previousModelName = "";
        const matrixRows = table.rows.map(({ model, group, option }) => {
          const values = columns.map((label) => {
            const rate = group.tiers.get(label)?.rate;
            return !rate ? "-" : rate.kind === "usage" ? copy.variable : `${formatAmount(rate.credits!)} / ${formatUnit(rate.unit, locale)}`;
          });
          const modeSuffix = model.id === "pruna/p-video-2" ? ` ${formatOption(group.conditions, locale)}` : "";
          const modelName = `${displayTitle(model)}${modeSuffix}`;
          const name = modelName === previousModelName ? "" : `[${tableCell(modelName)}](/${model.page})`;
          const modelId = modelName === previousModelName ? "" : `\`${model.id}\``;
          previousModelName = modelName;
          return `| ${name} | ${modelId} | ${hasOptions ? `${tableCell(option)} | ` : ""}${values.join(" | ")} |`;
        }).join("\n");
        return { unit: table.unit, table: `| ${copy.model} | ${copy.modelId} | ${hasOptions ? `${table.optionHeader} | ` : ""}${columns.map((label) => `${label} ${copy.credits}`).join(" | ")} |\n| --- | --- | ${hasOptions ? "--- | " : ""}${columns.map(() => "---:").join(" | ")} |\n${matrixRows}` };
      });
      const tableSections: Array<{ title: string; body: string }> = [];
      if (seedancePivot.length === seedanceIds.size) {
        tableSections.push({
          title: copy.ratesPer(formatUnit("per request", locale)),
          body: `| ${copy.model} | ${copy.modelId} | ${seedanceOperationLabels[0]} ${copy.credits} | ${seedanceOperationLabels[1]} ${copy.credits} |\n| --- | --- | ---: | ---: |\n${seedancePivot.map((row) => `| ${row.name} | ${row.modelId} | ${row.image} | ${row.text} |`).join("\n")}`,
        });
      }
      if (tokenRows) {
        tableSections.push({
          title: copy.tokenRates,
          body: `| ${copy.model} | ${copy.modelId} | ${hasCachedInput ? `${copy.cached} / ${formatUnit("per 1M tokens", locale)} | ` : ""}${copy.input} / ${formatUnit("per 1M tokens", locale)} | ${copy.output} / ${formatUnit("per 1M tokens", locale)} |\n| --- | --- | ${hasCachedInput ? "---: | " : ""}---: | ---: |\n${tokenRows}`,
        });
      }
      const resolutionGroupsByUnit = new Map<string, string[]>();
      for (const table of resolutionTablesText) {
        const group = resolutionGroupsByUnit.get(table.unit) ?? [];
        group.push(table.table);
        resolutionGroupsByUnit.set(table.unit, group);
      }
      for (const [unit, tables] of resolutionGroupsByUnit) {
        const title = unit === "per resolution" ? copy.resolution : copy.byResolution(formatUnit(unit, locale));
        tableSections.push({ title, body: tables.join("\n\n") });
      }
      for (const [title, rows] of ordinaryGroups) {
        const hasOptions = rows.some((row) => row.option !== "-");
        const ordinaryBody = renderOrdinaryRows(rows, hasOptions);
        const body = title === copy.imageOperationRates
          ? [imageRequestTable, ordinaryBody].filter(Boolean).join("\n\n")
          : ordinaryBody;
        tableSections.push({ title, body });
      }
      if (imageRequestTable && !ordinaryGroups.has(copy.imageOperationRates)) {
        tableSections.push({ title: copy.imageOperationRates, body: imageRequestTable });
      }
      if (kreaTable) tableSections.push({ title: copy.kreaGenerationRates, body: kreaTable });
      if (imageRows) {
        tableSections.push({
          title: copy.imageTiers,
          body: `| ${copy.model} | ${copy.modelId} | ${copy.operation} | ${copy.quality} | 1K ${copy.credits} | 2K ${copy.credits} | 4K ${copy.credits} |\n| --- | --- | --- | --- | ---: | ---: | ---: |\n${imageRows}`,
        });
      }
      const hasSubgroups = tableSections.length > 1;
      const tables = tableSections.map(({ title, body }) => `${hasSubgroups ? `#### ${title}\n\n` : ""}${body}`).join("\n\n");
      const durationNote = routes.some(({ model }) => model.id === "minimax/minimax-h3") ? `${copy.videoDuration}\n\n` : "";
      return `<Accordion title="${provider}"${defaultOpen ? " defaultOpen" : ""}>\n\n${durationNote}${tables}\n</Accordion>`;
    }).join("\n\n");
    return `<Tab title="${copy.categories[category]}">\n\n<AccordionGroup>\n\n${sections}\n\n</AccordionGroup>\n\n</Tab>`;
  }).join("\n\n");
  return `---
title: "${copy.title}"
sidebarTitle: "${copy.sidebar}"
description: "${copy.description}"
mode: "wide"
---

{/* Generated pricing page. */}

${copy.intro}

<Tabs>

${tabs}

</Tabs>

${copy.status}

${copy.updated}: ${formatDate(data.snapshot_at, locale)}.
`;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const output = render();
  if (check) {
    if (!existsSync(OUTPUT_FILE) || readFileSync(OUTPUT_FILE, "utf8") !== output) {
      console.error(`${OUTPUT_FILE}: stale or missing, run pnpm router-pricing:gen`);
      process.exit(1);
    }
    console.log("router pricing page is fresh");
  } else {
    writeFileSync(OUTPUT_FILE, output);
    console.log(`wrote ${OUTPUT_FILE}`);
  }
}

export { compactOptions, groupImageTiers, groupResolutionTiers, groupRates, loadCatalog, loadMetronomeData, render, validateCreditConversion };
