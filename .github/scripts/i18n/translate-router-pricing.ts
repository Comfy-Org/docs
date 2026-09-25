#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadI18nConfig, localizeMdxPaths, REPO_ROOT } from "./i18n-config.mjs";

const ENGLISH_PATH = "development/comfy-router/pricing.mdx";
const ENGLISH_FILE = join(REPO_ROOT, ENGLISH_PATH);

const strings = {
  ja: {
    title: "Comfy Router モデル別料金",
    sidebarTitle: "料金",
    description: "Comfy Router のモデル別クレジット料金、請求単位、公式価格ソースを比較できます。",
    note: "価格は Comfy クレジット単位です。ダッシュは公式ソースに一致する料金行がないことを示します。",
    pricingDetails: "料金の詳細",
    partnerPricing: "Partner Node の料金",
    table: ["モデル", "Router モデル ID", "Comfy クレジット料金", "価格ソース"],
    fields: {
      model: "モデル",
      Credits: "クレジット",
      Status: "ステータス",
      Model: "モデル",
      "Input credits / 1K": "入力クレジット / 1K",
      "5m Cache Write credits / 1K": "5m キャッシュ書き込みクレジット / 1K",
      "1h Cache Write credits / 1K": "1h キャッシュ書き込みクレジット / 1K",
      "Cache Hit credits / 1K": "キャッシュヒットクレジット / 1K",
      "Output credits / 1K": "出力クレジット / 1K",
      Resolution: "解像度",
      "Video input": "動画入力",
      "Credits / 1K tokens": "クレジット / 1K トークン",
      resolution: "解像度",
      Node: "ノード",
      mode: "モード",
      "Credits / MP / sec": "クレジット / MP / 秒",
      "Output (text) credits / 1K": "出力（テキスト）クレジット / 1K",
      "Output (image) credits / 1K": "出力（画像）クレジット / 1K",
      "Credits / sec": "クレジット / 秒",
      "Input credits / 1M": "入力クレジット / 1M",
      "Output credits / 1M": "出力クレジット / 1M",
      "token type": "トークン種別",
      "Credits / 1M": "クレジット / 1M",
      task: "タスク",
      turbo: "ターボ",
      "Character reference": "キャラクター参照",
      rendering_speed: "rendering_speed",
      "Credits / image": "クレジット / 画像",
      "Image input": "画像入力",
      "Style reference": "スタイル参照",
      Moodboard: "ムードボード",
      "Credits / run": "クレジット / 回",
      "Input credits / image": "入力クレジット / 画像",
      "Output credits / image": "出力クレジット / 画像",
      "Cache hit credits / 1M": "キャッシュヒットクレジット / 1M",
      Condition: "条件",
      "Credits / 1M tokens": "クレジット / 1M トークン",
      generate_audio: "generate_audio",
      "Credits / 10 sec": "クレジット / 10 秒",
    },
  },
  zh: {
    title: "Comfy Router 模型定价",
    sidebarTitle: "定价",
    description: "查看各个 Comfy Router 模型的积分价格、计费单位以及对应的官方定价来源信息。",
    note: "价格以 Comfy 积分计。破折号表示官方来源中没有匹配的费率行。",
    pricingDetails: "定价详情",
    partnerPricing: "Partner Node 定价",
    table: ["模型", "Router 模型 ID", "Comfy 积分费率", "定价来源"],
    fields: {
      model: "模型",
      Credits: "积分",
      Status: "状态",
      Model: "模型",
      "Input credits / 1K": "输入积分 / 1K",
      "5m Cache Write credits / 1K": "5m 缓存写入积分 / 1K",
      "1h Cache Write credits / 1K": "1h 缓存写入积分 / 1K",
      "Cache Hit credits / 1K": "缓存命中积分 / 1K",
      "Output credits / 1K": "输出积分 / 1K",
      Resolution: "分辨率",
      "Video input": "视频输入",
      "Credits / 1K tokens": "积分 / 1K Token",
      resolution: "分辨率",
      Node: "节点",
      mode: "模式",
      "Credits / MP / sec": "积分 / MP / 秒",
      "Output (text) credits / 1K": "文本输出积分 / 1K",
      "Output (image) credits / 1K": "图像输出积分 / 1K",
      "Credits / sec": "积分 / 秒",
      "Input credits / 1M": "输入积分 / 1M",
      "Output credits / 1M": "输出积分 / 1M",
      "token type": "Token 类型",
      "Credits / 1M": "积分 / 1M",
      task: "任务",
      turbo: "Turbo",
      "Character reference": "角色参考",
      rendering_speed: "rendering_speed",
      "Credits / image": "积分 / 图像",
      "Image input": "图像输入",
      "Style reference": "风格参考",
      Moodboard: "情绪板",
      "Credits / run": "积分 / 次",
      "Input credits / image": "输入积分 / 图像",
      "Output credits / image": "输出积分 / 图像",
      "Cache hit credits / 1M": "缓存命中积分 / 1M",
      Condition: "条件",
      "Credits / 1M tokens": "积分 / 1M Token",
      generate_audio: "generate_audio",
      "Credits / 10 sec": "积分 / 10 秒",
    },
  },
  ko: {
    title: "모델별 Comfy Router 요금",
    sidebarTitle: "요금",
    description: "Comfy Router 모델별 크레딧 요금과 청구 단위, 공식 가격 출처를 비교할 수 있습니다.",
    note: "가격은 Comfy 크레딧 단위입니다. 대시는 공식 출처에 일치하는 요금 행이 없음을 뜻합니다.",
    pricingDetails: "가격 세부 정보",
    partnerPricing: "Partner Node 가격",
    table: ["모델", "Router 모델 ID", "Comfy 크레딧 요금", "가격 출처"],
    fields: {
      model: "모델",
      Credits: "크레딧",
      Status: "상태",
      Model: "모델",
      "Input credits / 1K": "입력 크레딧 / 1K",
      "5m Cache Write credits / 1K": "5분 캐시 쓰기 크레딧 / 1K",
      "1h Cache Write credits / 1K": "1시간 캐시 쓰기 크레딧 / 1K",
      "Cache Hit credits / 1K": "캐시 적중 크레딧 / 1K",
      "Output credits / 1K": "출력 크레딧 / 1K",
      Resolution: "해상도",
      "Video input": "동영상 입력",
      "Credits / 1K tokens": "크레딧 / 1K 토큰",
      resolution: "해상도",
      Node: "노드",
      mode: "모드",
      "Credits / MP / sec": "크레딧 / MP / 초",
      "Output (text) credits / 1K": "텍스트 출력 크레딧 / 1K",
      "Output (image) credits / 1K": "이미지 출력 크레딧 / 1K",
      "Credits / sec": "크레딧 / 초",
      "Input credits / 1M": "입력 크레딧 / 1M",
      "Output credits / 1M": "출력 크레딧 / 1M",
      "token type": "토큰 유형",
      "Credits / 1M": "크레딧 / 1M",
      task: "작업",
      turbo: "터보",
      "Character reference": "캐릭터 참조",
      rendering_speed: "rendering_speed",
      "Credits / image": "크레딧 / 이미지",
      "Image input": "이미지 입력",
      "Style reference": "스타일 참조",
      Moodboard: "무드보드",
      "Credits / run": "크레딧 / 실행",
      "Input credits / image": "입력 크레딧 / 이미지",
      "Output credits / image": "출력 크레딧 / 이미지",
      "Cache hit credits / 1M": "캐시 적중 크레딧 / 1M",
      Condition: "조건",
      "Credits / 1M tokens": "크레딧 / 1M 토큰",
      generate_audio: "generate_audio",
      "Credits / 10 sec": "크레딧 / 10초",
    },
  },
} as const;

