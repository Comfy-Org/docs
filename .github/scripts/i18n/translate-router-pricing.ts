#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadI18nConfig, localizeMdxPaths, REPO_ROOT } from "./i18n-config.mjs";
import { fixAnchorSlugs } from "./fix-anchor-slugs.ts";

const ENGLISH_PATH = "development/comfy-router/pricing.mdx";
const ENGLISH_FILE = join(REPO_ROOT, ENGLISH_PATH);

const strings = {
  ja: {
    title: "Comfy Router モデル別料金",
    sidebarTitle: "料金",
    description: "Comfy Router のモデル別料金を、提供プロバイダー、請求単位、条件、スナップショット日とともに比較できます。",
    note: "モデル ID と提供プロバイダーは Comfy Router の自動生成モデルページに基づきます。公開料金は ${snapshotAt} 時点の Metronome 本番スナップショットを反映しています。このスナップショットのクレジット額は 1 USD あたり ${creditsPerUsd} クレジットで計算されます。料金は記載された請求単位ごとで、条件は各行に適用されます。使用量ベースの料金はリクエストごとに変動します。利用可能な場合、レスポンスの `X-Comfy-Credits-Used` ヘッダーが実行金額を示します。「未公開」は一致する Metronome 料金がマッピングされていないことを示します。",
    billingDetails: "請求の詳細",
    metronomeSnapshot: "Metronome スナップショット",
    noMatchedRate: "一致する Metronome 料金なし",
    table: ["モデル", "Router モデル ID", "提供プロバイダー", "料金", "価格ソース"],
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
      "Serving provider": "提供プロバイダー",
      "Rate shape": "料金形態",
      "USD price": "米ドル価格",
      Unit: "単位",
      Conditions: "条件",
      Effective: "適用期間",
    },
  },
  zh: {
    title: "Comfy Router 模型定价",
    sidebarTitle: "定价",
    description: "比较 Comfy Router 各模型的费率、服务提供商、计费单位、条件和快照日期。",
    note: "模型 ID 和服务提供商来自自动生成的 Comfy Router 模型页面。公开费率基于 ${snapshotAt} 的 Metronome 生产快照。本快照按每 1 美元 ${creditsPerUsd} 积分计算。费率按所列计费单位计算，并适用对应条件。按用量计费的费率会因请求而异。如有提供，响应标头 `X-Comfy-Credits-Used` 会显示本次运行的金额。“未发布”表示尚未映射到匹配的 Metronome 费率。",
    billingDetails: "计费详情",
    metronomeSnapshot: "Metronome 快照",
    noMatchedRate: "无匹配的 Metronome 费率",
    table: ["模型", "Router 模型 ID", "服务提供商", "费率", "定价来源"],
    fields: {
      model: "模型",
      Credits: "积分",
      Status: "状态",
      Model: "模型",
      "Input credits / 1K": "输入积分 / 1K",
      "5m Cache Write credits / 1K": "5分钟缓存写入积分 / 1K",
      "1h Cache Write credits / 1K": "1小时缓存写入积分 / 1K",
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
      "Serving provider": "服务提供商",
      "Rate shape": "计费方式",
      "USD price": "美元价格",
      Unit: "单位",
      Conditions: "条件",
      Effective: "生效时间",
    },
  },
  ko: {
    title: "모델별 Comfy Router 요금",
    sidebarTitle: "요금",
    description: "Comfy Router 모델 요금을 제공업체, 청구 단위, 조건 및 스냅샷 날짜별로 비교합니다.",
    note: "모델 ID와 제공업체는 자동 생성된 Comfy Router 모델 페이지를 따릅니다. 공개 요금은 ${snapshotAt} 기준 Metronome 프로덕션 스냅샷을 반영합니다. 이 스냅샷은 USD 1달러당 ${creditsPerUsd}크레딧으로 계산합니다. 요금은 표시된 청구 단위별이며 각 조건이 적용됩니다. 사용량 기반 요금은 요청마다 달라집니다. 응답에 `X-Comfy-Credits-Used` 헤더가 있으면 해당 실행 금액을 확인할 수 있습니다. “게시되지 않음”은 일치하는 Metronome 요금이 매핑되지 않았음을 뜻합니다.",
    billingDetails: "청구 세부 정보",
    metronomeSnapshot: "Metronome 스냅샷",
    noMatchedRate: "일치하는 Metronome 요금 없음",
    table: ["모델", "Router 모델 ID", "서비스 제공업체", "요금", "가격 출처"],
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
      "Serving provider": "서비스 제공업체",
      "Rate shape": "요금 방식",
      "USD price": "미국 달러 가격",
      Unit: "단위",
      Conditions: "조건",
      Effective: "적용 기간",
    },
  },
} as const;

