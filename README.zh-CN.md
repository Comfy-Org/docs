# ComfyUI 文档

| [English](https://github.com/Comfy-Org/docs/blob/main/README.md) | [中文](https://github.com/Comfy-Org/docs/blob/main/README.zh-CN.md) | [日本語](https://github.com/Comfy-Org/docs/blob/main/README.ja-JP.md) |

## 开发

要在本地预览文档更改，请先安装依赖，然后启动开发服务器：

```
npm i
npm run dev
```

修改英文文档后同步翻译，见下方 [自动翻译](#自动翻译)（`npm run translate`）。

### 创建 PR

创建一个 PR。一旦被接受，Vercel 将把更改部署到 https://docs.comfy.org/

### 生成 API 参考文档

可以使用 OpenAPI 文件或包含该文件的 URL：

```bash
cd registry/api-reference # 按产品分类保存 API 文件
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

这只会为每个端点生成 MDX 文件。你需要在 `docs.json` 中添加这些文件的链接，最新的 API 规范将显示在该文档页面上。

## 关于文件重命名的特殊说明

- 重命名文件可能导致一些外部链接无法访问，因为它们已经在大量文章和模板中使用。
- 由于我们可以通过 `docs.json` 文件重新组织侧边栏导航，所以除非特别必要，我们一般不改动原始文档的文件位置。
- 如果你重命名了任何文件并导致文件路径发生变化，请更新 `docs.json` 中的 `redirects` 列表。

GitHub Action 将检查重定向规则，如果缺少重定向规则，PR 将无法通过检查。重定向规则应遵循以下格式：

> ```json
> "redirects": [
>   {
>     "source": "/path/to/old-file",
>     "destination": "/path/to/new-file"
>   }
> ]
> ```
> 同时不要忘记在 `zh` 目录中包含相应的中文翻译文件！

你也可以参考 [Mintlify 文档](https://www.mintlify.com/docs/create/redirects) 了解如何添加和匹配通配符路径。

## 关于内置节点文档

ComfyUI 现在为内置节点和自定义节点都增加了内置的节点帮助菜单。所有内置节点文档将在[这个仓库](https://github.com/Comfy-Org/embedded-docs)进行维护。

### 同步频率

我们会每周定期将已更新的文档从对应仓库中同步到 docs.comfy.org 中来，以保证内容同步和更新。如需贡献对应的文档，请在[这个仓库](https://github.com/Comfy-Org/embedded-docs)提交 PR 和更新。

### 节点文档文件组织

对于节点文档，我们将采用在 `built-in-node` 文件夹下使用一级目录的形式，以下是对应的原因：
- ComfyUI 可能会在更新过程中调整对应的节点分类和目录，使用多级目录层级意味着要对对应节点文档进行频繁调整
- 对应的频繁调整意味着我们需要频繁添加重定向和检查
- Mintlify 支持在 `docs.json` 文件设置文档层级，我们可以统一在这里进行修改

> 由于更新历史的原因，原有的一部分文档采用了不同的文件夹层级，目前我们不再对此部分文件进行调整，新增文件将采用一级目录

## 贡献

请直接创建 PR，我们会在几天内进行审核。

或者在我们的 [Discord](https://discord.com/invite/comfyorg) 上与我们交流。

文档使用 Mintlify 构建，请参考 [Mintlify 文档](https://mintlify.com/docs) 了解如何使用。

### 国际化贡献

仓库根目录的英文 MDX 是**唯一源文件**。其它语言在对应目录下镜像相同路径（例如 `zh/get_started/introduction.mdx`、`ja/get_started/introduction.mdx`）。可复用片段在 `snippets/` 下，各语言副本位于 `snippets/zh/`、`snippets/ja/` 等。

文件编辑规范见 [Mintlify](https://mintlify.com/docs/page) 文档 Writing Content 部分。

> **说明**：`built-in-nodes/` 由 [embedded-docs](https://github.com/Comfy-Org/embedded-docs) 仓库维护，翻译脚本会**自动跳过**该目录。

#### 自动翻译

本仓库提供基于 hash 的翻译脚本：对比英文源与译文中的 `translationSourceHash`，英文变更后会对该文件做**全量重译**。

**准备工作**

1. 安装 [Bun](https://bun.sh)
2. 复制环境变量模板并填入 API Key：

```bash
cp .env.local.example .env.local
# 设置 TRANSLATE_API_KEY（兼容 OpenAI 的接口：DashScope Qwen-MT、OpenRouter、DeepSeek 等）
```

**npm 命令**

| 命令 | 说明 |
|------|------|
| `npm run translate` | 翻译 `translation-config.json` 中配置的所有语言 |
| `npm run translate:dry-run` | 预览待翻译文件，不调用 API |
| `npm run translate:force` | 忽略 hash，强制全量重译 |
| `npm run translate:snippets` | 仅翻译 `snippets/` |
| `npm run translate:snippets:dry-run` | 预览待翻译的 snippet |

通过 `--` 传递额外参数：

```bash
npm run translate -- --lang zh,ja
npm run translate:dry-run -- --lang ja
npm run translate -- installation/manual_install.mdx
```

**工作原理**

- **输入**：英文 MDX（主源）+ 目标语言现有译文（作上下文，若有）
- **输出**：写入 `zh/`、`ja/` 等目录，并更新 frontmatter 中的 `translationSourceHash`（snippet 使用 HTML 注释保存 hash）
- **跳过路径**：`built-in-nodes/`（在 `translation-config.json` 的 `skip_paths` 中配置）
- **目录**：写入文件时会自动创建子目录，无需手动 `mkdir`

脚本路径：`.github/scripts/translate-i18n.ts`

#### 添加新语言

1. 在 `.github/scripts/translation-config.json` 的 `languages` 中注册：

```json
{
  "code": "fr",
  "name": "French",
  "dir": "fr",
  "snippets_dir": "snippets/fr"
}
```

2. 在 `docs.json` 的 `navigation.languages` 中添加导航（复制英文结构，路径前缀改为 `fr/`）。参见 [Mintlify 本地化](https://mintlify.com/docs/navigation/localization)。

3. 执行翻译：

```bash
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

`docs.json` 中的 `language` 须与 [Mintlify 支持的语言代码](https://mintlify.com/docs/navigation/localization) 一致；文件夹名（`fr/`、`zh/`、`ja/`）应与 `translation-config.json` 里的 `dir` 字段一致。

#### 手动翻译

也可不用脚本、手工维护译文：

1. 在语言目录下创建与英文**相同路径和文件名**的 MDX 文件。
2. 本地化 `import`（`/snippets/...` → `/snippets/zh/...`）和内部链接（`/path` → `/zh/path`）。
3. 在 `docs.json` 对应语言的导航中注册页面路径。

英文 MDX 变更时，`i18n-sync-check` 工作流会**警告**未同步的译文，并在 PR 中留言提醒 [@comfyui-wiki](https://github.com/comfyui-wiki)。可手工修改译文，或重新运行 `npm run translate`。

#### 贡献工作流示例

向文档中添加工作流示例时，请遵循以下步骤：

1. 使用 ComfyUI 输出的工作流文件（PNG/WebP），并在元数据中添加模型下载链接。用户拖入工作流时将自动获取这些资源。可以使用这个[在线工具](https://comfyui-embeded-workflow-editor.vercel.app/)编辑 PNG/WebP 文件的元数据。

[![视频教程](https://img.youtube.com/vi/_zYbP8w7G8A/0.jpg)](https://youtu.be/_zYbP8w7G8A)

2. 将工作流 JSON 文件和预览图上传至 [example_workflows 仓库](https://github.com/Comfy-Org/example_workflows)
3. 在文档中使用 GitHub 原始内容链接。转换 GitHub 文件链接的方法：
   - 原始 GitHub 文件链接格式：
     ```
     https://github.com/Comfy-Org/example_workflows/blob/main/your-workflow.json
     ```
   - 将域名改为 raw.githubusercontent.com 并移除 '/blob'：
     ```
     https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/your-workflow.json
     ```

   也可以直接在 GitHub 文件页面点击 "Raw" 按钮获取原始链接。

这样可以确保在文档站点中拖入工作流时，元数据信息能完整保留到 ComfyUI 中。
