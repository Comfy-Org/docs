# Tutorial workflow page standardization spec

Apply to any MDX tutorial page that links to `cloud.comfy.org/?template=` or `workflow_templates`.

## Source of truth for template metadata

- Index: `/Users/linmoumou/Documents/comfy/workflow_templates/templates/index.json`
- Local templates JSON: `/Users/linmoumou/Documents/comfy/workflow_templates/templates/{name}.json`
- Manifest (webp filenames): `/Users/linmoumou/Documents/comfy/workflow_templates/packages/core/src/comfyui_workflow_templates_core/manifest.json`

For each `template` name referenced on a page, look up `name`, `title`, `description`, `io.inputs`, `io.outputs`, `thumbnail`, `thumbnailVariant` in `index.json`.

## Per-workflow section structure

Each distinct template on a page gets its own `###` subsection:

```mdx
### {title from index} (`{template_name}`)

{description from index — one short paragraph, can trim if already covered above}

<img src="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/{template_name}-1.webp" alt="{title} workflow preview" />

### Workflow preview images (`templates/*-N.webp`)

- Files like `{template_name}-1.webp`, `-2.webp`, etc. under `templates/` are **workflow preview thumbnails only**.
- Use them **only** in the preview `<img>` above (immediately after the `###` heading, before `<CardGroup>`).
- **Never** use any `templates/*.webp` in **Input materials** or **Example output** sections. Those sections must use `input/{file}` and `output/{file}` from `index.json` only.

<CardGroup cols={2}>
  <Card title="Run on Comfy Cloud" icon="cloud" href="https://cloud.comfy.org/?template={template_name}&utm_source=docs&utm_medium=referral&utm_campaign={page-stem}">
    Open in Comfy Cloud
  </Card>
  <Card title="Download Workflow" icon="download" href="https://github.com/Comfy-Org/workflow_templates/blob/main/templates/{template_name}.json">
    Download JSON or search &quot;{title}&quot; in Template Library
  </Card>
</CardGroup>
```

- **`page-stem`**: MDX filename without extension (e.g. `z-image-turbo` for `z-image-turbo.mdx`).
- **UTM**: always `utm_source=docs&utm_medium=referral&utm_campaign={page-stem}`. Replace `inhouse_social`, `boogu_image_launch`, or other legacy campaign values.
- **CardGroup**: always `cols={2}` for Cloud + Download pairs. Never use `cols={1}` for these.
- **CardGroup lines must NOT start with `|`** — that renders as broken markdown tables.

## Input materials (when `io.inputs` exists)

```mdx
**Input materials**

Upload these files to the matching `LoadImage` nodes:

<CardGroup cols={2}>
  <Card title="{filename}" icon="image" href="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/input/{filename}">
    `LoadImage` node {nodeId} · `{filename}`
  </Card>
</CardGroup>

<div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem', alignItems: 'start'}}>
  <img src="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/input/{filename}" alt="{filename}" style={{width: '100%', height: 'auto', objectFit: 'contain'}} />
</div>
```

Use `repeat(2, ...)` even for a single image. For multiple inputs, one card and one `<img>` per input in the grid.

## Example output

**Text-to-image** (only `io.outputs`, no inputs): single output image from `output/{file}`.

```mdx
**Example output**

![{alt}](https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/output/{file})
```

**Edit / compare** (`thumbnailVariant: compareSlider` or `thumbnail` array with input + output):

```mdx
**Example output**

<div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem', alignItems: 'start'}}>
  <img src="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/input/{input_file}" alt="Input image" style={{width: '100%', height: 'auto', objectFit: 'contain'}} />
  <img src="https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/output/{output_file}" alt="{title} example output" style={{width: '100%', height: 'auto', objectFit: 'contain'}} />
</div>
```

**URL verification**: run `curl -s -o /dev/null -w "%{http_code}" -L {url}` before embedding. If `output/{file}` 404s, **omit the Example output section** entirely. Do not substitute `templates/*-N.webp` preview thumbnails.

## Model download cards

- Wrap in `<CardGroup cols={2}>` when there are multiple model cards.
- Hugging Face links: use `https://huggingface.co/{org}/{repo}/blob/main/...` — **not** `/resolve/main`.
- Do not change model filenames or storage paths unless fixing an obvious broken link.

## Reference pages (already standardized — copy patterns from these)

| Page | Notes |
|------|-------|
| `tutorials/flux/flux-2-dev.mdx` | Multiple workflows, inputs + compare output |
| `tutorials/flux/flux-2-klein.mdx` | Six workflow subsections |
| `tutorials/image/qwen/qwen-image-edit-2511.mdx` | Two inputs, compare output |
| `tutorials/image/qwen/qwen-image-layered.mdx` | Single input |
| `tutorials/image/z-image/z-image.mdx` | T2I output, CardGroup model downloads |
| `tutorials/image/boogu/boogu-image-0.1.mdx` | Turbo + Edit, UTM `boogu-image-0-1` |

## i18n (zh / ja / ko)

For every English file updated, apply the same structural changes to:

- `zh/{same-path}`
- `ja/{same-path}`
- `ko/{same-path}`

Translate user-facing labels only (`Run on Comfy Cloud`, `Input materials`, `Example output`, card titles, alt text). Keep URLs, template names, node IDs, and filenames identical.

Preserve existing frontmatter (`translationSourceHash`, `translationBlockHashes`, etc.). Do not remove `translationFrom`.

Label translations:
| EN | zh | ja | ko |
|----|----|----|-----|
| Run on Comfy Cloud | 在 Comfy Cloud 上运行 | Comfy Cloud で実行 | Comfy Cloud에서 실행 |
| Download Workflow | 下载工作流 | ワークフローをダウンロード | 워크플로 다운로드 |
| Input materials | 输入素材 | 入力素材 | 입력 자료 |
| Example output | 输出示例 | 出力例 | 출력 예시 |

## Prose style

- Avoid em dashes (—). Use periods, commas, or colons.
- Match technical reference tone of surrounding pages.

## Scope rules

- **Only edit workflow-related sections** — do not rewrite intros, model storage trees, or unrelated content unless fixing HF `resolve` → `blob` links in model download cards on the same page.
- **Skip pages already passing audit** (have `-1.webp` preview, `CardGroup cols={2}`, correct UTM, no `resolve/main` in HF links on page).
- **Do not commit** unless explicitly asked.

## Audit script

`audit_workflows.py` checks tutorial MDX under `tutorials/` and `zh|ja|ko/tutorials/`:

```bash
python3 .cursor/skills/tutorial-workflow-standard/audit_workflows.py        # report only
python3 .cursor/skills/tutorial-workflow-standard/audit_workflows.py --fix  # auto-fix webp misuse + empty Cards
```

Requires sibling repo `../workflow_templates/templates/index.json` for output URL lookups when fixing webp misuse.

## Already completed (skip unless still failing audit)

- `tutorials/flux/flux-2-dev.mdx` (+ zh/ja/ko partial — sync i18n if EN-only)
- `tutorials/flux/flux-2-klein.mdx`
- `tutorials/image/qwen/qwen-image-2512.mdx`, `qwen-image-edit-2511.mdx`, `qwen-image-layered.mdx` (+ zh/ja/ko for layered)
- `tutorials/image/z-image/z-image.mdx` (+ zh/ja/ko)
- `tutorials/image/boogu/boogu-image-0.1.mdx` (+ zh/ja/ko)