const categoricalValues = {
  ja: {
    Status: { Active: "有効" },
    "Video input": { no: "いいえ", yes: "はい" },
    "token type": {
      input: "入力",
      "output (image)": "出力（画像）",
      "input (image)": "入力（画像）",
      "input (text)": "入力（テキスト）",
    },
    task: { generate: "生成", edit: "編集", generation: "生成" },
    "Image input": { No: "なし" },
    "Style reference": { No: "なし", Yes: "あり" },
    Moodboard: { No: "なし", Yes: "あり" },
    mode: { creative: "creative（クリエイティブ）", precise: "precise（高精度）" },
    rendering_speed: {
      TURBO: "TURBO（ターボ）",
      DEFAULT: "DEFAULT（標準）",
      QUALITY: "QUALITY（高品質）",
    },
    generate_audio: { off: "off（オフ）", on: "on（オン）" },
  },
  zh: {
    Status: { Active: "启用" },
    "Video input": { no: "否", yes: "是" },
    "token type": {
      input: "输入",
      "output (image)": "图像输出",
      "input (image)": "图像输入",
      "input (text)": "文本输入",
    },
    task: { generate: "生成", edit: "编辑", generation: "生成" },
    "Image input": { No: "无" },
    "Style reference": { No: "无", Yes: "有" },
    Moodboard: { No: "无", Yes: "有" },
    mode: { creative: "creative（创意）", precise: "precise（精准）" },
    rendering_speed: {
      TURBO: "TURBO（极速）",
      DEFAULT: "DEFAULT（默认）",
      QUALITY: "QUALITY（高质量）",
    },
    generate_audio: { off: "off（关闭）", on: "on（开启）" },
  },
  ko: {
    Status: { Active: "활성" },
    "Video input": { no: "아니요", yes: "예" },
    "token type": {
      input: "입력",
      "output (image)": "이미지 출력",
      "input (image)": "이미지 입력",
      "input (text)": "텍스트 입력",
    },
    task: { generate: "생성", edit: "편집", generation: "생성" },
    "Image input": { No: "없음" },
    "Style reference": { No: "없음", Yes: "있음" },
    Moodboard: { No: "없음", Yes: "있음" },
    mode: { creative: "creative(크리에이티브)", precise: "precise(정밀)" },
    rendering_speed: {
      TURBO: "TURBO(터보)",
      DEFAULT: "DEFAULT(기본)",
      QUALITY: "QUALITY(고품질)",
    },
    generate_audio: { off: "off(끔)", on: "on(켬)" },
  },
} as const;

const creditFormulaTerms = {
  ja: [
    ["per output image", "出力画像あたり"],
    [" (with first/last frame)", "（最初/最後のフレーム付き）"],
    [" (with reference media)", "（参照メディア付き）"],
    ["(text only)", "（テキストのみ）"],
    ["input + output video", "入力 + 出力動画"],
    ["extension sec output", "延長秒の出力"],
    ["sec output", "秒あたりの出力"],
    ["first/last frame", "最初/最後のフレーム"],
    ["reference media", "参照メディア"],
    ["output image", "出力画像"],
    ["input image", "入力画像"],
    ["ref image", "参照画像"],
    ["extra MP", "追加 MP"],
    ["input + output", "入力 + 出力"],
    [" plus ", " 追加で "],
    [" over 5", " 5 枚超"],
    ["medium", "中"],
    ["low", "低"],
    ["range", "範囲"],
    ["/ sec", "/ 秒"],
    ["/ run", "/ 回"],
    ["/ image", "/ 画像"],
    [", plus ", "、さらに "],
    ["input", "入力"],
    ["output", "出力"],
  ],
  zh: [
    ["per output image", "每张输出图像"],
    [" (with first/last frame)", "（包含首帧/尾帧）"],
    [" (with reference media)", "（包含参考媒体）"],
    ["(text only)", "（仅文本）"],
    ["input + output video", "输入 + 输出视频"],
    ["extension sec output", "延长秒数输出"],
    ["sec output", "每秒输出"],
    ["first/last frame", "首帧/尾帧"],
    ["reference media", "参考媒体"],
    ["output image", "输出图像"],
    ["input image", "输入图像"],
    ["ref image", "参考图像"],
    ["extra MP", "额外 MP"],
    ["input + output", "输入 + 输出"],
    [" plus ", "，另加 "],
    [" over 5", "，超过 5 张"],
    ["medium", "中等"],
    ["low", "低"],
    ["range", "范围"],
    ["/ sec", "/ 秒"],
    ["/ run", "/ 次"],
    ["/ image", "/ 图像"],
    [", plus ", "，另加 "],
    ["input", "输入"],
    ["output", "输出"],
  ],
  ko: [
    ["per output image", "출력 이미지당"],
    [" (with first/last frame)", "(첫/마지막 프레임 포함)"],
    [" (with reference media)", "(참조 미디어 포함)"],
    ["(text only)", "(텍스트 전용)"],
    ["input + output video", "입력 + 출력 동영상"],
    ["extension sec output", "연장 초 출력"],
    ["sec output", "초당 출력"],
    ["first/last frame", "첫/마지막 프레임"],
    ["reference media", "참조 미디어"],
    ["output image", "출력 이미지"],
    ["input image", "입력 이미지"],
    ["ref image", "참조 이미지"],
    ["extra MP", "추가 MP"],
    ["input + output", "입력 + 출력"],
    [" plus ", " 추가 "],
    [" over 5", " 5장 초과"],
    ["medium", "중간"],
    ["low", "낮음"],
    ["range", "범위"],
    ["/ sec", "/ 초"],
    ["/ run", "/ 회"],
    ["/ image", "/ 이미지"],
    [", plus ", ", 추가로 "],
    ["input", "입력"],
    ["output", "출력"],
  ],
} as const;

