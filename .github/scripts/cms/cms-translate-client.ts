/**
 * Minimal OpenAI-compatible client for CMS changelog block translation.
 * Uses TRANSLATE_API_* env vars — decoupled from sync-to-strapi.ts.
 */

const BASE_URL =
  process.env.TRANSLATE_API_BASE_URL ??
  process.env.TRANSLATE_CJK_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const API_KEY =
  process.env.TRANSLATE_API_KEY ??
  process.env.DEEPSEEK_API_KEY ??
  process.env.TRANSLATE_CJK_API_KEY ??
  process.env.DASHSCOPE_API_KEY ??
  "";

const MODEL =
  process.env.TRANSLATE_API_MODEL ??
  process.env.TRANSLATE_CJK_MODEL ??
  "qwen-mt-plus";

const IS_QWEN_MT = MODEL.startsWith("qwen-mt");

export function requireTranslateApiKey(): string {
  if (!API_KEY.trim()) {
    throw new Error(
      "Missing TRANSLATE_API_KEY (or DEEPSEEK_API_KEY). Required for cms:prepare translate locales."
    );
  }
  return API_KEY;
}

export async function callTranslateApi(
  messages: Array<{ role: string; content: string }>,
  extra?: Record<string, unknown>
): Promise<string> {
  const key = requireTranslateApiKey();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRANSLATE_API_TIMEOUT_MS ?? 45_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        ...extra,
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Translate API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let text = json.choices?.[0]?.message?.content?.trim() ?? "";
  text = text.replace(/[\s\S]*?<\/think>\s*/g, "");
  text = text.replace(/^```(?:mdx|markdown)?\n/, "").replace(/\n```$/, "");
  return text.trim();
}

export async function translateChangelogUpdateBlock(
  enBlock: string,
  langName: string,
  langCode: string,
  glossaryBlock?: string
): Promise<string> {
  const instructions = [
    `Translate this ComfyUI changelog MDX block to ${langName}.`,
    "Keep the exact <Update label=\"…\" description=\"…\">…</Update> structure.",
    "Preserve URLs, version labels, and product names (ComfyUI, model names).",
    "Output ONLY the translated block — no commentary.",
  ].join("\n");

  const parts = [instructions, "", enBlock];
  if (glossaryBlock) parts.push("", glossaryBlock);

  if (IS_QWEN_MT) {
    return callTranslateApi([{ role: "user", content: parts.join("\n") }], {
      translation_options: { source_lang: "English", target_lang: langName },
    });
  }

  return callTranslateApi([
    {
      role: "system",
      content: `Expert ${langName} technical translator for ComfyUI release notes.`,
    },
    { role: "user", content: parts.join("\n") },
  ]);
}

export function translateEnvSummary(): string {
  return `model=${MODEL} base=${BASE_URL}`;
}
