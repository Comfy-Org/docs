export type PricingLocale = "en" | "ja" | "zh" | "ko";
export type PricingCategory = "images" | "video" | "text" | "audio" | "3d";

const localeIndex = { en: 0, ja: 1, zh: 2, ko: 3 } as const;
type Translation = readonly [string, string, string, string];

export const pricingCopy = {
  en: {
    title: "Comfy Router pricing", sidebar: "Pricing",
    description: "Image, video, text, audio, and 3D model prices in USD and Comfy credits.",
    intro: "Prices are per listed unit. Your total depends on usage and selected options.",
    conversion: (n: number) => `**$1 = ${n} Comfy credits.**`,
    billing: "How billing works", updated: "Prices updated",
    model: "Model", option: "Option", usd: "USD", credits: "Credits", unit: "Billed per",
    variable: "Usage-based", unavailable: "Not published",
    status: "Usage-based prices vary by request. Unpublished prices do not mean free usage.",
    expiry: (models: string, date: string) => `${models}: listed rates end on ${date} (exclusive).`,
    categories: { images: "Images", video: "Video", text: "Text & multimodal", audio: "Audio", "3d": "3D" },
  },
  ja: {
    title: "Comfy Router の料金", sidebar: "料金",
    description: "Comfy Router の画像、動画、テキスト、音声、3D モデルの料金を比較できます。プロバイダー別の米ドル価格、クレジット、請求単位を確認できます。",
    intro: "モデルの種類とプロバイダーを選択してください。料金は記載された請求単位ごとです。合計額は使用量と選択したオプションによって変わります。",
    conversion: (n: number) => `**1 米ドル = ${n} Comfy クレジット。**`,
    billing: "請求の仕組み", updated: "料金の更新日",
    model: "モデル", option: "オプション", usd: "米ドル", credits: "クレジット", unit: "請求単位",
    variable: "使用量ベース", unavailable: "未公開",
    status: "使用量ベースの料金はリクエストごとに変わります。未公開の料金は無料を意味しません。",
    expiry: (models: string, date: string) => `${models}: 記載料金の終了日は ${date} です（終了日は含みません）。`,
    categories: { images: "画像", video: "動画", text: "テキスト・マルチモーダル", audio: "音声", "3d": "3D" },
  },
  zh: {
    title: "Comfy Router 定价", sidebar: "定价",
    description: "比较 Comfy Router 图像、视频、文本、音频和 3D 模型的价格，查看各提供商的美元费率、积分和计费单位。",
    intro: "选择模型类型和提供商。价格按所列计费单位计算，总费用取决于用量和所选选项。",
    conversion: (n: number) => `**1 美元 = ${n} Comfy 积分。**`,
    billing: "计费方式", updated: "价格更新日期",
    model: "模型", option: "选项", usd: "美元", credits: "积分", unit: "计费单位",
    variable: "按用量计费", unavailable: "未发布",
    status: "按用量计费的价格因请求而异。未发布的价格并不表示免费。",
    expiry: (models: string, date: string) => `${models}：所列费率截至 ${date}（不含结束日期）。`,
    categories: { images: "图像", video: "视频", text: "文本与多模态", audio: "音频", "3d": "3D" },
  },
  ko: {
    title: "Comfy Router 요금", sidebar: "요금",
    description: "Comfy Router의 이미지, 동영상, 텍스트, 오디오 및 3D 모델 요금을 비교하고 제공업체별 USD 가격, 크레딧, 청구 단위를 확인하세요.",
    intro: "모델 유형과 제공업체를 선택하세요. 가격은 표시된 청구 단위별이며 총액은 사용량과 선택한 옵션에 따라 달라집니다.",
    conversion: (n: number) => `**USD 1달러 = ${n} Comfy 크레딧.**`,
    billing: "청구 방식", updated: "요금 업데이트",
    model: "모델", option: "옵션", usd: "USD", credits: "크레딧", unit: "청구 단위",
    variable: "사용량 기반", unavailable: "게시되지 않음",
    status: "사용량 기반 요금은 요청마다 달라집니다. 게시되지 않은 요금은 무료라는 뜻이 아닙니다.",
    expiry: (models: string, date: string) => `${models}: 표시된 요금은 ${date}에 종료됩니다(종료일 미포함).`,
    categories: { images: "이미지", video: "동영상", text: "텍스트 및 멀티모달", audio: "오디오", "3d": "3D" },
  },
} as const;

