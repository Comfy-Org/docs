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

  test("tolerates empty input", () => {
    expect(restoreImportIdentifiers("", EN, LANGUAGES)).toBe("");
    expect(restoreImportIdentifiers("import X from \"/snippets/ko/a.mdx\";", "", LANGUAGES)).toBe(
      'import X from "/snippets/ko/a.mdx";'
    );
  });
});