const englishTableHeader = "| Model | Router model ID | Serving provider | Rate | Pricing source |";
const englishNote = (snapshotAt: string, creditsPerUsd: number) =>
  `Model IDs and serving providers come from the autogenerated Comfy Router model pages. Published rates reflect the Metronome production snapshot from ${snapshotAt}. Credit amounts use ${creditsPerUsd} credits per USD in this snapshot. Rates are per stated billable unit and conditions apply as listed. Usage-based rates vary by request. The \`X-Comfy-Credits-Used\` response header reports the run amount when available. “Not published” means no matching Metronome rate is mapped for that model and serving provider. See [billing details](/development/comfy-router/billing).`;

function replaceRequired(content: string, from: string, to: string): string {
  if (!content.includes(from)) {
    throw new Error(`Expected text was not found in the generated English page: ${from}`);
  }
  return content.replaceAll(from, to);
}

function fallBackMissingLocaleLinks(content: string, locale: string): string {
  const prefix = `/${locale}/`;
  return content.replace(/\]\((\/[^)]+)\)/g, (link, url: string) => {
    const match = url.match(/^(\/[^?#]*)([?#].*)?$/);
    if (!match || !match[1].startsWith(prefix)) return link;

    const localizedPath = match[1].slice(prefix.length);
    const candidates = [
      join(REPO_ROOT, locale, `${localizedPath}.mdx`),
      join(REPO_ROOT, locale, localizedPath, "index.mdx"),
      join(REPO_ROOT, locale, localizedPath),
    ];
    if (candidates.some((candidate) => existsSync(candidate))) return link;

    const englishPath = `/${localizedPath}${match[2] ?? ""}`;
    return link.replace(url, englishPath);
  });
}

function splitMarkdownTableRow(line: string): string[] {
  const cells: string[] = [];
  let start = 0;
  let backslashes = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "|" && backslashes % 2 === 0) {
      cells.push(line.slice(start, index));
      start = index + 1;
    }
    backslashes = char === "\\" ? backslashes + 1 : 0;
  }
  cells.push(line.slice(start));
  return cells;
}