const phrases: Record<string, Translation> = {
  "Input text tokens": ["Text input", "テキスト入力", "文本输入", "텍스트 입력"],
  "Input image tokens": ["Image input", "画像入力", "图像输入", "이미지 입력"],
  "Input audio tokens": ["Audio input", "音声入力", "音频输入", "오디오 입력"],
  "Input video tokens": ["Video input", "動画入力", "视频输入", "동영상 입력"],
  "Output text tokens": ["Text output", "テキスト出力", "文本输出", "텍스트 출력"],
  "Output image tokens": ["Image output", "画像出力", "图像输出", "이미지 출력"],
  "Output video tokens": ["Video output", "動画出力", "视频输出", "동영상 출력"],
  "Reasoning tokens": ["Reasoning", "推論", "推理", "추론"],
  "Cached input tokens": ["Cached input", "キャッシュ入力", "缓存输入", "캐시 입력"],
  "Cached input text tokens": ["Cached input", "キャッシュ入力", "缓存输入", "캐시 입력"],
  "Cache-write input text tokens": ["Cache write", "キャッシュ書き込み", "缓存写入", "캐시 쓰기"],
  "5-minute cache-write input tokens": ["Cache write (5 min)", "キャッシュ書き込み（5 分）", "缓存写入（5 分钟）", "캐시 쓰기(5분)"],
  "1-hour cache-write input tokens": ["Cache write (1 hour)", "キャッシュ書き込み（1 時間）", "缓存写入（1 小时）", "캐시 쓰기(1시간)"],
  "Text to image": ["Text to image", "テキストから画像", "文生图", "텍스트 이미지 생성"],
  "Edit": ["Image edit", "画像編集", "图像编辑", "이미지 편집"],
  "Text to video": ["Text to video", "テキストから動画", "文生视频", "텍스트 동영상 생성"],
  "Text-to-video": ["Text to video", "テキストから動画", "文生视频", "텍스트 동영상 생성"],
  "Image to video": ["Image to video", "画像から動画", "图生视频", "이미지 동영상 생성"],
  "text-to-video": ["Text to video", "テキストから動画", "文生视频", "텍스트 동영상 생성"],
  "image-to-video": ["Image to video", "画像から動画", "图生视频", "이미지 동영상 생성"],
  "video-to-video": ["Video to video", "動画から動画", "视频编辑", "동영상 편집"],
  "Input image": ["Input image", "入力画像", "输入图像", "입력 이미지"],
  "Output image": ["Output image", "出力画像", "输出图像", "출력 이미지"],
  "Output video": ["Output video", "出力動画", "输出视频", "출력 동영상"],
  "Reference video input": ["Reference video", "参照動画", "参考视频", "참조 동영상"],
  "Layer decomposition": ["Layer separation", "レイヤー分離", "图层分离", "레이어 분리"],
  "Additional input image after the first": ["Input images after the first", "2 枚目以降の入力画像", "首张之后的输入图像", "두 번째부터의 입력 이미지"],
  "Reference images after the first five": ["References beyond 5", "5 枚を超える参照画像", "超过 5 张的参考图像", "5장을 초과하는 참조 이미지"],
  "Each supplied reference image": ["Reference images", "参照画像", "参考图像", "참조 이미지"],
  "Input duration, capped at 5 seconds per request": ["Input video, maximum 5s", "入力動画（最大 5 秒）", "输入视频，最多 5 秒", "입력 동영상, 최대 5초"],
  "Background removal": ["Background removal", "背景除去", "背景移除", "배경 제거"],
  "Fibo image editing": ["Image edit", "画像編集", "图像编辑", "이미지 편집"],
  "Kling 3 Standard": ["Standard", "標準", "标准", "표준"],
  "text": ["Text only", "テキストのみ", "仅文本", "텍스트만"],
  "style_references": ["Style references", "スタイル参照", "风格参考", "스타일 참조"],
  "moodboards": ["Moodboards", "ムードボード", "情绪板", "무드보드"],
};