const englishTableHeader = "| Model | Router model ID | Comfy credit rate | Pricing source |";
const englishNote =
  "Prices are in Comfy credits. A dash means the official source has no matching rate row. [Pricing details](/tutorials/partner-nodes/pricing).";

function replaceRequired(content: string, from: string, to: string): string {
  if (!content.includes(from)) {
    throw new Error(`Expected text was not found in the generated English page: ${from}`);
  }
  return content.replaceAll(from, to);
}

function localize(content: string, locale: keyof typeof strings, fields: string[]): string {
  const translated = strings[locale];
  let output = replaceRequired(content, 'title: "Comfy Router pricing by model"', `title: "${translated.title}"`);
  output = replaceRequired(output, 'sidebarTitle: "Pricing"', `sidebarTitle: "${translated.sidebarTitle}"`);
  output = replaceRequired(
    output,
    'description: "Compare Comfy Router credit pricing by model, with billing units and official pricing source links."',
    `description: "${translated.description}"`
  );
  output = replaceRequired(
    output,
    englishNote,
    `${translated.note} [${translated.pricingDetails}](/tutorials/partner-nodes/pricing).`
  );
  output = replaceRequired(output, englishTableHeader, `| ${translated.table.join(" | ")} |`);
  output = output.replaceAll("[Partner Node pricing]", `[${translated.partnerPricing}]`);

  output = output
    .split("\n")
    .map((line) => {
      if (!line.startsWith("| [") || !line.includes("/development/comfy-router/models/")) return line;
      for (const field of fields) {
        const localized = translated.fields[field as keyof typeof translated.fields];
        if (localized === undefined) throw new Error(`No ${locale} translation configured for pricing field: ${field}`);
        if (localized !== field) line = line.replaceAll(`${field}: `, `${localized}: `);
      }
      return line;
    })
    .join("\n");

  const config = loadI18nConfig();
  const language = config.languages.find((candidate) => candidate.code === locale);
  if (!language) throw new Error(`No language configuration found for ${locale}`);
  return localizeMdxPaths(output, language, config.languages);
}

async function main() {
  const english = await readFile(ENGLISH_FILE, "utf8");
  const snapshot = JSON.parse(await readFile(join(REPO_ROOT, "router-pricing/prices.json"), "utf8")) as {
    models: Array<{ rates: Array<{ fields: Array<{ label: string }> }> }>;
  };
  const fields = [...new Set(snapshot.models.flatMap((model) => model.rates.flatMap((rate) => rate.fields.map((field) => field.label))))];

  for (const locale of Object.keys(strings) as Array<keyof typeof strings>) {
    const targetFile = join(REPO_ROOT, locale, ENGLISH_PATH);
    await mkdir(dirname(targetFile), { recursive: true });
    await writeFile(targetFile, localize(english, locale, fields));
    console.log(`wrote ${targetFile}`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
