#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadI18nConfig, localizeMdxPaths, REPO_ROOT } from "./i18n-config.mjs";
import { fixAnchorSlugs } from "./fix-anchor-slugs.ts";
import { computeSyncedContent } from "./sync-hash-i18n.ts";

const ENGLISH_PATH = "development/comfy-router/pricing.mdx";
const ENGLISH_FILE = join(REPO_ROOT, ENGLISH_PATH);

const strings = {
  ja: {
    title: "Comfy Router モデル別料金",
    sidebarTitle: "料金",
    description: "Comfy Router のモデル別料金を、提供プロバイダー、請求単位、条件、スナップショット日とともに比較できます。",
    note: "モデル ID と提供プロバイダーは Comfy Router の自動生成モデルページに基づきます。公開料金は ${snapshotAt} 時点の Metronome 本番スナップショットを反映しています。このスナップショットのクレジット額は 1 USD あたり ${creditsPerUsd} クレジットで計算されます。料金は記載された請求単位ごとで、条件は各行に適用されます。使用量ベースの料金はリクエストごとに変動します。利用可能な場合、レスポンスの `X-Comfy-Credits-Used` ヘッダーが実行金額を示します。「未公開」は、このモデル/プロバイダールートの公開価格が現在表示されていないことを示します。未掲載の料金や課金項目が無料という意味ではありません。",
    billingDetails: "請求の詳細",
    metronomeSnapshot: "Metronome スナップショット",
    noMatchedRate: "未公開",
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
    note: "模型 ID 和服务提供商来自自动生成的 Comfy Router 模型页面。公开费率基于 ${snapshotAt} 的 Metronome 生产快照。本快照按每 1 美元 ${creditsPerUsd} 积分计算。费率按所列计费单位计算，并适用对应条件。按用量计费的费率会因请求而异。如有提供，响应标头 `X-Comfy-Credits-Used` 会显示本次运行的金额。“未发布”表示当前未显示该模型/提供商路由的公开价格。未列出的费率或计费项目并不表示免费。",
    billingDetails: "计费详情",
    metronomeSnapshot: "Metronome 快照",
    noMatchedRate: "未发布",
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
    note: "모델 ID와 제공업체는 자동 생성된 Comfy Router 모델 페이지를 따릅니다. 공개 요금은 ${snapshotAt} 기준 Metronome 프로덕션 스냅샷을 반영합니다. 이 스냅샷은 USD 1달러당 ${creditsPerUsd}크레딧으로 계산합니다. 요금은 표시된 청구 단위별이며 각 조건이 적용됩니다. 사용량 기반 요금은 요청마다 달라집니다. 응답에 `X-Comfy-Credits-Used` 헤더가 있으면 해당 실행 금액을 확인할 수 있습니다. “게시되지 않음”은 해당 모델/제공업체 경로의 공개 가격이 현재 표시되지 않았음을 뜻합니다. 표시되지 않은 요금이나 청구 항목이 무료라는 뜻은 아닙니다.",
    billingDetails: "청구 세부 정보",
    metronomeSnapshot: "Metronome 스냅샷",
    noMatchedRate: "게시되지 않음",
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
  `Model IDs and serving providers come from the autogenerated Comfy Router model pages. Published rates reflect the Metronome production snapshot from ${snapshotAt}. Credit amounts use ${creditsPerUsd} credits per USD in this snapshot. Rates are per stated billable unit and conditions apply as listed. Usage-based rates vary by request. The \`X-Comfy-Credits-Used\` response header reports the run amount when available. “Not published” means no public price is currently shown for that model/provider route. An omitted rate or billing component does not mean it is free. See [billing details](/development/comfy-router/billing).`;

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
  if (field === "Unit") {
    const units: Record<string, Record<string, string>> = {
      ja: {
        generation: "生成",
        request: "リクエスト",
        second: "秒",
        "5 seconds": "5 秒",
        "1K video tokens": "1K 動画トークン",
        image: "画像",
        "additional reference image": "追加の参照画像",
        "input image": "入力画像",
        "output image": "出力画像",
        "billable unit": "請求単位",
        "usage credit": "使用量クレジット",
        "video credit": "動画クレジット",
      },
      zh: {
        generation: "次生成",
        request: "请求",
        second: "秒",
        "5 seconds": "5 秒",
        "1K video tokens": "1K 视频令牌",
        image: "图像",
        "additional reference image": "额外参考图像",
        "input image": "输入图像",
        "output image": "输出图像",
        "billable unit": "计费单位",
        "usage credit": "用量积分",
        "video credit": "视频积分",
      },
      ko: {
        generation: "회 생성",
        request: "요청",
        second: "초",
        "5 seconds": "5초",
        "1K video tokens": "1K 동영상 토큰",
        image: "이미지",
        "additional reference image": "추가 참조 이미지",
        "input image": "입력 이미지",
        "output image": "출력 이미지",
        "billable unit": "청구 단위",
        "usage credit": "사용량 크레딧",
        "video credit": "동영상 크레딧",
      },
    };
    if (["variable per request", "variable based on reported usage"].includes(value.toLowerCase())) {
      if (locale === "ja") return "リクエストごとに変動";
      if (locale === "zh") return "每次请求各不相同";
      return "요청마다 달라짐";
    }
    if (value === "varies with image dimensions and scale") {
      if (locale === "ja") return "画像の寸法と拡大率に応じて変動";
      if (locale === "zh") return "因图像尺寸和缩放比例而异";
      return "이미지 크기와 배율에 따라 달라짐";
    }
    return units[locale][value] ?? value;
  }
  if (field === "Conditions") {
    const conditions: Record<string, Record<string, string>> = {
      ja: {
        "The amount depends on reported usage": "報告された使用量に応じて金額が変わります",
        "The request charge depends on image dimensions and scale.": "リクエスト料金は画像の寸法と拡大率によって変わります。",
        "Rate applies to the usage-credit quantity reported for the request.": "リクエストで報告された使用量クレジット数に応じて料金が適用されます。",
        "Rate applies to provider-reported video-credit quantity.": "プロバイダーから報告される動画クレジット数に応じて料金が適用されます。",
        "The request charge varies with reported usage.": "リクエスト料金は報告された使用量に応じて変わります。",
        "Input duration, capped at 5 seconds per request": "入力動画の長さ。1 リクエストあたり最大 5 秒です",
        "Reference images after the first five": "最初の 5 枚を超える参照画像",
        "Output video duration": "出力動画の長さ",
        "Fibo image editing": "Fibo 画像編集",
        "Background removal": "背景除去",
        "Text-to-video; resolution=480p": "テキストから動画; resolution=480p",
        "Text-to-video; resolution=720p": "テキストから動画; resolution=720p",
        "Text to image, base tier": "テキストから画像、基本ティア",
        "Text to video, base tier": "テキストから動画、基本ティア",
        "Kling 3 Standard": "Kling 3 Standard",
        "720p": "720p",
        "1080p": "1080p",
        "480p": "480p",
      },
      zh: {
        "The amount depends on reported usage": "费用取决于报告的用量",
        "The request charge depends on image dimensions and scale.": "请求费用取决于图像尺寸和缩放比例。",
        "Rate applies to the usage-credit quantity reported for the request.": "费率按请求报告的用量积分数量计算。",
        "Rate applies to provider-reported video-credit quantity.": "费率按提供商报告的视频积分数量计算。",
        "The request charge varies with reported usage.": "请求费用会因报告的用量而异。",
        "Input duration, capped at 5 seconds per request": "输入时长，每次请求最多计 5 秒",
        "Reference images after the first five": "前 5 张之后的参考图像",
        "Output video duration": "输出视频时长",
        "Fibo image editing": "Fibo 图像编辑",
        "Background removal": "背景移除",
        "Text-to-video; resolution=480p": "文生视频；resolution=480p",
        "Text-to-video; resolution=720p": "文生视频；resolution=720p",
        "Text to image, base tier": "文生图，基础档",
        "Text to video, base tier": "文生视频，基础档",
        "Kling 3 Standard": "Kling 3 Standard",
        "720p": "720p",
        "1080p": "1080p",
        "480p": "480p",
      },
      ko: {
        "The amount depends on reported usage": "보고된 사용량에 따라 금액이 달라집니다",
        "The request charge depends on image dimensions and scale.": "요청 요금은 이미지 크기와 배율에 따라 달라집니다.",
        "Rate applies to the usage-credit quantity reported for the request.": "요청에서 보고된 사용량 크레딧 수량에 요금이 적용됩니다.",
        "Rate applies to provider-reported video-credit quantity.": "제공업체가 보고한 동영상 크레딧 수량에 요금이 적용됩니다.",
        "The request charge varies with reported usage.": "요청 요금은 보고된 사용량에 따라 달라집니다.",
        "Input duration, capped at 5 seconds per request": "입력 동영상 길이이며 요청당 최대 5초까지 계산됩니다",
        "Reference images after the first five": "처음 5장을 초과하는 참조 이미지",
        "Output video duration": "출력 동영상 길이",
        "Fibo image editing": "Fibo 이미지 편집",
        "Background removal": "배경 제거",
        "Text-to-video; resolution=480p": "텍스트 동영상 생성; resolution=480p",
        "Text-to-video; resolution=720p": "텍스트 동영상 생성; resolution=720p",
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
      .replace(" until ", locale === "ja" ? "、終了: " : locale === "zh" ? " 至 " : ", 종료: ")
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
  output = output.replaceAll("Metronome snapshot", translated.metronomeSnapshot).replaceAll("Not published", translated.noMatchedRate);
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

function localizedPageContent(english: string, locale: keyof typeof strings, snapshotAt: string, creditsPerUsd: number): string {
  const fields = ["Rate shape", "USD price", "Credits", "Unit", "Conditions", "Effective"];
  const localized = localize(english, locale, fields, snapshotAt, creditsPerUsd);
  return computeSyncedContent(english, localized, ENGLISH_PATH, ENGLISH_PATH, false).output;
}

async function main() {
  const check = process.argv.includes("--check");
  const english = await readFile(ENGLISH_FILE, "utf8");
  const metronome = JSON.parse(await readFile(join(REPO_ROOT, "router-pricing/metronome-rates.json"), "utf8")) as {
    snapshot_at: string;
    credits_per_usd: number;
  };
  const targetFiles: string[] = [];
  for (const locale of Object.keys(strings) as Array<keyof typeof strings>) {
    const targetFile = join(REPO_ROOT, locale, ENGLISH_PATH);
    const output = localizedPageContent(english, locale, metronome.snapshot_at, metronome.credits_per_usd);
    if (check) {
      if (!existsSync(targetFile) || await readFile(targetFile, "utf8") !== output) {
        throw new Error(`${targetFile}: stale or missing, run pnpm router-pricing:gen`);
      }
      console.log(`fresh ${targetFile}`);
    } else {
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, output);
      console.log(`wrote ${targetFile}`);
    }
    targetFiles.push(`${locale}/${ENGLISH_PATH}`);
  }

  const anchors = await fixAnchorSlugs({ fileArgs: targetFiles, dryRun: check });
  if (anchors.unresolved > 0) {
    throw new Error(`Could not localize ${anchors.unresolved} pricing source anchor(s)`);
  }
  if (check && anchors.fixed > 0) {
    throw new Error("Pricing locale anchors are stale, run pnpm router-pricing:gen");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { localizedPageContent, translateRateValue };