const units: Record<string, Translation> = {
  "1M tokens": ["1M tokens", "1M トークン", "1M 令牌", "1M 토큰"],
  "1K video tokens": ["1K video tokens", "1K 動画トークン", "1K 视频令牌", "1K 동영상 토큰"],
  "second": ["second", "秒", "秒", "초"], "minute": ["minute", "分", "分钟", "분"],
  "5 seconds": ["5 seconds", "5 秒", "5 秒", "5초"],
  "30 output frames, rounded up": ["30 frames (rounded up)", "30 フレーム（切り上げ）", "30 帧（向上取整）", "30프레임(올림)"],
  "request": ["request", "リクエスト", "请求", "요청"],
  "completed operation": ["operation", "操作", "操作", "작업"],
  "generation": ["generation", "生成", "次生成", "생성"],
  "image": ["image", "画像", "图像", "이미지"],
  "generated image": ["image", "画像", "图像", "이미지"],
  "input image": ["input image", "入力画像", "输入图像", "입력 이미지"],
  "output image": ["output image", "出力画像", "输出图像", "출력 이미지"],
  "reference image": ["reference image", "参照画像", "参考图像", "참조 이미지"],
  "additional reference image": ["extra reference image", "追加参照画像", "额外参考图像", "추가 참조 이미지"],
  "usage credit": ["usage credit", "使用量クレジット", "用量积分", "사용량 크레딧"],
  "video credit": ["video credit", "動画クレジット", "视频积分", "동영상 크레딧"],
  "variable based on reported usage": ["request usage", "リクエスト使用量", "请求用量", "요청 사용량"],
  "variable per request": ["request usage", "リクエスト使用量", "请求用量", "요청 사용량"],
  "variable with output video duration": ["video duration", "動画の長さ", "视频时长", "동영상 길이"],
  "variable with processed pixels": ["pixels and duration", "画素数と長さ", "像素和时长", "픽셀 및 길이"],
  "variable with text length": ["text length", "テキスト長", "文本长度", "텍스트 길이"],
  "varies with image dimensions and scale": ["dimensions and scale", "寸法と拡大率", "尺寸与缩放", "크기 및 배율"],
};

export function formatUnit(unit: string, locale: PricingLocale): string {
  const value = unit.replace(/^per /, "");
  return units[value]?.[localeIndex[locale]] ?? value;
}

const omittedPhrases = new Set([
  "", "Generation", "Generated image", "Image generation", "Video generation", "Audio generation",
  "Output video duration", "Completed output duration", "Sound generation duration", "Character-count usage", "Usage-based rate",
  "The amount depends on reported usage", "The amount depends on reported usage.",
  "The request charge varies with reported usage.", "The image-generation request charge varies with reported usage.",
  "The request charge varies with completed output duration.", "The charge varies with image dimensions, duration, and frame rate.",
  "The request charge depends on image dimensions and scale.",
  "Rate applies to provider-reported video-credit quantity.", "Rate applies to the usage-credit quantity reported for the request.",
]);

export function formatOption(conditions: string | undefined, locale: PricingLocale): string {
  const index = localeIndex[locale];
  const translate = (value: string) => phrases[value]?.[index] ?? value;
  const parts = (conditions ?? "").split(";").map((part) => part.trim()).filter((part) => !omittedPhrases.has(part));
  return [...new Set(parts.map((part) => {
    if (!part.includes("=")) return translate(part);
    const [key, value] = part.split("=", 2);
    if (["resolution", "output size"].includes(key)) return value.replace(/P$/, "p").replace(/^(720|1080)$/, "$1p").replace(/x/g, " × ");
    if (["generateAudio", "generate_audio"].includes(key)) return value === "true"
      ? ["With audio", "音声あり", "包含音频", "오디오 포함"][index]
      : ["No audio", "音声なし", "无音频", "오디오 없음"][index];
    if (key === "draft") return value === "true" ? ["Draft", "ドラフト", "草稿", "초안"][index] : ["Standard", "標準", "标准", "표준"][index];
    if (key === "quality") return ({ low: ["Low", "低", "低", "낮음"], medium: ["Medium", "中", "中", "중간"], high: ["High", "高", "高", "높음"], xhigh: ["Extra high", "最高", "超高", "매우 높음"], max: ["Max", "最大", "最高", "최대"], DEFAULT: ["Standard", "標準", "标准", "표준"], TURBO: ["Turbo", "Turbo", "Turbo", "Turbo"], QUALITY: ["Quality", "高品質", "高质量", "고품질"] } as Record<string, string[]>)[value]?.[index] ?? value;
    if (key === "video_type" || key === "feature") return translate(value);
    if (key === "type") return value === "image_edit" ? translate("Edit") : ["Image generation", "画像生成", "图像生成", "이미지 생성"][index];
    if (key === "endpoint") return value.includes("dialogue") ? ["Dialogue", "対話", "对话", "대화"][index] : ["Text to speech", "音声合成", "语音合成", "음성 합성"][index];
    if (key === "input_tier" || key === "output_tier") return value.replace(/^qima_(input|output)_/, "").replace(/k$/, "K").replace(/^standard$/, ["Standard", "標準", "标准", "표준"][index]).replace(/^large$/, ["Large", "大", "大", "대형"][index]);
    return part;
  }))].join(" · ") || "-";
}

export function formatAmount(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

export function formatDate(value: string, locale: PricingLocale): string {
  return new Intl.DateTimeFormat({ en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR" }[locale], {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}
