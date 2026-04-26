# ComfyUI ドキュメンテーション

| [English](https://github.com/Comfy-Org/docs/blob/main/README.md) | [中文](https://github.com/Comfy-Org/docs/blob/main/README.zh-CN.md) | [日本語](https://github.com/Comfy-Org/docs/blob/main/README.ja-JP.md) |

## 開発

ドキュメントの変更をローカルでプレビューするには、まず依存関係をインストールし、次に開発サーバーを起動します：

```
npm i
npm run dev
```

### PR を作成する

PR を作成してください。承認されると、Vercel が変更を https://docs.comfy.org/ にデプロイします。

### API リファレンスドキュメントの生成

OpenAPI ファイルまたはファイルを含む URL のいずれかを使用できます：

```bash
cd registry/api-reference # API ファイルを製品ごとに分離しておく
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

これにより、各エンドポイントの MDX ファイルのみが生成されます。これらのファイルへのリンクを `docs.json` に追加する必要があり、最新の API 仕様がそのドキュメントページに表示されます。

## ファイル名の変更に関する特記事項

- ファイル名を変更すると、すでに多数の記事やテンプレートで使用されているため、一部の外部リンクがアクセス不能になる可能性があります。
- サイドバーのナビゲーションは `docs.json` ファイルを通じて再編成できるため、絶対に必要な場合を除き、元のドキュメントのファイルの場所は変更しません。
- ファイル名を変更してファイルパスが変わった場合は、`docs.json` の `redirects` リストを更新してください。

GitHub Action がリダイレクトをチェックし、不足している場合は PR を失敗させます。リダイレクトは次の形式に従う必要があります：

> ```json
> "redirects": [
>   {
>     "source": "/path/to/old-file",
>     "destination": "/path/to/new-file"
>   }
> ]
> ```
> `zh` ディレクトリに対応する中国語翻訳ファイルを含めることも忘れないでください！

ワイルドカードパスの追加と一致については、[Mintlify ドキュメント](https://www.mintlify.com/docs/create/redirects) を参照してください。

## ビルトインノードドキュメントについて

ComfyUI には、ビルトインノードとカスタムノードの両方に対応したビルトインノードヘルプメニューが搭載されました。すべてのビルトインノードドキュメントは、今後[このリポジトリ](https://github.com/Comfy-Org/embedded-docs)でメンテナンスされます。

### 同期頻度

コンテンツの同期と更新を確実にするため、対応するリポジトリから更新されたドキュメントを週に一度 docs.comfy.org に定期的に同期します。ドキュメントに貢献したい場合は、[このリポジトリ](https://github.com/Comfy-Org/embedded-docs) に PR と更新を提出してください。

### ノードドキュメントファイルの構成

ノードドキュメントについては、以下の理由から `built-in-node` フォルダの下に単一レベルのディレクトリ構造を使用します：
- ComfyUI はアップデート中にノードのカテゴリやディレクトリを調整する可能性があり、多階層のディレクトリ構造を使用するとノードドキュメントの頻繁な調整が必要になります
- これらの頻繁な調整は、リダイレクトやチェックを頻繁に追加する必要があることを意味します
- Mintlify は `docs.json` ファイルでドキュメント階層を設定することをサポートしているため、そのファイルで統一的な変更を行うことができます

> 歴史的な更新により、既存のドキュメントの一部は異なるフォルダ階層を使用しています。これらのファイルは今後調整しませんが、新しいファイルは単一レベルのディレクトリを使用します

## 貢献

PR を作成していただければ、数日以内にレビューします。

または、[Discord](https://discord.com/invite/comfyorg) でお話ししましょう。

このドキュメントは Mintlify で構築されています。使用方法については [Mintlify のドキュメント](https://mintlify.com/docs) を参照してください。

### i18n への貢献

Mintlify はバージョニングを使用して他の言語を追加します。ページの翻訳を追加するには、次の手順に従ってください：

1. 元の英語のファイル名とまったく同じファイル名で、言語コードの下にファイルを作成します。

たとえば、`introduction.mdx` を中国語に翻訳する場合、`zh/get_started/introduction.mdx` の下にファイルを作成します。

ファイル編集の仕様については、[Mintlify](https://mintlify.com/docs/page) ドキュメントの Writing Content セクションに記載されています。

> **重要**: 英語のドキュメントで既存の MDX ファイルを変更する場合は、`zh` ディレクトリ内の対応するファイルも更新する必要があります。GitHub Action がこれを自動的にチェックし、対応する中国語の翻訳が更新されていない場合は PR を失敗させます。

2. `docs.json` のナビゲーションを更新する

設定の詳細については、[Mintlify ローカリゼーション](https://mintlify.com/docs/navigation/localization) を参照してください。

単一のページを翻訳した場合は、新しく翻訳されたページのパスを対応する言語のナビゲーショングループに追加するだけで、その言語バージョンで表示されます。

`introduction.mdx` の場合:

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
                  "zh/get_started/introduction",
                  ...
                ]
              }
            ]
      }
    ]
    ...
  }
```

Mintlify は、`language` 設定に基づいて、異なる言語バージョンで表示するページを自動的に決定します。

現在、Mintlify は英語 (en)、中国語 (cn)、スペイン語 (es)、フランス語 (fr)、日本語 (jp)、ポルトガル語 (pt)、ブラジルポルトガル語 (pt-BR)、ドイツ語 (de) のローカリゼーションをサポートしています。

詳細については、[Mintlify ローカリゼーション](https://mintlify.com/docs/navigation/localization) に関する Mintlify のドキュメントを参照してください。

#### 新しい言語の追加

まだ言語が存在しない場合、たとえば `introduction.mdx` のフランス語翻訳を追加したい場合は、ルートディレクトリに新しい `fr-FR` フォルダを作成し、翻訳を完了してから、`docs.json` の `languages` の下に次のコンテンツを追加します：

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

ロケールは Mintlify のデフォルト UI コンポーネントのテキストを翻訳します。これはオプションです。ロケールの完全なリストは[こちら](https://mintlify.com/docs/settings/global#param-locale)です。

#### 貢献ワークフローの例

ドキュメントにワークフローの例を追加する場合：

1. ComfyUI からの出力（PNG、WebP）を取得し、モデルの URL をワークフローに追加して、ユーザーがワークフローをドラッグインしたときにそれらを利用できるようにします。この[ツール](https://comfyui-embeded-workflow-editor.vercel.app/)を使用して、PNG または WebP ファイルのメタデータを編集できます。

[![ビデオタイトル](https://img.youtube.com/vi/_zYbP8w7G8A/0.jpg)](https://youtu.be/_zYbP8w7G8A)

2. ワークフローの JSON とプレビュー画像を [example_workflows リポジトリ](https://github.com/Comfy-Org/example_workflows) にアップロードします。
3. ドキュメントでは、生の GitHub コンテンツ URL を使用します。GitHub ファイル URL を生コンテンツ URL に変換するには：
   - GitHub ファイル URL から始めます：
     ```
     https://github.com/Comfy-Org/example_workflows/blob/main/your-workflow.json
     ```
   - それを raw.githubusercontent.com に変更し、'/blob' を削除します：
     ```
     https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/your-workflow.json
     ```

   GitHub のファイルページで「Raw」ボタンをクリックして、URL を直接コピーすることもできます。

これにより、ComfyUI にドラッグしたときに、ワークフローのメタデータがドキュメントサイトで保持されるようになります。
