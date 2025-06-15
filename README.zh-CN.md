# ComfyUI 文档

| [English](./README.md) | [中文](./README.zh-CN.md) |

## 开发

安装 [Mintlify CLI](https://www.npmjs.com/package/mintlify) 以在本地预览文档更改。使用以下命令安装：

```
npm i mintlify
```

在文档根目录（docs.json 所在位置）运行以下命令：

```
npx mintlify dev
```

### 创建 PR

创建一个 PR。一旦被接受，Vercel 将把更改部署到 https://docs.comfy.org/

### 生成 API 参考文档

可以使用 OpenAPI 文件或包含该文件的 URL：

```bash
cd registry/api-reference # 按产品分类保存 API 文件
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

这只会为每个端点生成 MDX 文件。你需要在 `docs.json` 中添加这些文件的链接，最新的 API 规范将显示在该文档页面上。

##  关于文件保存位置的特殊说明

由于部分文件在文档过程中不可避免地要对文章路径进行调整，但由于我们已经在非常多的文章和模板中已经使用的相关的文章路径，所以更改文章路径将会可能导致原始链接无法访问
- 由于文档目录组织可以通过 `docs.json` 文件来进行重新组织，所以除非特别必要，我们一般不改动原始文档的文件位置
- 如需调整，请修改 `docs.json` 来调整文件的组织
- 如果一定需要调整，请在 `docs.json` 文件中调整增加重定向规则。

> **重要提示**：当你移动或重命名MDX文件时，必须在 `docs.json` 文件中添加重定向规则。GitHub Action 将检查重定向规则，如果缺少重定向规则，PR 将无法通过检查。重定向规则应遵循以下格式：
> ```json
> "redirects": [
>   {
>     "source": "/path/to/old-file",
>     "destination": "/path/to/new-file"
>   }
> ]
> ```
> 同时不要忘记在 `zh-CN` 目录中包含相应的中文翻译文件！

## 关于 ComfyUI 节点文档的更新说明

目前 ComfyUI 已经针对内置节点和自己定义节点等，都增加了内置的节点菜单，目前所有的节点文档将在[这个仓库](https://github.com/Comfy-Org/embedded-docs)进行维护

### 更新同步频率

我们会每周定期将已更新的文档从对应仓库中同步到 docs.comfy.org 中来，以保证内容同步和更新,如需贡献对应的文档，请在 [这个仓库](https://github.com/Comfy-Org/embedded-docs) 提交 PR 和更新。

### 节点文档文件组织

对于节点文档，我们将采用在 `built-in-node` 文件夹下使用一级目录的形式，以下是对应的原因：
- ComfyUI 可能会在更新过程中调整对应的节点分类和目录，使用多级目录层级意味着要对对应节点文档进行频繁调整
- 对应的频繁调整意味着我们需要频繁添加重定向和检查
- Mintlify 支持在 `docs.json` 文件设置文档层级，我们可以统一在这里进行修改

> 由于更新历史的原因，原有的一部分文档采用了不同的文件夹层级，目前我们不再对此部分文件进行调整，新增文件将采用一级目录

## 贡献

请直接创建 PR，我们会在几天内进行审核。

或者在我们的 [Discord](https://discord.com/invite/comfyorg) 上与我们交流。

文档使用 Mintlify 构建，请参考 [Mintlify 文档](https://mintlify.com/docs) 了解如何使用

### 国际化贡献

Mintlify 使用版本控制来添加其他语言。要添加页面的翻译，请按照以下说明操作：

1. 在语言代码下创建与原始英文文件名完全相同的文件。

例如：如果你要将 `introduction.mdx` 翻译成中文，请在 `zh-CN/get_started/introduction.mdx` 下创建文件。

文件编辑的规范可以参考 [Mintlify](https://mintlify.com/docs/page) 文档中Writing Content（内容撰写）部分的章节

> **重要提示**：当你修改英文文档中的现有 MDX 文件时，必须同时更新 `zh-CN` 目录中的对应文件。GitHub Action 将自动检查此事项，如果相应的中文翻译未更新，PR 将无法通过检查。

3. 更新 `doocs.json` 的导航

对应配置请参考 [Mintlify 本地化配置](https://mintlify.com/docs/navigation/localization)

如果你翻译了单个页面，只需将新翻译的页面路径添加到对应语言的导航组中，则它会在对应的语言版本中展示。

对于 `introduction.mdx`：

```
  "navigation": {
    "languages": [
      {
        "language": "en",
        "groups": [
              {
                "group": "Get Started",
                "pages": [
                  "get_started/introduction",
                ...
                ]
              },
            ...
        ]
      },
      {
        "language": "cn",
         "groups": [
              {
                "group": "开始行动",
                "pages": [
                  "zh-CN/get_started/introduction",
                  ...
                ]
              }
            ]
      }
    ]
    ...
  }
```

Mintlify 会根据 `language` 的配置自动来确定具体不同语言版本展示哪些页面，

目前 Mintlify支持英语 (en), 中文 (cn), 西班牙语 (es), 法语 (fr), 日语 (jp), 葡萄牙语 (pt), 巴西葡萄牙语 (pt-BR), 和德语 (de) 的本地化。

更多内容请参考 Mintlify 关于[Mintlify 本地化配置](https://mintlify.com/docs/navigation/localization)的文档。

#### 添加新语言

如果某种语言尚不存在，例如，如果你要添加法语版本的`introduction.mdx`翻译，你应该在根目录新建一个 `fr-FR` 文件夹，完成对应翻译后然后请在 `docs.json` 的 `languages` 下添加以下内容：

```
{
  "languages": [
    ...
    {
        "language": "fr",
        "groups": [
              {
                "group": "Get Started",
                "pages": [
                  "fr-FR/get_started/introduction",
                  ...
                ]
              }
          ]
      }
  ]
}
```

locale 将翻译 Mintlify 默认 UI 组件的文本。这是可选的。完整的 locale 列表在[这里](https://mintlify.com/docs/settings/global#param-locale)。

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
   - 转换为原始内容链接：
     ```
     https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/your-workflow.json
     ```
     转换方法：
     - 将域名改为 raw.githubusercontent.com
     - 移除路径中的 '/blob'
   
   也可以直接在 GitHub 文件页面点击 "Raw" 按钮获取原始链接。

这样可以确保在文档站点中拖入工作流时，元数据信息能完整保留到 ComfyUI 中。
