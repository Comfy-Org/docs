# Tutorials quality audit (English `tutorials/`)

**Date:** 2026-10-28  
**Reference pattern:** [PR #2124](https://github.com/Comfy-Org/docs/pull/2124) (MiniMax H3 overview slim)  
**Auditor:** Cloud agent (Jason / ComfyUI China docs)

## Method

1. Ranked English MDX under `tutorials/` by line count and `##` heading count.
2. Spot-checked video/image hubs: MiniMax, LTX, Wan, Hunyuan, Kandinsky, Qwen, Flux, partner-node overviews.
3. Ran `python3 .github/scripts/check-anchors.py` repo-wide (1 unrelated ko router break).

## Open fix PRs (this run)

| PR | Topic | Issue classes |
|----|--------|----------------|
| [#2160](https://github.com/Comfy-Org/docs/pull/2160) | Wan2.2 hub | Bloated landing, wrong embed, missing template index, **P0 wrong I2V checkpoint steps** |
| [#2161](https://github.com/Comfy-Org/docs/pull/2161) | LTX-2.3 hub | Monolith overview, duplicate headings, missing IC-LoRA anchor |
| [#2162](https://github.com/Comfy-Org/docs/pull/2162) | Hunyuan Video 13B | Architecture wall, no workflow cards, license buried |

## Ranked findings

Severity: **P0** user harm / wrong steps, **P1** hub shape / stale claims, **P2** polish / SEO / i18n debt.

| Path | Class | Sev | Evidence (1 line) | Suggested fix | PR |
|------|--------|-----|-------------------|---------------|-----|
| `tutorials/video/wan/wan2_2.mdx` | Wrong instructions | P0 | 14B I2V steps named `wan2.2_t2v_*_fp8_scaled` while download cards list `wan2.2_i2v_*_fp16` | Correct step list; mirror in zh/ja/ko | [#2160](https://github.com/Comfy-Org/docs/pull/2160) |
| `tutorials/video/ltx/ltx-2-3.mdx` | Bloated overview | P1 | ~593 lines, six full workflows on one page, duplicate `###` + `{#anchor}` pairs | Template CardGroup + split siblings (like MiniMax) | [#2161](https://github.com/Comfy-Org/docs/pull/2161) (partial) |
| `tutorials/video/ltx/ltx-2-5.mdx` | Bloated overview | P1 | ~258 lines, same monolith pattern as LTX-2.3 pre-fix | Slim hub + child pages | Audit only |
| `tutorials/video/ltx/ltx-2.mdx` | Bloated overview | P2 | ~213 lines, all modes on hub | Card index; optional split | Audit only |
| `tutorials/video/wan/wan2_2.mdx` | Hub shape / fluff | P1 | Marketing paragraphs, 3 livestreams above workflows, unrelated Selection Toolbox embed | Short intro + cards + license note | [#2160](https://github.com/Comfy-Org/docs/pull/2160) |
| `tutorials/video/wan/wan2_2.mdx` | Frontmatter | P2 | Title `...Official Native Workflow Example` (banned template) | Retitle `{Model} in ComfyUI: {capability}` + zh/ja/ko | Audit only |
| `tutorials/video/hunyuan/hunyuan-video.mdx` | Bloated overview | P1 | DiT/VAE essay + hero video before workflow pick | Intro + license + CardGroup | [#2162](https://github.com/Comfy-Org/docs/pull/2162) |
| `tutorials/video/hunyuan/hunyuan-video.mdx` | Frontmatter | P2 | `This guide shows how to...` description | Factual scope description + locales | Audit only |
| `tutorials/video/hunyuan/hunyuan-video-1-5.mdx` | Hub shape | P2 | Better title; still long shared-model + dual workflow on one page | Add template CardGroup at top | Audit only |
| `tutorials/video/wan/vace.mdx` | Bloated overview | P1 | ~413 lines, multi-mode hub | Split or card index | Audit only |
| `tutorials/image/qwen/qwen-image.mdx` | Bloated overview | P1 | ~374 lines on landing | Split variants to siblings | Audit only |
| `tutorials/video/kandinsky/kandinsky-5.mdx` | Hub shape | P2 | DiT bullet essay on hub; workflows OK | Slim `## Overview` architecture block | Audit only |
| `tutorials/video/minimax/minimax-h3.mdx` | Reference good | — | Post–#2124: intro, license, cards (~66 lines) | Use as template | Merged main |
| `tutorials/video/minimax/minimax-h3-native.mdx` | Deep how-to | — | ~252 lines, appropriate sibling depth | Keep | — |
| `tutorials/partner-nodes/minimax/minimax-h3.mdx` | License presentation | P2 | API page license note good; long workflow enum | Optional CardGroup like native H3 | Audit only |
| `tutorials/partner-nodes/luma/luma-text-to-video.mdx` | Stale product | P1 | Legacy Ray 2 workflow documented as broken after Oct 2026 | Remove or replace with Ray 3.2 nodes | Audit only |
| `tutorials/partner-nodes/pricing.mdx` | Scope | — | 1649 lines (pricing table, not a model hub) | Out of scope | — |
| `ko/development/comfy-router/queue.mdx` | Dead anchor | P2 | `#요청은-호출자별로-속도-제한됨` → limitations page | Fix slug (not tutorials) | Audit only |

## Spot-check notes (non-overview)

- **MiniMax H3 native / multiframe / fastvideo:** Depth correctly lives off the overview; inbound links to `#commercial-licensing` removed on overview (license in `<Note>` + section). Good.
- **Wan VACE / Fun Control:** Long single-page guides; consider same CardGroup pattern as Wan2.2.
- **Flux / SD hubs:** Generally shorter than video monoliths; lower priority than LTX/Wan/Qwen.
- **Desktop-only:** No widespread `i2v_continuation` without label found in EN video hubs after MiniMax slim; keep an eye on template-only nodes in partner API pages.

## Recommended daytime triage (Jason)

1. Review and merge **#2160** first (wrong checkpoint names).
2. **#2161 / #2162**: accept hub direction; schedule follow-up splits for LTX-2.3 body and LTX-2.5 monolith.
3. Wan2.2 **i18n hub parity** (CardGroup + intro) after EN merge.
4. Batch **frontmatter** fixes for Wan2.2, Hunyuan Video, and remaining `...Official Example` titles (one family per PR per `docs-frontmatter.mdc`).
5. Luma Ray 2 legacy blocks: delete or regenerate before Oct 2026 sunset messaging goes stale.

## Commands

```bash
python3 .github/scripts/check-anchors.py
python3 .github/scripts/check-anchors.py --file tutorials/video/wan/wan2_2.mdx
```
