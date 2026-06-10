# ComfyUI 문서

| [English](../README.md) | [中文](zh-CN.md) | [日本語](ja-JP.md) | [한국어](ko-KR.md) |

## 개발

문서 변경 사항을 로컬에서 미리 보려면 의존성을 설치한 뒤 개발 서버를 시작하세요:

```
npm i
npm run dev
```

영문 문서를 수정한 뒤 번역을 동기화하려면 아래 [자동 번역](#자동-번역)（`npm run translate`）을 참고하세요.

### PR 만들기

PR을 생성하세요. 승인되면 Vercel이 변경 사항을 https://docs.comfy.org/ 에 배포합니다.

### API 레퍼런스 문서 생성

OpenAPI 파일 또는 해당 파일이 포함된 URL을 사용할 수 있습니다:

```bash
cd registry/api-reference # 제품별로 API 파일 분리
npx @mintlify/scraping@latest openapi-file <path-to-openapi-file>
```

이 명령은 각 엔드포인트의 MDX 파일만 생성합니다. `docs.json`에 해당 파일 링크를 추가해야 하며, 최신 API 스펙이 해당 문서 페이지에 표시됩니다.

## 파일 이름 변경 시 유의사항

- 파일 이름을 바꾸면 이미 여러 글과 템플릿에서 사용 중인 외부 링크가 깨질 수 있습니다.
- 사이드바 내비게이션은 `docs.json`으로 재구성할 수 있으므로, 꼭 필요한 경우가 아니면 원본 문서의 파일 위치는 변경하지 않습니다.
- 파일 이름을 변경해 경로가 바뀌었다면 `docs.json`의 `redirects` 목록을 업데이트하세요.

GitHub Action이 리다이렉트를 검사하며, 누락 시 PR이 실패합니다. 리다이렉트 형식은 다음과 같습니다:

> ```json
> "redirects": [
>   {
>     "source": "/path/to/old-file",
>     "destination": "/path/to/new-file"
>   }
> ]
> ```
> `zh/`, `ja/`, `ko/` 등 언어 디렉터리의 해당 번역 파일도 함께 반영하는 것을 잊지 마세요!

와일드카드 경로 추가 및 매칭은 [Mintlify 문서](https://www.mintlify.com/docs/create/redirects)를 참고하세요.

## 내장 노드 문서 안내

ComfyUI에는 내장 노드와 커스텀 노드 모두를 위한 내장 노드 도움말 메뉴가 있습니다. 모든 내장 노드 문서는 [이 저장소](https://github.com/Comfy-Org/embedded-docs)에서 유지 관리됩니다.

### 동기화 주기

콘텐츠 동기화를 위해 해당 저장소의 업데이트된 문서를 매주 docs.comfy.org에 정기적으로 동기화합니다. 문서에 기여하려면 [이 저장소](https://github.com/Comfy-Org/embedded-docs)에 PR을 제출하세요.

### 노드 문서 파일 구조

노드 문서는 `built-in-node` 폴더 아래 단일 수준 디렉터리 구조를 사용합니다. 이유는 다음과 같습니다:

- ComfyUI 업데이트 시 노드 카테고리와 디렉터리가 조정될 수 있어, 다단계 구조는 문서를 자주 수정해야 합니다
- 이에 따라 리다이렉트와 검사를 자주 추가해야 합니다
- Mintlify는 `docs.json`에서 문서 계층을 설정할 수 있으므로, 해당 파일에서 통합 관리합니다

> 역사적 이유로 일부 기존 문서는 다른 폴더 계층을 사용합니다. 이 파일들은 더 이상 조정하지 않으며, 새 파일은 단일 수준 디렉터리를 사용합니다.

## 기여

PR을 생성해 주시면 며칠 내에 검토합니다.

또는 [Discord](https://discord.com/invite/comfyorg)에서 이야기해 주세요.

문서는 Mintlify로 구축됩니다. 사용법은 [Mintlify 문서](https://mintlify.com/docs)를 참고하세요.

### i18n 기여

저장소 루트의 영문 MDX가 **유일한 소스**입니다. 다른 언어는 동일한 상대 경로로 미러링합니다（예: `zh/get_started/introduction.mdx`, `ja/get_started/introduction.mdx`, `ko/get_started/introduction.mdx`）. 재사용 조각은 `snippets/`에 있으며, 언어별 복사본은 `snippets/zh/`, `snippets/ja/`, `snippets/ko/` 등에 둡니다.

다른 언어 기여 가이드: [readme/](.)（[English](../README.md), [中文](zh-CN.md), [日本語](ja-JP.md)）.

**번역 방침**

지원 로케일은 영문 기준 **자동 번역**으로 유지합니다. 영문 문서가 바뀌면 `npm run translate`로 일괄 동기화되며, 기여자가 모든 페이지를 수동 번역할 필요는 없습니다.

**새 언어 요청**

다른 언어 문서가 필요하신가요? [Issue를 열어](https://github.com/Comfy-Org/docs/issues/new) 원하는 로케일(예: 프랑스어, 독일어, 브라질 포르투갈어)을 알려 주세요. 메인테이너가 `translation-config.json`과 `docs.json`에 추가한 뒤 **전체 콘텐츠를 일괄 번역**합니다. 요청만 보내시면 됩니다. 번역 MDX PR은 필요 없습니다.

MDX 편집 규격은 [Mintlify](https://mintlify.com/docs/page) Writing Content 섹션을 참고하세요.

> **참고**: `built-in-nodes/`는 [embedded-docs](https://github.com/Comfy-Org/embedded-docs)에서 관리되며, 번역 스크립트가 이 디렉터리를 **자동으로 건너뜁니다**.

#### 자동 번역

이 저장소에는 hash 기반 번역 스크립트가 있습니다. 영문 소스와 번역문의 `translationSourceHash`를 비교하며, 영문이 변경된 파일은 **전체를 다시 번역**합니다.

**사전 준비**

1. [Bun](https://bun.sh) 설치
2. 환경 변수 템플릿을 복사하고 API 키 설정:

```bash
cp .env.local.example .env.local
# TRANSLATE_API_KEY 설정（OpenAI 호환 API: DashScope Qwen-MT, OpenRouter, DeepSeek 등）
```

**npm 스크립트**

| 명령 | 설명 |
|------|------|
| `npm run translate` | `translation-config.json`에 등록된 모든 언어 번역 |
| `npm run translate:dry-run` | API 호출 없이 대기 중인 파일 목록 표시 |
| `npm run translate:force` | hash 무시, 강제 전체 재번역 |
| `npm run translate:snippets` | `snippets/`만 번역 |
| `npm run translate:snippets:dry-run` | snippet 대기 목록 미리보기 |
| `npm run translate:check-truncation` | 잘린 번역 가능성 스캔 |
| `npm run translate:repair-truncated` | 로그에 기록된 파일 재번역 |
| `npm run glossary:sync` | ComfyUI 프론트엔드에서 용어집 재구축（[용어 일관성](#용어-일관성) 참고） |

`--` 뒤에 추가 옵션을 전달할 수 있습니다:

```bash
npm run translate -- --lang zh,ja,ko
npm run translate:dry-run -- --lang ko
npm run translate -- installation/manual_install.mdx
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

**잘린 번역 복구**

긴 파일은 번역 중간에 잘릴 수 있습니다（예: 코드 펜스 미닫힘）. 일괄 번역 후 스크립트가 새로 번역된 파일을 자동 스캔하고, 복구 목록을 `.github/i18n-logs/translate/truncation-issues.json`과 `truncation-issues.txt`（gitignore）에 기록합니다. 언어 전체를 스캔하거나 복구하려면:

```bash
npm run translate:check-truncation -- --lang ko
npm run translate:repair-truncated -- --lang ko
```

`repair-truncated`는 JSON 로그의 파일만 강제 재번역합니다.

**동작 방식**

- **입력**: 영문 MDX（주 소스）+ 기존 번역문（컨텍스트, 있는 경우）
- **출력**: `zh/`, `ja/`, `ko/` 등에 쓰고 frontmatter의 `translationSourceHash` 갱신（snippet은 HTML 주석으로 hash 저장）
- **검토 메모（mismatch）**: 모델이 `=== MISMATCHES ===`로 보고한 의미상 이슈는 `.github/i18n-logs/translate/mismatches.json`과 `mismatches.txt`（gitignore）에 기록되며 MDX에는 넣지 않습니다. `npm run translate` 실행 시에만 생성되며, 잘림 스캔에서는 나오지 않습니다.
- **잘림 로그**: 구조적 문제（미닫힌 코드 펜스, 본문 과소 등）는 `.github/i18n-logs/translate/truncation-issues.json`에 기록 — 위 「잘린 번역 복구」 참고.
- **건너뛰기**: `built-in-nodes/`（`translation-config.json` → `skip_paths`）
- **청크 파일**: `changelog/index.mdx`는 `<Update label="v0.x.x">` 버전 라벨을 비교해 **누락된** 버전만 번역하고 영문 순서로 삽입합니다. 기존 블록은 `--force` 없이는 재번역하지 않습니다.
- **디렉터리**: 파일 쓰기 시 하위 디렉터리 자동 생성（수동 `mkdir` 불필요）

스크립트 위치: `.github/scripts/i18n/`（`translate-i18n.ts`, `translation-config.json`, [i18n README](../.github/scripts/i18n/README.md) 참고）

#### 용어 일관성

같은 영문 용어가 페이지마다 다르게 번역되지 않도록（예: "custom node"가 서로 다른 한국어로 번역되는 것 방지）, 번역기에는 세 가지 보완 메커니즘이 있습니다. 각각 다른 종류의 용어를 처리합니다:

| 메커니즘 | 효과 | 예시 | 유지 관리 |
|----------|------|------|-----------|
| `preserve_terms`（`translation-config.json`） | 용어를 **영문 그대로** 유지 | `checkpoint`, `LoRA`, `scheduler` | 수동 |
| `glossary/frontend/{lang}.json` | 프론트엔드 **기존 번역** 사용 | `workflow → 워크플로` | 기계 동기화 |
| `glossary/overrides/{lang}.json` | 프론트엔드를 **수정 / 확장** | `custom node → 커스텀 노드` | 수동, 우선 |

**ComfyUI 프론트엔드**（[`ComfyUI_frontend/src/locales`](https://github.com/Comfy-Org/ComfyUI_frontend/tree/main/src/locales)）가 용어 번역의 권위 있는 출처입니다. `npm run glossary:sync`는 locale 용어를 `glossary/frontend/{lang}.json`에 미러링합니다（실행마다 전체 재구축 — 수동 편집 금지）. 수동 보정은 `glossary/overrides/{lang}.json`에 두며 미러보다 우선합니다. 용어 결정을 기록하거나 노이즈가 많은 프론트엔드 용어를 제거하는 곳입니다:

```jsonc
// glossary/overrides/ko.json
{
  "terms":  { "custom node": "커스텀 노드" },   // 재매핑 또는 추가（frontend보다 우선）
  "ignore": ["title", "additional", "work"]      // 노이즈 프론트엔드 용어 제거
}
```

번역 시 문서에 실제로 등장하는 용어만 골라 **권장**（필수 아님） 힌트로 주입합니다. 직역이 어색하면 자연스러운 표현을 유지할 수 있습니다. 정착된 번역이 없는 ComfyUI 고유명사（모델명, `checkpoint` 등）는 `preserve_terms`에 넣어 영문을 유지하세요. 전체 설계와 큐레이션 안내는 [i18n README](../.github/scripts/i18n/README.md)를 참고하세요.

```bash
npm run glossary:sync                 # 프론트엔드 미러 전체 언어 재구축
npm run glossary:sync -- --lang ko    # 단일 언어
npm run glossary:sync:dry-run         # 개수만 보고, 쓰기 없음
```

프론트엔드 locale 경로는 다음 순서로 해석됩니다: `--frontend <path>` → `FRONTEND_LOCALES_PATH` 환경 변수 → `translation-config.json`의 `frontend_locales_path` → `../ComfyUI_frontend/src/locales`.

#### 새 언어 추가

위 [새 언어 요청](#새-언어-요청) 참고 — Issue로 신청해 주세요. PR로 직접 언어를 추가하지 마세요.

메인테이너: `.github/scripts/i18n/translation-config.json`의 `languages`에 항목 추가（`code`, `name`, `dir`, `snippets_dir`）. 경로 제외, 링크 현지화, 영문 파일 스캔은 같은 폴더의 `i18n-config.mjs`에서 자동으로 파생되므로 로케일 추가 시 번역 스크립트를 언어별로 수정할 필요가 없습니다. 그다음 `docs.json`에 내비게이션 추가（[Mintlify 로컬라이제이션](https://mintlify.com/docs/navigation/localization) 참고） 후 일괄 번역:

```bash
npm run translate:dry-run -- --lang fr
npm run translate -- --lang fr
npm run translate:snippets -- --lang fr
```

#### 수동 번역

스크립트 없이 수동으로 번역할 수도 있습니다:

1. 언어 디렉터리에 영문과 **동일한 경로·파일명**의 MDX 생성.
2. `import`（`/snippets/...` → `/snippets/ko/...`）와 내부 링크（`/path` → `/ko/path`） 현지화.
3. `docs.json` 해당 언어 내비에 페이지 경로 등록.

영문 MDX 변경 시 `i18n-sync-check` 워크플로가 번역 미동기화를 **경고**하고 PR에 [@comfyui-wiki](https://github.com/comfyui-wiki) 리마인더 댓글을 남깁니다. 수동 수정하거나 `npm run translate`를 다시 실행하세요.

#### 워크플로 예제 기여

문서에 워크플로 예제를 추가할 때:

1. ComfyUI 출력（PNG, WebP）을 가져와 워크플로 메타데이터에 모델 URL을 추가하세요. 사용자가 워크플로를 끌어다 놓을 때 자동으로 받을 수 있습니다. 이 [도구](https://comfyui-embeded-workflow-editor.vercel.app/)로 PNG/WebP 메타데이터를 편집할 수 있습니다.

[![동영상](https://img.youtube.com/vi/_zYbP8w7G8A/0.jpg)](https://youtu.be/_zYbP8w7G8A)

2. 워크플로 JSON과 미리보기 이미지를 [example_workflows 저장소](https://github.com/Comfy-Org/example_workflows)에 업로드합니다.
3. 문서에는 GitHub raw 콘텐츠 URL을 사용합니다. GitHub 파일 URL을 raw URL로 바꾸는 방법:
   - GitHub 파일 URL:
     ```
     https://github.com/Comfy-Org/example_workflows/blob/main/your-workflow.json
     ```
   - `raw.githubusercontent.com`으로 바꾸고 `/blob` 제거:
     ```
     https://raw.githubusercontent.com/Comfy-Org/example_workflows/main/your-workflow.json
     ```

   GitHub 파일 페이지의 "Raw" 버튼으로 URL을 복사할 수도 있습니다.

이렇게 하면 문서 사이트에서 ComfyUI로 끌어다 놓을 때 워크플로 메타데이터가 유지됩니다.
