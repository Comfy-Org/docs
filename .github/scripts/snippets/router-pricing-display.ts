export type PricingLocale = "en" | "ja" | "zh" | "ko";
export type PricingCategory = "images" | "video" | "text" | "audio" | "3d";

const localeIndex = { en: 0, ja: 1, zh: 2, ko: 3 } as const;
type Translation = readonly [string, string, string, string];

export const pricingCopy = {
  en: {
    title: "Comfy Router pricing", sidebar: "Pricing",
    description: "Compare Comfy Router model prices in credits or USD by serving provider across image, video, text, audio, and 3D.",
    intro: (creditsPerUsd: number) => `Prices are in Comfy credits. ${creditsPerUsd} credits = $1 USD. Use the currency switch to view prices in USD. Each rate includes its unit. Tables group serving providers; Model ID prefixes identify model owners. [See provider coverage](/development/comfy-router/providers).`,
    currencyLabel: "Currency",
    updated: "Prices updated",
    imageTiers: "Image quality and resolution",
    tokenRates: "Token rates",
    ratesPer: (unit: string) => `Rates per ${unit}`,
    imageOperationRates: "Image generation and edit rates",
    qwenImageRates: "Qwen Image 3.0 output image rates",
    seedreamProRates: "Seedream 5.0 Pro output image rates",
    seedanceVideoTokenRates: "Seedance video token rates",
    seedanceAudioTokenRates: "Seedance 1.5 Pro audio rates",
    lumaUniRates: "Image generation and then image edit",
    ideogramImageRates: "Ideogram image rates",
    switchxRates: "SwitchX image and video rates",
    switchxBillingNote: "Images are billed per output image. Videos are billed per 30 output frames, rounded up.",
    kreaGenerationRates: "Krea 2 generation rates (credits / generation)",
    durationRates: "Rates by duration",
    usageRates: "Usage-based rates",
    byResolution: (unit: string) => `Per ${unit} by resolution`,
    videoDuration: "Video rates apply to output plus reference-video duration.",
    resolution: "Resolution", duration: "Duration", mode: "Mode", audio: "Audio", inputType: "Input type", type: "Type", operation: "Operation", quality: "Quality",
    model: "Name", modelId: "Model ID", option: "Option", credits: "Credits", input: "Input credits", cached: "Cached input credits", output: "Output credits",
    variable: "Usage-based", unavailable: "Not published",
    status: "Usage-based rates vary by request. Unpublished prices do not mean free usage.",
    categories: { images: "Images", video: "Video", text: "Text & multimodal", audio: "Audio", "3d": "3D" },
  },
  ja: {
    title: "Comfy Router の料金", sidebar: "料金",
    description: "Comfy Router の画像、動画、テキスト、音声、3D モデルの料金を、クレジットまたは USD で提供プロバイダー別に比較できます。",
    intro: (creditsPerUsd: number) => `料金は Comfy クレジットです。${creditsPerUsd} クレジット = $1 USD です。通貨スイッチで USD 表示に切り替えられます。各料金に請求単位を記載しています。表は提供プロバイダー別で、Model ID の接頭辞はモデルの所有元を示します。[プロバイダーの対応状況](/development/comfy-router/providers)。`,
    currencyLabel: "通貨",
    updated: "料金の更新日",
    imageTiers: "画像の品質と解像度",
    tokenRates: "トークン料金",
    ratesPer: (unit: string) => `${unit}あたりの料金`,
    imageOperationRates: "画像生成・編集料金",
    qwenImageRates: "Qwen Image 3.0 の出力画像料金",
    seedreamProRates: "Seedream 5.0 Pro の出力画像料金",
    seedanceVideoTokenRates: "Seedance 動画トークン料金",
    seedanceAudioTokenRates: "Seedance 1.5 Pro 音声料金",
    lumaUniRates: "画像生成後の編集",
    ideogramImageRates: "Ideogram 画像料金",
    switchxRates: "SwitchX の画像・動画料金",
    switchxBillingNote: "画像は出力画像ごと、動画は30出力フレームごと（切り上げ）に課金されます。",
    kreaGenerationRates: "Krea 2 生成料金（クレジット/生成）",
    durationRates: "時間別の料金",
    usageRates: "使用量ベースの料金",
    byResolution: (unit: string) => `解像度別の${unit}料金`,
    videoDuration: "動画料金は出力動画と参照動画の合計時間に適用されます。",
    resolution: "解像度", duration: "長さ", mode: "モード", audio: "音声", inputType: "入力の種類", type: "種類", operation: "操作", quality: "品質",
    model: "名前", modelId: "モデル ID", option: "オプション", credits: "クレジット", input: "入力クレジット", cached: "キャッシュ入力クレジット", output: "出力クレジット",
    variable: "使用量ベース", unavailable: "未公開",
    status: "使用量ベースの料金はリクエストごとに変わります。未公開の料金は無料を意味しません。",
    categories: { images: "画像", video: "動画", text: "テキスト・マルチモーダル", audio: "音声", "3d": "3D" },
  },
  zh: {
    title: "Comfy Router 定价", sidebar: "定价",
    description: "按服务提供方比较 Comfy Router 图像、视频、文本、音频和 3D 模型的积分或 USD 价格。",
    intro: (creditsPerUsd: number) => `价格以 Comfy 积分显示。${creditsPerUsd} 积分 = $1 USD。使用货币开关可切换为 USD。每项费率均标明计费单位。表格按服务提供方分组，Model ID 前缀表示模型所属方。[查看提供方覆盖情况](/development/comfy-router/providers)。`,
    currencyLabel: "货币",
    updated: "价格更新日期",
    imageTiers: "图像质量和分辨率",
    tokenRates: "Token 费率",
    ratesPer: (unit: string) => `每${/^[A-Za-z]/.test(unit) ? " " : ""}${unit}费率`,
    imageOperationRates: "图像生成与编辑价格",
    qwenImageRates: "Qwen Image 3.0 输出图像价格",
    seedreamProRates: "Seedream 5.0 Pro 输出图像价格",
    seedanceVideoTokenRates: "Seedance 视频 Token 价格",
    seedanceAudioTokenRates: "Seedance 1.5 Pro 音频价格",
    lumaUniRates: "图像生成后编辑",
    ideogramImageRates: "Ideogram 图像价格",
    switchxRates: "SwitchX 图像和视频价格",
    switchxBillingNote: "图像按输出图像计费；视频按每 30 个输出帧计费，不足 30 帧按 30 帧计。",
    kreaGenerationRates: "Krea 2 价格（积分/次生成）",
    durationRates: "按时长计费",
    usageRates: "按用量计费",
    byResolution: (unit: string) => `按分辨率的${unit}费率`,
    videoDuration: "视频费率按输出视频与参考视频的总时长计算。",
    resolution: "分辨率", duration: "时长", mode: "模式", audio: "音频", inputType: "输入类型", type: "类型", operation: "操作", quality: "质量",
    model: "名称", modelId: "模型 ID", option: "选项", credits: "积分", input: "输入积分", cached: "缓存输入积分", output: "输出积分",
    variable: "按用量计费", unavailable: "未发布",
    status: "按用量计费的价格因请求而异。未发布的价格并不表示免费。",
    categories: { images: "图像", video: "视频", text: "文本与多模态", audio: "音频", "3d": "3D" },
  },
  ko: {
    title: "Comfy Router 요금", sidebar: "요금",
    description: "Comfy Router의 이미지, 동영상, 텍스트, 오디오 및 3D 모델 요금을 제공자별로 크레딧 또는 USD로 비교하세요.",
    intro: (creditsPerUsd: number) => `가격은 Comfy 크레딧으로 표시합니다. ${creditsPerUsd} 크레딧 = $1 USD입니다. 통화 스위치로 USD 표시를 선택할 수 있습니다. 각 요금에 청구 단위를 명시합니다. 표는 제공자별로 그룹화하고 Model ID 접두사는 모델 소유자를 나타냅니다. [제공 범위 보기](/development/comfy-router/providers).`,
    currencyLabel: "통화",
    updated: "요금 업데이트",
    imageTiers: "이미지 품질 및 해상도",
    tokenRates: "토큰 요금",
    ratesPer: (unit: string) => `${unit}당 요금`,
    imageOperationRates: "이미지 생성 및 편집 요금",
    qwenImageRates: "Qwen Image 3.0 출력 이미지 요금",
    seedreamProRates: "Seedream 5.0 Pro 출력 이미지 요금",
    seedanceVideoTokenRates: "Seedance 동영상 토큰 요금",
    seedanceAudioTokenRates: "Seedance 1.5 Pro 오디오 요금",
    lumaUniRates: "이미지 생성 후 편집",
    ideogramImageRates: "Ideogram 이미지 요금",
    switchxRates: "SwitchX 이미지 및 동영상 요금",
    switchxBillingNote: "이미지는 출력 이미지당, 동영상은 30개 출력 프레임 단위로 올림하여 청구합니다.",
    kreaGenerationRates: "Krea 2 요금(생성당 크레딧)",
    durationRates: "길이별 요금",
    usageRates: "사용량 기반 요금",
    byResolution: (unit: string) => `해상도별 ${unit} 요금`,
    videoDuration: "동영상 요금은 출력 동영상과 참조 동영상의 총 길이에 적용됩니다.",
    resolution: "해상도", duration: "길이", mode: "모드", audio: "오디오", inputType: "입력 유형", type: "유형", operation: "작업", quality: "품질",
    model: "이름", modelId: "모델 ID", option: "옵션", credits: "크레딧", input: "입력 크레딧", cached: "캐시 입력 크레딧", output: "출력 크레딧",
    variable: "사용량 기반", unavailable: "게시되지 않음",
    status: "사용량 기반 요금은 요청마다 달라집니다. 게시되지 않은 요금은 무료라는 뜻이 아닙니다.",
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
  "Input duration, capped at 5 seconds per request": ["Input video (max 5s)", "入力動画（最大 5 秒）", "输入视频（最多 5 秒）", "입력 동영상(최대 5초)"],
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
  "5 seconds": ["5 s", "5 秒", "5 秒", "5초"],
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
  "usage credit": ["Meshy credit", "Meshy クレジット", "Meshy 积分", "Meshy 크레딧"],
  "video credit": ["Kling credit", "Kling クレジット", "Kling 积分", "Kling 크레딧"],
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
    if (["resolution", "output size"].includes(key)) {
      const dimensions = value.match(/^(\d+)[x×](\d+)$/);
      if (dimensions) {
        const sides = dimensions.slice(1).map(Number).sort((a, b) => b - a);
        return `${sides[0]} × ${sides[1]}`;
      }
      return value.replace(/P$/, "p").replace(/k$/, "K").replace(/^(720|1080)$/, "$1p");
    }
    if (["generateAudio", "generate_audio"].includes(key)) return value === "true"
      ? ["Audio", "音声", "音频", "오디오"][index]
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
