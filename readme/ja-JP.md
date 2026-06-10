# ComfyUI ドキュメンテーション

| [English](../README.md) | [中文](zh-CN.md) | [日本語](ja-JP.md) | [한국어](ko-KR.md) |

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
> `zh/`、`ja/`、`ko/` などの言語ディレクトリに対応する翻訳ファイルを含めることも忘れないでください！

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

リポジトリルートの英語 MDX が**唯一のソース**です。他言語は同じ相対パスでミラーします（例：`zh/get_started/introduction.mdx`、`ja/get_started/introduction.mdx`、`ko/get_started/introduction.mdx`）。再利用フラグメントは `snippets/` にあり、各言語のコピーは `snippets/zh/`、`snippets/ja/`、`snippets/ko/` などに置きます。

他言語の貢献ガイド：[readme/](.)（[English](../README.md)、[中文](zh-CN.md)、[한국어](ko-KR.md)）。

**翻訳方針**

対応言語は英語からの**自動翻訳**で維持します。英語ドキュメントが更新されると、`npm run translate` で一括同期されます。貢献者が全ページを手翻訳する必要はありません。

**新しい言語のリクエスト**

他の言語が必要ですか？[Issue を作成](https://github.com/Comfy-Org/docs/issues/new) して希望の言語（例：フランス語、ドイツ語、ブラジルポルトガル語）をお知らせください。メンテナーが `translation-config.json` と `docs.json` に追加し、**全コンテンツの一括翻訳**を行います。リクエストを送るだけで大丈夫です。訳文 MDX の PR は不要です。

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
| `npm run translate:check-truncation` | 途中で切れた翻訳をスキャン |
| `npm run translate:repair-truncated` | ログに記録されたファイルを再翻訳 |
| `npm run glossary:sync` | ComfyUI フロントエンドから用語集を再構築（[用語の一貫性](#用語の一貫性) 参照） |

`--` の後にオプションを渡せます：

```bash
npm run translate -- --lang zh,ja,ko
npm run translate:dry-run -- --lang ko
npm run translate -- installation/manual_install.mdx
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

**途中切れ翻訳の修復**

長いファイルは翻訳が途中で切れることがあります（コードフェンス未閉じなど）。一括翻訳後は新規翻訳ファイルを自動スキャンし、`.github/i18n-logs/translate/truncation-issues.json` と `truncation-issues.txt`（gitignore）に修復リストを書き出します。言語全体をスキャンする場合や修復する場合：

```bash
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

`repair-truncated` は JSON ログのファイルのみを強制再翻訳します。

**動作概要**

- **入力**: 英語 MDX（主ソース）+ 既存の訳文（コンテキスト、あれば）
- **出力**: `zh/`、`ja/`、`ko/` などに書き込み、frontmatter の `translationSourceHash` を更新（snippet は HTML コメントで hash を保存）
- **レビューメモ（mismatch）**: モデルが `=== MISMATCHES ===` で報告した意味上の問題は `.github/i18n-logs/translate/mismatches.json` と `mismatches.txt`（gitignore）に書き込み、MDX には入れません。`npm run translate` 実行時のみ。途中切れスキャンでは出ません。
- **途中切れログ**: 構造的な問題は `.github/i18n-logs/translate/truncation-issues.json`（上記「途中切れ翻訳の修復」参照）
- **スキップ**: `built-in-nodes/`（`translation-config.json` の `skip_paths`）
- **チャンク翻訳**: `changelog/index.mdx` は `<Update label="v0.x.x">` のバージョンラベルを比較し、**不足している**バージョンのみ翻訳して英語と同じ順序で挿入します。既存ブロックは `--force` 以外では再翻訳しません
- **ディレクトリ**: ファイル書き込み時にサブディレクトリを自動作成（手動の `mkdir` は不要）

スクリプト：`.github/scripts/i18n/`（`translate-i18n.ts`、`translation-config.json`、および [i18n README](../.github/scripts/i18n/README.md) を参照）

#### 用語の一貫性

同じ英語用語がページごとに異なる訳にならないよう（例：「custom node」が韓国語で二通りに訳されるのを防ぐ）、翻訳器には三つの補完的な仕組みがあります。それぞれ異なる種類の用語を扱います：

| 仕組み | 効果 | 例 | 保守 |
|--------|------|-----|------|
| `preserve_terms`（`translation-config.json` 内） | 用語を**英語のまま**保持 | `checkpoint`、`LoRA`、`scheduler` | 手動 |
| `glossary/frontend/{lang}.json` | フロントエンドの**既存訳**を使用 | `workflow → 워크플로` | 機械同期 |
| `glossary/overrides/{lang}.json` | フロントエンドを**修正 / 拡張** | `custom node → 커스텀 노드` | 手動、優先 |

**ComfyUI フロントエンド**（[`ComfyUI_frontend/src/locales`](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/locales)）が用語訳の権威ソースです。`npm run glossary:sync` はその locale 用語を `glossary/frontend/{lang}.json` にミラーします（実行のたびに全量再構築 — 手編集しないでください）。手動の修正は `glossary/overrides/{lang}.json` に書き、ミラーより優先されます。用語の決定を記録したり、ノイズの多いフロントエンド用語を除外する場所です：

```jsonc
// glossary/overrides/ko.json
{
  "terms":  { "custom node": "커스텀 노드" },   // 再マップまたは追加（frontend より優先）
  "ignore": ["title", "additional", "work"]      // ノイズの多いフロントエンド用語を除外
}
```

翻訳時は、ドキュメントに実際に現れる用語だけを選び、**推奨**（必須ではない）ヒントとして注入します。直訳が不自然になる場合は自然な表現を保てます。定訳のない ComfyUI 固有名詞（モデル名、`checkpoint` など）は `preserve_terms` に入れて英語のままにします。設計と保守の詳細は [i18n README](../.github/scripts/i18n/README.md) を参照してください。

```bash
npm run glossary:sync                 # フロントエンドミラーを全言語で再構築
npm run glossary:sync -- --lang ko    # 単一言語
npm run glossary:sync:dry-run         # 件数のみ報告、書き込みなし
```

フロントエンド locale のパスは次の順で解決されます：`--frontend <path>` → `FRONTEND_LOCALES_PATH` 環境変数 → `translation-config.json` の `frontend_locales_path` → `../ComfyUI_frontend/src/locales`。

#### 新しい言語の追加

上記 [新しい言語のリクエスト](#新しい言語のリクエスト) を参照 — Issue で申請してください。PR で言語を自分で追加しないでください。

メンテナー：`.github/scripts/i18n/translation-config.json` の `languages` にエントリを追加（`code`、`name`、`dir`、`snippets_dir`）。パス除外、リンクのローカライズ、英語ファイルのスキャンは同フォルダの `i18n-config.mjs` から自動導出されるため、ロケール追加時に翻訳スクリプトを言語ごとに編集する必要はありません。次に `docs.json` にナビゲーションを追加（[Mintlify ローカライゼーション](https://mintlify.com/docs/navigation/localization) 参照）し、一括翻訳を実行：

```bash
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

#### 手動翻訳

スクリプトを使わず手動で翻訳することもできます：

1. 言語ディレクトリに、英語と**同じパス・ファイル名**の MDX を作成。
2. `import`（`/snippets/...` → `/snippets/ja/...`）と内部リンク（`/path` → `/ja/path`）をローカライズ。
3. `docs.json` の該当言語ナビにページパスを追加。

英語 MDX を変更した PR では、`i18n-sync-check` が訳文の未更新を**警告**し、PR に [@comfyui-wiki](https://github.com/comfyui-wiki) へリマインドコメントを投稿します。手動で直すか、`npm run translate` を再実行してください。

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
