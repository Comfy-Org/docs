import { describe, expect, test } from "bun:test";
import {
  applyUrlMap,
  remapBlockUsingEnglishUrlMap,
  trackingUrlMap,
} from "./cms-staging-io.ts";

const COMFYUI_EN = `<Update label="v0.34.2" description="August 27, 2026">

**Partner Node Updates**
* [**Gemini Omni 1.1 Flash**](https://links.comfy.org/4wZcACf): Faster video generation and conversational editing, with 4K output and video extend

</Update>`;

const CLOUD_EN = `<Update label="v0.34.2" description="August 27, 2026">

**Partner Node Updates**
* [**Gemini Omni 1.1 Flash**](https://links.comfy.org/4qIN5DH): Faster video generation and conversational editing, with 4K output and video extend

</Update>`;

const COMFYUI_ZH = `<Update label="v0.34.2" description="2026年8月27日">

**合作伙伴节点更新**
* [**Gemini Omni 1.1 Flash**](https://links.comfy.org/4wZcACf)：更快的视频生成和对话式编辑，支持4K输出和视频扩展

</Update>`;

describe("trackingUrlMap", () => {
  test("maps comfyui shortlink onto cloud shortlink by link text", () => {
    const map = trackingUrlMap(COMFYUI_EN, CLOUD_EN);
    expect(map.get("https://links.comfy.org/4wZcACf")).toBe(
      "https://links.comfy.org/4qIN5DH"
    );
  });

  test("returns empty when dest EN is missing", () => {
    expect(trackingUrlMap(COMFYUI_EN, "").size).toBe(0);
  });
});

describe("remapBlockUsingEnglishUrlMap", () => {
  test("does not overwrite dest campaign URLs when copying a locale block", () => {
    const remapped = remapBlockUsingEnglishUrlMap(COMFYUI_ZH, COMFYUI_EN, CLOUD_EN);
    expect(remapped).toContain("https://links.comfy.org/4qIN5DH");
    expect(remapped).not.toContain("https://links.comfy.org/4wZcACf");
  });

  test("keeps source URLs when dest EN has no block yet", () => {
    const remapped = remapBlockUsingEnglishUrlMap(COMFYUI_ZH, COMFYUI_EN, null);
    expect(remapped).toContain("https://links.comfy.org/4wZcACf");
  });

  test("applyUrlMap replaces longest URLs first", () => {
    const map = new Map([
      ["https://links.comfy.org/4w", "https://example.com/short"],
      ["https://links.comfy.org/4wZcACf", "https://links.comfy.org/4qIN5DH"],
    ]);
    expect(applyUrlMap(COMFYUI_EN, map)).toContain("https://links.comfy.org/4qIN5DH");
    expect(applyUrlMap(COMFYUI_EN, map)).not.toContain("https://example.com/short");
  });
});
