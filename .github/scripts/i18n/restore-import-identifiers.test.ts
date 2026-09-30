import { describe, expect, test } from "bun:test";
import { delocalizeImportPath, restoreImportIdentifiers } from "./i18n-config.mjs";

const LANGUAGES = [
  { code: "ja", name: "Japanese", dir: "ja", snippets_dir: "snippets/ja" },
  { code: "zh", name: "Chinese", dir: "zh", snippets_dir: "snippets/zh" },
  { code: "ko", name: "Korean", dir: "ko", snippets_dir: "snippets/ko" },
];

const EN = `---
title: "Partner Nodes"
---

import Requirements from "/snippets/tutorials/partner-nodes/requirements.mdx";
import Faq from "/snippets/tutorials/partner-nodes/faq.mdx";

<Requirements/>

## FAQs

<Faq/>
`;

describe("delocalizeImportPath", () => {
  test("strips the locale snippet directory", () => {
    expect(delocalizeImportPath("/snippets/ko/a/b.mdx", LANGUAGES)).toBe("/snippets/a/b.mdx");
    expect(delocalizeImportPath("/snippets/ja/a.mdx", LANGUAGES)).toBe("/snippets/a.mdx");
  });

  test("leaves English and non-snippet paths alone", () => {
    expect(delocalizeImportPath("/snippets/a.mdx", LANGUAGES)).toBe("/snippets/a.mdx");
    expect(delocalizeImportPath("/images/x.png", LANGUAGES)).toBe("/images/x.png");
  });
});

describe("restoreImportIdentifiers", () => {
  test("restores a translated alias in the import and in every JSX usage", () => {
    const ko = `import 요구사항 from "/snippets/ko/tutorials/partner-nodes/requirements.mdx";
import FAQ from "/snippets/ko/tutorials/partner-nodes/faq.mdx";

<요구사항/>

<FAQ/>
`;

    expect(restoreImportIdentifiers(ko, EN, LANGUAGES)).toBe(
      `import Requirements from "/snippets/ko/tutorials/partner-nodes/requirements.mdx";
import Faq from "/snippets/ko/tutorials/partner-nodes/faq.mdx";

<Requirements/>

<Faq/>
`
    );
  });

  test("keeps the localized import path", () => {
    const ja = `import 要件 from "/snippets/ja/tutorials/partner-nodes/requirements.mdx";

<要件/>
`;
    const out = restoreImportIdentifiers(ja, EN, LANGUAGES);
    expect(out).toContain('"/snippets/ja/tutorials/partner-nodes/requirements.mdx"');
    expect(out).toContain("import Requirements");
  });

  test("rewrites usages that carry props and closing tags", () => {
    const zh = `import 要求 from "/snippets/tutorials/partner-nodes/requirements.mdx";

<要求 title="x">
  body
</要求>
`;
    const out = restoreImportIdentifiers(zh, EN, LANGUAGES);
    expect(out).toContain('<Requirements title="x">');
    expect(out).toContain("</Requirements>");
  });

  test("does not touch an English alias that only shares a prefix", () => {
    const en = `import Generate from "/snippets/comfy-cli/generate.mdx";
import GenerateFirstCall from "/snippets/comfy-cli/generate-first-call.mdx";
`;
    const ko = `import 생성 from "/snippets/ko/comfy-cli/generate.mdx";
import GenerateFirstCall from "/snippets/ko/comfy-cli/generate-first-call.mdx";

<생성/>

<GenerateFirstCall/>
`;

    expect(restoreImportIdentifiers(ko, en, LANGUAGES)).toBe(
      `import Generate from "/snippets/ko/comfy-cli/generate.mdx";
import GenerateFirstCall from "/snippets/ko/comfy-cli/generate-first-call.mdx";

<Generate/>

<GenerateFirstCall/>
`
    );
  });

  test("leaves an already-matching translation untouched", () => {
    const ko = `import Requirements from "/snippets/ko/tutorials/partner-nodes/requirements.mdx";

<Requirements/>
`;
    expect(restoreImportIdentifiers(ko, EN, LANGUAGES)).toBe(ko);
  });

  test("is a no-op when the English block has no imports", () => {
    const ko = "본문만 있습니다.\n";
    expect(restoreImportIdentifiers(ko, "English prose only.\n", LANGUAGES)).toBe(ko);
  });

  test("restores a usage that sits far below the import line", () => {
    // Chunked pages keep the imports in `_intro` and can carry a usage in a
    // later section, so the pipeline restores the assembled page once instead
    // of each block on its own.
    const ko = `import 요구사항 from "/snippets/ko/tutorials/partner-nodes/requirements.mdx";

## 개요

본문.

## 스키마

<요구사항/>
`;
    const out = restoreImportIdentifiers(ko, EN, LANGUAGES);
    expect(out).toContain('import Requirements from "/snippets/ko/');
    expect(out).toContain("<Requirements/>");
    expect(out).not.toContain("요구사항");
  });

  test("cannot repair a usage whose import line is absent from the content", () => {
    // Documents why callers pass the assembled page: a lone block carries no
    // import line to match against, so an alias inside it cannot be resolved.
    const blockOnly = "<요구사항/>\n";
    expect(
      restoreImportIdentifiers(blockOnly, "## Schema\n\n<Requirements/>\n", LANGUAGES)
    ).toBe(blockOnly);
  });

  test("repairs a translated tag whose import line is already English", () => {
    // A checkpoint or an earlier run can restore the import line first, leaving
    // a later section with a tag no import defines.
    const ko = `import Requirements from "/snippets/ko/tutorials/partner-nodes/requirements.mdx";

## 개요

<요구사항/>
`;
    const out = restoreImportIdentifiers(ko, EN, LANGUAGES);
    expect(out).toContain("<Requirements/>");
    expect(out).not.toContain("요구사항");
  });

  test("pairs several translated tags with the unused imports in order", () => {
    const en = `import Requirements from "/snippets/a.mdx";
import Faq from "/snippets/b.mdx";

<Requirements/>

<Faq/>
`;
    const ko = `import Requirements from "/snippets/ko/a.mdx";
import Faq from "/snippets/ko/b.mdx";

## 개요

<요구사항/>

## FAQ

<자주묻는질문/>
`;
    const out = restoreImportIdentifiers(ko, en, LANGUAGES);
    expect(out).toContain("<Requirements/>");
    expect(out).toContain("<Faq/>");
  });

  test("leaves an ambiguous translated tag for a human", () => {
    // Two orphan tags but only one unused import: pairing them would guess, and
    // a wrong guess renders the wrong snippet instead of failing loudly.
    const en = `import Requirements from "/snippets/a.mdx";
import Faq from "/snippets/b.mdx";

<Requirements/>

<Faq/>
`;
    const ko = `import Requirements from "/snippets/ko/a.mdx";
import Faq from "/snippets/ko/b.mdx";

<Requirements/>

<요구사항/>

<기타/>
`;
    expect(restoreImportIdentifiers(ko, en, LANGUAGES)).toBe(ko);
  });

  test("tolerates empty input", () => {
    expect(restoreImportIdentifiers("", EN, LANGUAGES)).toBe("");
    expect(restoreImportIdentifiers("import X from \"/snippets/ko/a.mdx\";", "", LANGUAGES)).toBe(
      'import X from "/snippets/ko/a.mdx";'
    );
  });
});