function translateRateValue(locale: keyof typeof strings, field: string, value: string): string {
  const categorical = (categoricalValues[locale] as Record<string, Record<string, string>>)[field]?.[value];
  if (categorical) return categorical;
  if (field === "Rate shape" && value === "Usage-based") {
    if (locale === "ja") return "使用量ベース";
    if (locale === "zh") return "按用量计费";
    return "사용량 기반";
  }
  if (field === "Unit" && value === "Variable per request") {
    if (locale === "ja") return "リクエストごとに変動";
    if (locale === "zh") return "每次请求各不相同";
    return "요청마다 달라짐";
  }
  if (field === "Unit") {
    const units: Record<string, Record<string, string>> = {
      ja: { generation: "生成", second: "秒" },
      zh: { generation: "次生成", second: "秒" },
      ko: { generation: "회 생성", second: "초" },
    };
    return units[locale][value] ?? value;
  }
  if (field === "Conditions") {
    const conditions: Record<string, Record<string, string>> = {
      ja: {
        "The amount depends on reported usage": "報告された使用量に応じて金額が変わります",
        "Text to image, base tier": "テキストから画像、基本ティア",
        "Text to video, base tier": "テキストから動画、基本ティア",
        "Kling 3 Standard": "Kling 3 Standard",
        "720p": "720p",
        "1080p": "1080p",
        "480p": "480p",
      },
      zh: {
        "The amount depends on reported usage": "费用取决于报告的用量",
        "Text to image, base tier": "文生图，基础档",
        "Text to video, base tier": "文生视频，基础档",
        "Kling 3 Standard": "Kling 3 Standard",
        "720p": "720p",
        "1080p": "1080p",
        "480p": "480p",
      },
      ko: {
        "The amount depends on reported usage": "보고된 사용량에 따라 금액이 달라집니다",
        "Text to image, base tier": "텍스트 이미지 생성, 기본 등급",
        "Text to video, base tier": "텍스트 동영상 생성, 기본 등급",
        "Kling 3 Standard": "Kling 3 Standard",
        "720p": "720p",
        "1080p": "1080p",
        "480p": "480p",
      },
    };
    return conditions[locale][value] ?? value;
  }
  if (field === "Effective") {
    return value.replace(/^From /, locale === "ja" ? "開始: " : locale === "zh" ? "开始：" : "시작: ")
      .replace(" until ", locale === "ja" ? " から " : locale === "zh" ? " 至 " : "부터 ")
      .replace(" (exclusive)", locale === "ja" ? "（終了日は含みません）" : locale === "zh" ? "（结束日期不含）" : "(종료일은 미포함)");
  }
  if (field !== "Credits") return value;

  let translated = value.replace(/\b(\d+)s\b/g, (_match, seconds: string) => {
    const unit = locale === "ja" || locale === "zh" ? "秒" : "초";
    return `${seconds}${unit}`;
  });

  translated = translated.replace(
    /(\d+(?:\.\d+)?) \/ sec, plus (\d+(?:\.\d+)?) \/ image over 5/g,
    (_match, rate: string, extra: string) => {
      if (locale === "ja") return `${rate} / 秒、画像が 5 枚を超えると 1 枚あたり ${extra} 追加`;
      if (locale === "zh") return `每秒 ${rate}，图像超过 5 张后每张另加 ${extra}`;
      return `초당 ${rate}, 이미지가 5장을 넘으면 장당 ${extra} 추가`;
    }
  );

  translated = translated.replace(
    /(?:(\d+(?:\.\d+)?) input \+ )?(\d+(?:\.\d+)?) \(medium\) \/ (\d+(?:\.\d+)?) \(low\) per output image/g,
    (_match, inputPrice: string | undefined, mediumPrice: string, lowPrice: string) => {
      if (locale === "ja") {
        return `${inputPrice ? `入力 ${inputPrice} + ` : ""}出力画像あたり ${mediumPrice}（中） / ${lowPrice}（低）`;
      }
      if (locale === "zh") {
        return `${inputPrice ? `输入 ${inputPrice}；` : ""}每张输出图像 ${mediumPrice}（中） / ${lowPrice}（低）`;
      }
      return `${inputPrice ? `입력 ${inputPrice}; ` : ""}출력 이미지당 ${mediumPrice}(중간) / ${lowPrice}(낮음)`;
    }
  );
  translated = translated.replace(
    /(\d+(?:\.\d+)?) \/ sec output \(\+(\d+(?:\.\d+)?) input image\)/g,
    (_match, outputPrice: string, inputPrice: string) => {
      if (locale === "ja") return `出力 ${outputPrice} / 秒（入力画像 ${inputPrice}）`;
      if (locale === "zh") return `输出 ${outputPrice} / 秒（输入图像 ${inputPrice}）`;
      return `출력 ${outputPrice} / 초(입력 이미지 ${inputPrice})`;
    }
  );
  translated = translated.replace(
    /(\d+(?:\.\d+)?) \/ sec output \+ (\d+(?:\.\d+)?) \/ ref image/g,
    (_match, outputPrice: string, referencePrice: string) => {
      if (locale === "ja") return `出力 ${outputPrice} / 秒 + 参照画像 ${referencePrice}`;
      if (locale === "zh") return `输出 ${outputPrice} / 秒 + 参考图像 ${referencePrice}`;
      return `출력 ${outputPrice} / 초 + 참조 이미지 ${referencePrice}`;
    }
  );
  translated = translated.replace(
    /(\d+(?:\.\d+)?) \/ sec \(input \+ output video\)/g,
    (_match, rate: string) => {
      if (locale === "ja") return `入力 + 出力動画 ${rate} / 秒`;
      if (locale === "zh") return `输入 + 输出视频 ${rate} / 秒`;
      return `입력 + 출력 동영상 ${rate} / 초`;
    }
  );

  for (const [source, target] of [...creditFormulaTerms[locale]].sort(([a], [b]) => b.length - a.length)) {
    translated = translated.replaceAll(source, target);
  }
  return translated;
}

