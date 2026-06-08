# ComfyUI ドキュメンテーション

| [English](https://github.com/Comfy-Org/docs/blob/main/README.md) | [中文](https://github.com/Comfy-Org/docs/blob/main/README.zh-CN.md) | [日本語](https://github.com/Comfy-Org/docs/blob/main/README.ja-JP.md) |

## 開発

ドキュメントの変更をローカルでプレビューするには、まず依存関係をインストールし、次に開発サーバーを起動します：

```
npm i
npm run dev
```

英語ドキュメント編集後の翻訳同期は、下記 [自動翻訳](#自動翻訳)（`npm run translate`）を参照してください。

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

リポジトリルートの英語 MDX が**唯一のソース**です。他言語は同じ相対パスでミラーします（例：`zh/get_started/introduction.mdx`、`ja/get_started/introduction.mdx`）。再利用フラグメントは `snippets/` にあり、各言語のコピーは `snippets/zh/`、`snippets/ja/` などに置きます。

MDX の編集仕様は [Mintlify](https://mintlify.com/docs/page) の Writing Content を参照してください。

> **注**: `built-in-nodes/` は [embedded-docs](https://github.com/Comfy-Org/embedded-docs) で管理されており、翻訳スクリプトはこのディレクトリを**自動的にスキップ**します。

#### 自動翻訳

本リポジトリには hash ベースの翻訳スクリプトがあります。英語ソースと訳文の `translationSourceHash` を比較し、英語が変わったファイルは**全文を再翻訳**します。

**準備**

1. [Bun](https://bun.sh) をインストール
2. 環境変数テンプレートをコピーして API キーを設定：

```bash
cp .env.local.example .env.local
# TRANSLATE_API_KEY を設定（OpenAI 互換 API：DashScope Qwen-MT、OpenRouter、DeepSeek など）
```

**npm コマンド**

| コマンド | 説明 |
|---------|------|
| `npm run translate` | `translation-config.json` に登録された全言語を翻訳 |
| `npm run translate:dry-run` | API を呼ばず、未翻訳ファイルを一覧表示 |
| `npm run translate:force` | hash を無視して強制再翻訳 |
| `npm run translate:snippets` | `snippets/` のみ翻訳 |
| `npm run translate:snippets:dry-run` | snippet の未翻訳一覧を表示 |

`--` の後にオプションを渡せます：

```bash
npm run translate -- --lang zh,ja
npm run translate:dry-run -- --lang ja
npm run translate -- installation/manual_install.mdx
```

**動作概要**

- **入力**: 英語 MDX（主ソース）+ 既存の訳文（コンテキスト、あれば）
- **出力**: `zh/`、`ja/` などに書き込み、frontmatter の `translationSourceHash` を更新（snippet は HTML コメントで hash を保存）
- **スキップ**: `built-in-nodes/`（`translation-config.json` の `skip_paths`）
- **ディレクトリ**: ファイル書き込み時にサブディレクトリを自動作成（手動の `mkdir` は不要）

スクリプト：`.github/scripts/translate-i18n.ts`

#### 新しい言語の追加

1. `.github/scripts/translation-config.json` の `languages` に登録：

```json
{
  "code": "fr",
  "name": "French",
  "dir": "fr",
  "snippets_dir": "snippets/fr"
}
```

2. `docs.json` の `navigation.languages` にナビゲーションを追加（英語ツリーをコピーし、パスに `fr/` プレフィックスを付ける）。[Mintlify ローカリゼーション](https://mintlify.com/docs/navigation/localization) を参照。

3. 翻訳を実行：

```bash
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

`docs.json` の `language` は [Mintlify の言語コード](https://mintlify.com/docs/navigation/localization) と一致させてください。フォルダ名（`fr/`、`zh/`、`ja/`）は `translation-config.json` の `dir` と揃えます。

#### 手動翻訳

スクリプトを使わず手動で翻訳することもできます：

1. 言語ディレクトリに、英語と**同じパス・ファイル名**の MDX を作成。
2. `import`（`/snippets/...` → `/snippets/ja/...`）と内部リンク（`/path` → `/ja/path`）をローカライズ。
3. `docs.json` の該当言語ナビにページパスを追加。

英語 MDX を変更した PR では、CI（`zh-cn-sync-check`、`ja-sync-check`）が `zh/` または `ja/` の未更新を**警告**します。手動で直すか、`npm run translate` を再実行してください。

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
