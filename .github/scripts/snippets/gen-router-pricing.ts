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

type PricingCurrency = "credits" | "usd";

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

function compareModelVersions(left: CatalogModel, right: CatalogModel): number {
  const parse = (model: CatalogModel) => {
    const title = displayTitle(model);
    const match = title.match(/^(.*?)(\d+(?:\.\d+)*)(.*)$/);
    return match
      ? { family: match[1].trim(), version: match[2].split(".").map(Number), suffix: match[3].trim() }
      : { family: title, version: [], suffix: "" };
  };
  const a = parse(left);
  const b = parse(right);
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  const familyOrder = collator.compare(a.family, b.family);
  if (familyOrder) return familyOrder;
  for (let index = 0; index < Math.max(a.version.length, b.version.length); index++) {
    const versionOrder = (b.version[index] ?? 0) - (a.version[index] ?? 0);
    if (versionOrder) return versionOrder;
  }
  return collator.compare(a.suffix, b.suffix);
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

function formatPriceUnit(unit: string, locale: PricingLocale): string {
  return unit === "per second" ? "s" : formatUnit(unit, locale);
}

function priceWithoutUnit(value: string, unit: string, locale: PricingLocale): string {
  const suffix = ` / ${formatUnit(unit, locale)}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8,
  }).format(value);
}

function formatRateAmount(rate: MetronomeRate, currency: PricingCurrency, creditsPerUsd: number): string {
  if (currency === "credits") return formatAmount(rate.credits!);
  return formatUsd(Number(rate.price_usd ?? Number(rate.credits!) / creditsPerUsd));
}

function isTokenRoute(rates: MetronomeRate[]): boolean {
  const tokenCondition = /^(?:(?:Input|Output) (?:text|audio|image|video) tokens|Cached input(?: (?:text|audio|image|video))? tokens|Cache-write input text tokens|(?:5-minute|1-hour) cache-write input tokens|Reasoning tokens)$/;
  return rates.length > 0 && rates.every((rate) => rate.kind !== "usage" && rate.unit === "per 1M tokens" && tokenCondition.test(rate.conditions ?? ""));
}

function tokenPriceCell(rates: MetronomeRate[], direction: "input" | "output" | "cached", locale: PricingLocale, currency: PricingCurrency, creditsPerUsd: number): string {
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
    const amount = formatRateAmount(rate, currency, creditsPerUsd);
    const group = groups.get(amount) ?? [];
    group.push(rate);
    groups.set(amount, group);
  }
  const baseline = selected.find((rate) => rate.conditions === (direction === "input" ? "Input text tokens" : direction === "output" ? "Output text tokens" : "Cached input text tokens"))
    ?? (direction === "cached" ? selected.find((rate) => rate.conditions === "Cached input tokens") : undefined)
    ?? (groups.size === 1 ? selected[0] : undefined);
  const primary = baseline ? formatRateAmount(baseline, currency, creditsPerUsd) : undefined;
  const localeIndex = ["en", "ja", "zh", "ko"].indexOf(locale);
  const hasCachedWrite = direction === "cached" && selected.some((rate) =>
    /cache-write|^(?:5-minute|1-hour)/i.test(rate.conditions ?? ""));
  const label = (condition: string) => {
    if (/^Cached input/.test(condition)) return hasCachedWrite ? ["Read", "読み取り", "读取", "읽기"][localeIndex] : "";
    if (condition === "Input text tokens" || condition === "Output text tokens") return ["Text", "テキスト", "文本", "텍스트"][localeIndex];
    const modality = condition.match(/^(?:Input|Output|Cached input) (text|audio|image|video) tokens$/)?.[1];
    const labels: Record<string, string[]> = {
      text: ["Text", "テキスト", "文本", "텍스트"],
      audio: ["Audio", "音声", "音频", "오디오"],
      image: ["Image", "画像", "图像", "이미지"],
      video: ["Video", "動画", "视频", "동영상"],
    };
    if (modality) return labels[modality][localeIndex];
    if (condition.startsWith("5-minute")) return ["Write (5m)", "書き込み（5 分）", "写入（5 分钟）", "쓰기(5분)"][localeIndex];
    if (condition.startsWith("1-hour")) return ["Write (1h)", "書き込み（1 時間）", "写入（1 小时）", "쓰기(1시간)"][localeIndex];
    if (condition.startsWith("Cache-write")) return ["Write", "書き込み", "写入", "쓰기"][localeIndex];
    if (condition === "Reasoning tokens") return ["Reasoning", "推論", "推理", "추론"][localeIndex];
    return formatOption(condition, locale);
  };
  const ordered = [...groups].sort(([a], [b]) => a === primary ? -1 : b === primary ? 1 : 0);
  return ordered.map(([amount, group]) => {
    const groupLabels = [...new Set(group.map((rate) => label(rate.conditions ?? "")).filter(Boolean))];
    const labels = group.some((rate) => rate.conditions === "Reasoning tokens")
      ? groupLabels.filter((value) => value !== "Text") : groupLabels;
    const prefix = labels.length ? `${tableCell(labels.join(" / "))}: ` : "";
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

function renderCurrencyView(locale: PricingLocale, currency: PricingCurrency): string {
  const models = loadCatalog();
  const data = loadMetronomeData();
  const baseCopy = pricingCopy[locale];
  const replaceCreditLabel = (value: string) => value.replace(new RegExp(baseCopy.credits, "gi"), "USD");
  const replaceTokenCreditLabel = (value: string) => value.replace(new RegExp(baseCopy.credits, "gi"), (match, offset: number, source: string) =>
    offset > 0 && /\s/.test(source[offset - 1]) ? "USD" : " USD");
  const copy = currency === "usd" ? {
    ...baseCopy,
    credits: "USD",
    input: replaceTokenCreditLabel(baseCopy.input),
    cached: replaceTokenCreditLabel(baseCopy.cached),
    output: replaceTokenCreditLabel(baseCopy.output),
    kreaGenerationRates: replaceCreditLabel(baseCopy.kreaGenerationRates),
  } : baseCopy;
  const amount = (rate: MetronomeRate) => formatRateAmount(rate, currency, data.credits_per_usd);
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
      const tokenRoutes = routes.filter(({ rates }) => isTokenRoute(rates))
        .sort((left, right) => compareModelVersions(left.model, right.model));
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
          const priceUnit = tableCell(formatPriceUnit(rate.unit, locale));
          const credits = rate.kind === "usage" ? `${copy.variable}<br />${unit}` : `${amount(rate)} / ${priceUnit}`;
          const omitNonPricingOption = model.id === "bria/video-edit-erase"
            && group.options.includes(formatOption("Input duration, capped at 5 seconds per request", locale))
            || model.id === "bria/fibo";
          const option = omitNonPricingOption ? "-" : compactOptions(group.options);
          return { name, modelId, option, credits, kind: rate.kind, unit: rate.unit };
        });
      });
      const renderOrdinaryRows = (items: typeof ordinaryRows, hasOptions: boolean, headerUnit?: string) => {
        if (!items.length) return "";
        const options = items.map((item) => item.option).filter((option) => option !== "-");
        const klingV3OptionRows = items.filter((item) => item.modelId === "`kling/kling-v3`" && item.option !== "-");
        const moveKlingOptionIntoName = klingV3OptionRows.length === 1
          && items.every((item) => item.option === "-" || item.modelId === "`kling/kling-v3`");
        const omitLumaReferenceOption = items.length > 0 && items.every((item) =>
          item.modelId.startsWith("`luma_2/") && item.unit === "per reference image"
          && item.option === formatOption("Each supplied reference image", locale));
        const showOptions = hasOptions && !moveKlingOptionIntoName && !omitLumaReferenceOption;
        const optionHeader = options.every((option) => /^(\d+(?:p|K)|\d+ × \d+)$/.test(option)) ? copy.resolution
          : options.every((option) => /^\d+s$/.test(option)) ? copy.duration : copy.option;
        const creditsHeader = headerUnit ? `${copy.credits} / ${formatUnit(headerUnit, locale)}` : copy.credits;
        const header = `| ${copy.model} | ${copy.modelId} | ${showOptions ? `${optionHeader} | ` : ""}${creditsHeader} |`;
        const separator = `| --- | --- | ${showOptions ? "--- | " : ""}---: |`;
        const body = items.map((item) => {
          const oneImagePerGeneration = item.unit === "per image"
            && ["wan/wan2.5-i2i-preview", "wan/wan2.5-t2i-preview"].includes(item.modelId.slice(1, -1));
          const unitCanBeShortened = headerUnit === item.unit
            || (headerUnit === "per generation" && (item.unit === "per request" || oneImagePerGeneration));
          const credits = headerUnit && unitCanBeShortened && item.kind !== "usage"
            ? priceWithoutUnit(item.credits, item.unit, locale)
            : item.credits;
          const name = moveKlingOptionIntoName && item.modelId === "`kling/kling-v3`"
            ? item.name.replace("](", ` ${tableCell(item.option)}](`) : item.name;
          return `| ${name} | ${item.modelId} | ${showOptions ? `${tableCell(item.option)} | ` : ""}${credits} |`;
        }).join("\n");
        return `${header}\n${separator}\n${body}`;
      };
      const renderImageOperationMatrix = (items: typeof ordinaryRows) => {
        // Image outputs are generations for pricing display. Keep reference/input-image
        // units separate; they are not generated outputs.
        const unitForRow = (row: (typeof ordinaryRows)[number]) =>
          ["per request", "per generation", "per image", "per output image"].includes(row.unit)
            ? "per generation" : row.unit;
        const supportedUnits = ["per generation"];
        const columns = supportedUnits.filter((unit) => items.some((row) => unitForRow(row) === unit));
        const byModel = new Map<string, { name: string; values: Map<string, string>; rows: typeof ordinaryRows; conflicted: boolean }>();
        for (const row of items) {
          const unit = unitForRow(row);
          if (!columns.includes(unit)) continue;
          const model = byModel.get(row.modelId) ?? { name: row.name, values: new Map<string, string>(), rows: [], conflicted: false };
          const amount = row.kind === "usage" ? row.credits : priceWithoutUnit(row.credits, row.unit, locale);
          const previous = model.values.get(unit);
          if (previous && previous !== amount) model.conflicted = true;
          else model.values.set(unit, amount);
          model.rows.push(row);
          byModel.set(row.modelId, model);
        }
        const matrixModels = [...byModel].filter(([, model]) => !model.conflicted);
        const fallbackIds = new Set([...byModel].filter(([, model]) => model.conflicted).map(([modelId]) => modelId));
        const table = matrixModels.length
          ? `| ${copy.model} | ${copy.modelId} | ${columns.map((unit) => `${copy.credits} / ${formatUnit(unit, locale)}`).join(" | ")} |\n| --- | --- | ${columns.map(() => "---:").join(" | ")} |\n${matrixModels.map(([modelId, model]) => `| ${model.name} | ${modelId} | ${columns.map((unit) => model.values.get(unit) ?? "-").join(" | ")} |`).join("\n")}`
          : "";
        const fallbackRows = items.filter((row) => fallbackIds.has(row.modelId));
        return [table, fallbackRows.length ? renderOrdinaryRows(fallbackRows, true) : ""].filter(Boolean).join("\n\n");
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
      const durationSourceRows = category === "video" ? ordinaryRows.filter((row) =>
        row.unit === "per request" && row.kind !== "unavailable" && /^\d+(?:\.\d+)?s$/.test(row.option)) : [];
      const durationByModel = new Map<string, { name: string; rows: typeof durationSourceRows; values: Map<string, string> }>();
      const durationOptions = new Set<string>();
      for (const row of durationSourceRows) {
        const modelId = row.modelId.slice(1, -1);
        const model = durationByModel.get(modelId) ?? { name: row.name, rows: [], values: new Map<string, string>() };
        if (model.values.has(row.option) && model.values.get(row.option) !== row.credits) continue;
        model.values.set(row.option, row.credits);
        model.rows.push(row);
        durationOptions.add(row.option);
        durationByModel.set(modelId, model);
      }
      const durationColumns = [...durationOptions].sort((a, b) =>
        Number(a.slice(0, -1)) - Number(b.slice(0, -1)));
      const durationModels = [...durationByModel].filter(([, model]) => model.values.size > 1);
      const durationPivotRows = new Set(durationModels.flatMap(([, model]) => model.rows));
      const durationTitle = copy.ratesPer(formatUnit("per request", locale));
      const durationRequestTable = durationModels.length
        ? `| ${copy.model} | ${copy.modelId} | ${durationColumns.map((duration) => `${duration} ${copy.credits} / ${formatUnit("per request", locale)}`).join(" | ")} |\n| --- | --- | ${durationColumns.map(() => "---:").join(" | ")} |\n${durationModels.map(([modelId, model]) => `| ${model.name} | \`${modelId}\` | ${durationColumns.map((duration) => priceWithoutUnit(model.values.get(duration) ?? "-", "per request", locale)).join(" | ")} |`).join("\n")}`
        : "";
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
        ? `| ${copy.model} | ${copy.modelId} | ${requestColumns.map((option) => `${tableCell(option)} ${copy.credits} / ${formatUnit("per generation", locale)}`).join(" | ")} |\n| --- | --- | ${requestColumns.map(() => "---:").join(" | ")} |\n${imageRequestModels.map(([modelId, model]) => `| ${model.name} | \`${modelId}\` | ${requestColumns.map((option) => priceWithoutUnit(model.values.get(option) ?? "-", "per request", locale)).join(" | ")} |`).join("\n")}`
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
        ? `| ${copy.model} | ${copy.modelId} | ${kreaModes.map((mode) => `${tableCell(mode)} ${copy.credits}`).join(" | ")} |\n| --- | --- | ---: | ---: | ---: |\n${kreaMatrixModels.map(({ modelId, name, rows }) => `| ${name} | ${modelId} | ${kreaModes.map((mode) => {
          const credits = rows.find((row) => row.option === mode)?.credits;
          return credits ? priceWithoutUnit(credits, "per generation", locale) : "-";
        }).join(" | ")} |`).join("\n")}`
        : "";

      const renderRateOptionMatrix = (
        sourceRows: typeof ordinaryRows,
        title: string,
        columns: Array<{ key: string; label: string }>,
        unit: string,
        unitLabel: string,
        columnKeys: (option: string) => string[],
      ) => {
        const byModel = new Map<string, { name: string; cells: Map<string, string>; rows: typeof ordinaryRows; hasConflict: boolean }>();
        for (const row of sourceRows) {
          const keys = columnKeys(row.option);
          if (!keys.length) continue;
          const model = byModel.get(row.modelId) ?? { name: row.name, cells: new Map<string, string>(), rows: [], hasConflict: false };
          const amount = priceWithoutUnit(row.credits, unit, locale);
          for (const key of keys) {
            const existing = model.cells.get(key);
            if (existing && existing !== amount) model.hasConflict = true;
            else model.cells.set(key, amount);
          }
          model.rows.push(row);
          byModel.set(row.modelId, model);
        }
        const available = [...byModel].filter(([, model]) => !model.hasConflict && model.cells.size > 0);
        const consumedRows = new Set(available.flatMap(([, model]) => model.rows));
        const table = available.length
          ? `| ${copy.model} | ${copy.modelId} | ${columns.map(({ label }) => `${tableCell(label)} ${copy.credits} / ${unitLabel}`).join(" | ")} |\n| --- | --- | ${columns.map(() => "---:").join(" | ")} |\n${available.map(([modelId, model]) => `| ${model.name} | ${modelId} | ${columns.map(({ key }) => model.cells.get(key) ?? "-").join(" | ")} |`).join("\n")}`
          : "";
        return { title, table, consumedRows };
      };
      const qwenImageIds = new Set(["qwen/qwen-image-3.0", "qwen/qwen-image-3.0-pro"]);
      const qwenOutputRows = category === "images" && provider === "Comfy"
        ? ordinaryRows.filter((row) => qwenImageIds.has(row.modelId.slice(1, -1)) && row.unit === "per output image")
        : [];
      const qwenOutputMatrix = renderRateOptionMatrix(qwenOutputRows, copy.qwenImageRates,
        ["1K", "2K"].map((size) => ({ key: size, label: size })),
        "per output image", formatUnit("per generation", locale),
        (option) => option.split(" · ").at(-1)?.split(" / ").filter((size) => ["1K", "2K"].includes(size)) ?? []);

      const seedreamId = "byteplus/seedream-5-0-pro-260628";
      const seedreamOutputRows = category === "images" && provider === "Comfy"
        ? ordinaryRows.filter((row) => row.modelId === `\`${seedreamId}\`` && row.unit === "per output image")
        : [];
      const seedreamOperations = [formatOption("Layer decomposition", locale), formatOption("Output image", locale)];
      const seedreamSizes = [formatOption("output_tier=standard", locale), formatOption("output_tier=large", locale)];
      const seedreamColumns = seedreamOperations.flatMap((operation) => seedreamSizes.map((size) => ({
        key: `${operation} · ${size}`,
        label: `${operation} · ${size}`,
      })));
      const seedreamOutputMatrix = renderRateOptionMatrix(seedreamOutputRows, copy.seedreamProRates, seedreamColumns,
        "per output image", formatUnit("per generation", locale),
        (option) => seedreamColumns.some(({ key }) => key === option) ? [option] : []);

      const lumaUniIds = new Set(["luma_2/uni-1", "luma_2/uni-1-max"]);
      const lumaUniRows = category === "images" && provider === "Comfy"
        ? ordinaryRows.filter((row) => lumaUniIds.has(row.modelId.slice(1, -1)) && row.unit === "per generation")
        : [];
      const lumaUniOperations = [formatOption("type=image", locale), formatOption("type=image_edit", locale)];
      const lumaUniMatrix = renderRateOptionMatrix(lumaUniRows, copy.lumaUniRates,
        lumaUniOperations.map((label) => ({ key: label, label })),
        "per generation", formatUnit("per generation", locale), (option) => lumaUniOperations.includes(option) ? [option] : []);

      const ideogramIds = ["ideogram/ideogram-v4", "ideogram/ideogram-v3"];
      const ideogramRows = category === "images" && provider === "Comfy"
        ? ordinaryRows.filter((row) => ideogramIds.includes(row.modelId.slice(1, -1))
          && ["per request", "per image"].includes(row.unit))
        : [];
      const ideogramQualities = ["quality=DEFAULT", "quality=QUALITY", "quality=TURBO"].map((condition) => formatOption(condition, locale));
      const ideogramModels = new Map(ideogramIds.map((modelId) => [modelId, {
        name: ideogramRows.find((row) => row.modelId === `\`${modelId}\``)?.name ?? "",
        rates: new Map<string, string>(),
      }]));
      for (const row of ideogramRows) {
        const model = ideogramModels.get(row.modelId.slice(1, -1));
        if (model && ideogramQualities.includes(row.option)) {
          model.rates.set(`${row.option}|${row.unit}`, priceWithoutUnit(row.credits, row.unit, locale));
        }
      }
      const ideogramGenerationUnit = formatUnit("per generation", locale);
      const ideogramRowsForMatrix = ideogramRows.length ? [...ideogramModels].map(([modelId, model]) => {
        const unit = modelId.endsWith("-v4") ? "per request" : "per image";
        const values = ideogramQualities.map((quality) => model.rates.get(`${quality}|${unit}`) ?? "-");
        return `| ${model.name} | \`${modelId}\` | ${values.join(" | ")} |`;
      }) : [];
      const ideogramImageMatrix = ideogramRowsForMatrix.length
        ? {
          title: copy.ideogramImageRates,
          table: `| ${copy.model} | ${copy.modelId} | ${ideogramQualities.map((quality) => `${quality} ${copy.credits} / ${ideogramGenerationUnit}`).join(" | ")} |\n| --- | --- | ${ideogramQualities.map(() => "---:").join(" | ")} |\n${ideogramRowsForMatrix.join("\n")}`,
          consumedRows: new Set(ideogramRows),
        }
        : { title: copy.ideogramImageRates, table: "", consumedRows: new Set<typeof ordinaryRows[number]>() };

      const seedanceVideoIds = new Set([
        "byteplus/dreamina-seedance-2-0-fast-260128", "byteplus/dreamina-seedance-2-0-mini",
        "byteplus/seedance-1-0-pro-250528", "byteplus/seedance-1-0-pro-fast-251015",
      ]);
      const seedanceVideoRows = category === "video" && provider === "Comfy"
        ? ordinaryRows.filter((row) => seedanceVideoIds.has(row.modelId.slice(1, -1)) && row.unit === "per 1M tokens")
        : [];
      const imageToVideo = formatOption("video_type=image-to-video", locale);
      const textToVideo = formatOption("video_type=text-to-video", locale);
      const videoToVideo = formatOption("video_type=video-to-video", locale);
      const seedanceVideoMatrix = renderRateOptionMatrix(seedanceVideoRows, copy.seedanceVideoTokenRates, [
        { key: "image-text-to-video", label: `${imageToVideo} / ${textToVideo}` },
        { key: "video-to-video", label: videoToVideo },
      ], "per 1M tokens", formatUnit("per 1M tokens", locale), (option) => {
        const options = option.split(" / ").map((value) => value.trim());
        const keys: string[] = [];
        if (options.includes(imageToVideo) || options.includes(textToVideo)) keys.push("image-text-to-video");
        if (options.includes(videoToVideo)) keys.push("video-to-video");
        return keys;
      });

      const seedanceAudioId = "byteplus/seedance-1-5-pro-251215";
      const seedanceAudioRows = category === "video" && provider === "Comfy"
        ? ordinaryRows.filter((row) => row.modelId === `\`${seedanceAudioId}\`` && row.unit === "per 1M tokens")
        : [];
      const seedanceAudioOptions = [formatOption("generate_audio=false", locale), formatOption("generate_audio=true", locale)];
      const seedanceAudioMatrix = renderRateOptionMatrix(seedanceAudioRows, copy.seedanceAudioTokenRates,
        seedanceAudioOptions.map((label) => ({ key: label, label })),
        "per 1M tokens", formatUnit("per 1M tokens", locale), (option) => seedanceAudioOptions.includes(option) ? [option] : []);

      const pivotedOrdinaryRows = new Set([
        ...durationPivotRows, ...imageRequestPivotRows, ...kreaPivotRows,
        ...qwenOutputMatrix.consumedRows, ...seedreamOutputMatrix.consumedRows,
        ...lumaUniMatrix.consumedRows, ...ideogramImageMatrix.consumedRows,
        ...seedanceVideoMatrix.consumedRows, ...seedanceAudioMatrix.consumedRows,
      ]);
      for (const [title, rows] of ordinaryGroups) {
        const remaining = rows.filter((row) => !pivotedOrdinaryRows.has(row));
        if (remaining.length) ordinaryGroups.set(title, remaining);
        else ordinaryGroups.delete(title);
      }
      const imageOperationTitles = new Set([
        "per request", "per generation", "per image", "per output image",
      ].map((unit) => copy.ratesPer(formatUnit(unit, locale))));
      const imageOperationGroups = [...ordinaryGroups].filter(([title]) => imageOperationTitles.has(title));
      if (category === "images" && imageOperationGroups.length > 0) {
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
        `| [${tableCell(displayTitle(model))}](/${model.page}) | \`${model.id}\` | ${hasCachedInput ? `${tokenPriceCell(rates, "cached", locale, currency, data.credits_per_usd)} | ` : ""}${tokenPriceCell(rates, "input", locale, currency, data.credits_per_usd)} | ${tokenPriceCell(rates, "output", locale, currency, data.credits_per_usd)} |`,
      ).join("\n");
      const imageTierRates = imageRoutes.flatMap(({ image }) => image.groups.flatMap((group) => [...group.tiers.values()]));
      const imageTierUnit = imageTierRates.length > 0
        && imageTierRates.every((rate) => rate.kind !== "usage" && rate.unit === imageTierRates[0].unit)
        && ["per request", "per generation"].includes(imageTierRates[0].unit)
        ? imageTierRates[0].unit : undefined;
      const imageRows = imageRoutes.flatMap(({ model, image }) => {
        let firstRow = true;
        let previousOperation = "";
        return image.groups.map((group) => {
          const values = ["1K", "2K", "4K"].map((size) => {
            const rate = group.tiers.get(size);
            return !rate ? "-" : rate.kind === "usage" ? copy.variable
              : imageTierUnit === rate.unit ? amount(rate) : `${amount(rate)} / ${formatPriceUnit(rate.unit, locale)}`;
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
      const higgsfieldKling4kRoute = category === "video" && provider === "Higgsfield"
        ? imageRoutes.find(({ model }) => model.id === "higgsfield/higgsfield-kling-3-4k")
        : undefined;
      const higgsfieldKling4kRate = higgsfieldKling4kRoute?.resolution.remaining.find((rate) => rate.unit === "per second");
      if (higgsfieldKling4kRoute && higgsfieldKling4kRate) {
        const tiers = new Map([[
          "4K", { rate: higgsfieldKling4kRate, sources: [higgsfieldKling4kRate] },
        ]]);
        const group = { conditions: higgsfieldKling4kRate.conditions ?? "", tiers } as typeof resolutionGroups[number]["group"];
        resolutionGroups.push({ model: higgsfieldKling4kRoute.model, group, option: "-" });
        const pivotedRows = new Set(ordinaryRows.filter((row) =>
          row.modelId === "`higgsfield/higgsfield-kling-3-4k`" && row.unit === "per second"));
        for (const [title, rows] of ordinaryGroups) {
          const remaining = rows.filter((row) => !pivotedRows.has(row));
          if (remaining.length) ordinaryGroups.set(title, remaining);
          else ordinaryGroups.delete(title);
        }
      }
      const switchxResolutionGroups = resolutionGroups.filter(({ model }) => model.id === "beeble/switchx");
      const switchxResolutions = [...new Set(switchxResolutionGroups.flatMap(({ group }) => [...group.tiers.keys()]))].sort(resolutionOrder);
      const switchxRatesByUnit = new Map<string, Map<string, string>>();
      for (const { group } of switchxResolutionGroups) {
        for (const [resolution, { rate }] of group.tiers) {
          const rates = switchxRatesByUnit.get(rate.unit) ?? new Map<string, string>();
          rates.set(resolution, amount(rate));
          switchxRatesByUnit.set(rate.unit, rates);
        }
      }
      const switchxImageRates = switchxRatesByUnit.get("per generated image");
      const switchxVideoRates = switchxRatesByUnit.get("per 30 output frames, rounded up");
      const switchxRoute = imageRoutes.find(({ model }) => model.id === "beeble/switchx");
      const switchxRateTable = switchxRoute && switchxImageRates && switchxVideoRates && switchxResolutions.length
        ? `| ${copy.model} | ${copy.modelId} | ${switchxResolutions.map((resolution) => `${resolution} ${copy.credits}`).join(" | ")} |\n| --- | --- | ${switchxResolutions.map(() => "---:").join(" | ")} |\n| [${tableCell(displayTitle(switchxRoute.model))}](/${switchxRoute.model.page}) | \`${switchxRoute.model.id}\` | ${switchxResolutions.map((resolution) => `Image: ${switchxImageRates.get(resolution) ?? "-"}<br />Video: ${switchxVideoRates.get(resolution) ?? "-"}`).join(" | ")} |`
        : "";
      const switchxResolutionRows = new Set(switchxResolutionGroups);
      // Different model families can expose unrelated size bands under one provider.
      // Keep their matrices compact without reverting all of that provider's rows.
      const resolutionTables: Array<{
        unit: string;
        optionHeader: string;
        columns: Set<string>;
        rows: typeof resolutionGroups;
      }> = [];
      for (const row of resolutionGroups.filter((candidate) => !switchxResolutionRows.has(candidate))) {
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
      const veo2Route = imageRoutes.find(({ model }) => model.id === "veo/veo-2.0-generate-001");
      const veo2Rate = veo2Route?.resolution.remaining.find((rate) => rate.unit === "per second");
      const veoTable = resolutionTables.find((table) => table.unit === "per second" && table.optionHeader === copy.audio
        && table.rows.some(({ model }) => model.id.startsWith("veo/")));
      if (category === "video" && veo2Route && veo2Rate && veoTable) {
        const otherConditions = (veo2Rate.conditions ?? "").split(";").map((part) => part.trim())
          .filter((part) => !part.startsWith("resolution=")).join("; ");
        const tiers = new Map([[
          "720p", { rate: veo2Rate, sources: [veo2Rate] },
        ]]);
        const group = { conditions: otherConditions, tiers } as typeof resolutionGroups[number]["group"];
        veoTable.columns.add("720p");
        veoTable.rows.unshift({ model: veo2Route.model, group, option: formatOption(otherConditions, locale) });
        const pivotedRows = new Set(ordinaryRows.filter((row) => row.modelId === "`veo/veo-2.0-generate-001`" && row.unit === "per second"));
        for (const [title, rows] of ordinaryGroups) {
          const remaining = rows.filter((row) => !pivotedRows.has(row));
          if (remaining.length) ordinaryGroups.set(title, remaining);
          else ordinaryGroups.delete(title);
        }
      }
      const resolutionTablesText = resolutionTables.map((table) => {
        const columns = [...table.columns].sort(resolutionOrder);
        const hasOptions = table.rows.some(({ option }) => option !== "-");
        const publicUnit = category === "images" && table.unit === "per request" ? "per generation" : table.unit;
        const unitInHeader = ["per request", "per generation", "per 1K video tokens"].includes(table.unit);
        const unitRepeatedInColumn = ["per request", "per generation"].includes(table.unit);
        let previousModelName = "";
        const matrixRows = table.rows.map(({ model, group, option }) => {
          const values = columns.map((label) => {
            const rate = group.tiers.get(label)?.rate;
            return !rate ? "-" : rate.kind === "usage" ? copy.variable
              : unitInHeader ? amount(rate) : `${amount(rate)} / ${formatPriceUnit(rate.unit, locale)}`;
          });
          const modeSuffix = model.id === "pruna/p-video-2" ? ` ${formatOption(group.conditions, locale)}` : "";
          const modelName = `${displayTitle(model)}${modeSuffix}`;
          const name = modelName === previousModelName ? "" : `[${tableCell(modelName)}](/${model.page})`;
          const modelId = modelName === previousModelName ? "" : `\`${model.id}\``;
          previousModelName = modelName;
          return `| ${name} | ${modelId} | ${hasOptions ? `${tableCell(option)} | ` : ""}${values.join(" | ")} |`;
        }).join("\n");
        const unitSuffix = unitRepeatedInColumn ? ` / ${formatUnit(publicUnit, locale)}` : "";
        return { unit: table.unit, table: `| ${copy.model} | ${copy.modelId} | ${hasOptions ? `${table.optionHeader} | ` : ""}${columns.map((label) => `${label} ${copy.credits}${unitSuffix}`).join(" | ")} |\n| --- | --- | ${hasOptions ? "--- | " : ""}${columns.map(() => "---:").join(" | ")} |\n${matrixRows}` };
      });
      const tableSections: Array<{ title: string; body: string }> = [];
      if (seedancePivot.length === seedanceIds.size) {
        tableSections.push({
          title: copy.ratesPer(formatUnit("per request", locale)),
          body: `| ${copy.model} | ${copy.modelId} | ${copy.credits} / ${formatUnit("per request", locale)} |\n| --- | --- | ---: |\n${seedancePivot.map((row) => `| ${row.name} | ${row.modelId} | ${priceWithoutUnit(row.image, "per request", locale)} |`).join("\n")}`,
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
      if (switchxRateTable) {
        tableSections.push({
          title: copy.switchxRates,
          body: `${copy.switchxBillingNote}\n\n${switchxRateTable}`,
        });
      }
      for (const [title, rows] of ordinaryGroups) {
        const hasOptions = rows.some((row) => row.option !== "-");
        const ordinaryBody = title === copy.imageOperationRates
          ? renderImageOperationMatrix(rows)
          : renderOrdinaryRows(rows, hasOptions,
            rows.length > 0 && ["per request", "per generation", ...(category === "images" ? ["per image", "per output image"] : [])].includes(rows[0].unit)
            && rows.every((row) => row.unit === rows[0].unit && row.kind !== "usage" && row.kind !== "unavailable")
              ? rows[0].unit === "per request" && category === "images" ? "per generation" : rows[0].unit
              : undefined);
        const extraTable = title === copy.imageOperationRates ? imageRequestTable
          : title === durationTitle ? durationRequestTable : "";
        const body = extraTable
          ? [extraTable, ordinaryBody].filter(Boolean).join("\n\n")
          : ordinaryBody;
        tableSections.push({ title, body });
      }
      if (imageRequestTable && !ordinaryGroups.has(copy.imageOperationRates)) {
        tableSections.push({ title: copy.imageOperationRates, body: imageRequestTable });
      }
      if (durationRequestTable && !ordinaryGroups.has(durationTitle)) {
        tableSections.push({ title: durationTitle, body: durationRequestTable });
      }
      if (kreaTable) tableSections.push({ title: copy.kreaGenerationRates, body: kreaTable });
      for (const matrix of [qwenOutputMatrix, seedreamOutputMatrix, lumaUniMatrix, ideogramImageMatrix, seedanceVideoMatrix, seedanceAudioMatrix]) {
        if (matrix.table) tableSections.push({ title: matrix.title, body: matrix.table });
      }
      if (imageRows) {
        const publicTierUnit = category === "images" && imageTierUnit === "per request" ? "per generation" : imageTierUnit;
        const tierUnit = publicTierUnit ? ` / ${formatUnit(publicTierUnit, locale)}` : "";
        tableSections.push({
          title: copy.imageTiers,
          body: `| ${copy.model} | ${copy.modelId} | ${copy.operation} | ${copy.quality} | 1K ${copy.credits}${tierUnit} | 2K ${copy.credits}${tierUnit} | 4K ${copy.credits}${tierUnit} |\n| --- | --- | --- | --- | ---: | ---: | ---: |\n${imageRows}`,
        });
      }
      const hasSubgroups = tableSections.length > 1;
      const tables = tableSections.map(({ title, body }) => `${hasSubgroups ? `#### ${title}\n\n` : ""}${body}`).join("\n\n");
      const durationNote = routes.some(({ model }) => model.id === "minimax/minimax-h3") ? `${copy.videoDuration}\n\n` : "";
      return `<Accordion title="${provider}"${defaultOpen ? " defaultOpen" : ""}>\n\n${durationNote}${tables}\n</Accordion>`;
    }).join("\n\n");
    return `<Tab title="${copy.categories[category]}">\n\n<AccordionGroup>\n\n${sections}\n\n</AccordionGroup>\n\n</Tab>`;
  }).join("\n\n");
  return tabs;
}

function render(locale: PricingLocale = "en"): string {
  const copy = pricingCopy[locale];
  const data = loadMetronomeData();
  return `---
title: "${copy.title}"
sidebarTitle: "${copy.sidebar}"
description: "${copy.description}"
mode: "wide"
---

{/* Generated pricing page. */}

${copy.intro(data.credits_per_usd)}

<Tabs>
<Tab title="${copy.credits}">

${renderCurrencyView(locale, "credits")}

</Tab>
<Tab title="USD">

${renderCurrencyView(locale, "usd")}

</Tab>
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
