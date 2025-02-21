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

## 贡献

请直接创建 PR，我们会在几天内进行审核。

或者在我们的 [Discord](https://discord.com/invite/comfyorg) 上与我们交流。

文档使用 Mintlify 构建，请参考 [Mintlify 文档](https://mintlify.com/docs) 了解如何使用

### 国际化贡献

Mintlify 使用版本控制来添加其他语言。要添加页面的翻译，请按照以下说明操作：

1. 在语言代码下创建与原始英文文件名完全相同的文件。

例如：如果你要将 `introduction.mdx` 翻译成中文，请在 `zh-CN/get_started/introduction.mdx` 下创建文件。

文件编辑的规范可以参考 [Mintlify](https://mintlify.com/docs/page) 文档中Writing Content（内容撰写）部分的章节

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