function localize(content: string, locale: keyof typeof strings, fields: string[], snapshotAt: string, creditsPerUsd: number): string {
  const translated = strings[locale];
  let output = replaceRequired(content, 'title: "Comfy Router pricing by model"', `title: "${translated.title}"`);
  output = replaceRequired(output, 'sidebarTitle: "Pricing"', `sidebarTitle: "${translated.sidebarTitle}"`);
  output = replaceRequired(
    output,
    'description: "Compare Comfy Router model rates by serving provider, including billing units, conditions, and snapshot dates."',
    `description: "${translated.description}"`
  );
  output = replaceRequired(
    output,
    englishNote(snapshotAt, creditsPerUsd),
    `${translated.note.replace("${snapshotAt}", snapshotAt).replace("${creditsPerUsd}", String(creditsPerUsd))} [${translated.billingDetails}](/development/comfy-router/billing).`
  );
  output = replaceRequired(output, englishTableHeader, `| ${translated.table.join(" | ")} |`);
  output = output.replaceAll("Metronome snapshot", translated.metronomeSnapshot).replaceAll("No matched Metronome rate", translated.noMatchedRate);
  output = output.replaceAll("[Router billing]", `[${translated.billingDetails}]`);

  output = output
    .split("\n")
    .map((line) => {
      if (!line.startsWith("| [") || !line.includes("/development/comfy-router/models/")) return line;
      const cells = splitMarkdownTableRow(line);
      if (cells.length < 7) throw new Error(`Malformed generated Router pricing row: ${line}`);
      const rateParts = cells[4].split(/(; |<br \/>)/g).map((part) => {
        const leading = part.match(/^\s*/)?.[0] ?? "";
        const trailing = part.match(/\s*$/)?.[0] ?? "";
        const content = part.slice(leading.length, part.length - trailing.length);
        const colon = content.indexOf(": ");
        if (colon < 0) return part;
        const field = content.slice(0, colon).trim();
        const value = content.slice(colon + 2);
        if (!fields.includes(field)) throw new Error(`Unexpected pricing field in generated row: ${field}`);
        const localizedField = translated.fields[field as keyof typeof translated.fields];
        if (localizedField === undefined) throw new Error(`No ${locale} translation configured for pricing field: ${field}`);
        return `${leading}${localizedField}: ${translateRateValue(locale, field, value)}${trailing}`;
      });
      cells[4] = rateParts.join("");
      return cells.join("|");
    })
    .join("\n");

  const config = loadI18nConfig();
  const language = config.languages.find((candidate) => candidate.code === locale);
  if (!language) throw new Error(`No language configuration found for ${locale}`);
  return fallBackMissingLocaleLinks(
    localizeMdxPaths(output, language, config.languages),
    locale
  );
}

async function main() {
  const english = await readFile(ENGLISH_FILE, "utf8");
  const metronome = JSON.parse(await readFile(join(REPO_ROOT, "router-pricing/metronome-rates.json"), "utf8")) as {
    snapshot_at: string;
    credits_per_usd: number;
  };
  const fields = ["Rate shape", "USD price", "Credits", "Unit", "Conditions", "Effective"];

  const targetFiles: string[] = [];
  for (const locale of Object.keys(strings) as Array<keyof typeof strings>) {
    const targetFile = join(REPO_ROOT, locale, ENGLISH_PATH);
    await mkdir(dirname(targetFile), { recursive: true });
    await writeFile(targetFile, localize(english, locale, fields, metronome.snapshot_at, metronome.credits_per_usd));
    targetFiles.push(`${locale}/${ENGLISH_PATH}`);
    console.log(`wrote ${targetFile}`);
  }

  const anchors = await fixAnchorSlugs({ fileArgs: targetFiles });
  if (anchors.unresolved > 0) {
    throw new Error(`Could not localize ${anchors.unresolved} pricing source anchor(s)`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
