import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * `staged-locale-maintenance.py` walks the repo relative to its own path, so each
 * case builds a throwaway repo root, copies the script into it and runs it there.
 */
const SCRIPT = "staged-locale-maintenance.py";
const SELF = join(import.meta.dir, SCRIPT);

const python = ["python3", "python"].find((cmd) => {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

const describePython = python ? describe : describe.skip;

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "staged-locale-"));
  const scriptPath = join(root, ".github/scripts/i18n", SCRIPT);
  mkdirSync(dirname(scriptPath), { recursive: true });
  copyFileSync(SELF, scriptPath);
  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return root;
}

function run(root: string, args: string[]): string {
  const scriptPath = join(root, ".github/scripts/i18n", SCRIPT);
  return execFileSync(python as string, [scriptPath, ...args], { cwd: root, encoding: "utf8" });
}

const PAGE = `---
title: "Prueba"
---

Enlace en prosa a [manual](/installation/manual_install#step-2) y a [no traducido](/tutorials/nope).

En línea: \`[inline](/installation/manual_install)\` y \`\`[doble](/es/installation/manual_install)\`\`.

\`\`\`js
const href = "/installation/manual_install";
<a href="/installation/manual_install">manual</a>
[y](/installation/manual_install)
\`\`\`

~~~bash
curl -L "/installation/manual_install"
~~~

\`\`\`json {"title": "Muestra"}
{"src": "/installation/manual_install"}
\`\`\`

Después: [ya localizado](/es/installation/manual_install) sigue, [zh](/zh/installation/manual_install) intacto, [roto](/es/installation/nope) vuelve a inglés.

![mapa](/images/installation/manual_install.png)
`;

const EXPECTED = `---
title: "Prueba"
---

Enlace en prosa a [manual](/es/installation/manual_install#step-2) y a [no traducido](/tutorials/nope).

En línea: \`[inline](/installation/manual_install)\` y \`\`[doble](/es/installation/manual_install)\`\`.

\`\`\`js
const href = "/installation/manual_install";
<a href="/installation/manual_install">manual</a>
[y](/installation/manual_install)
\`\`\`

~~~bash
curl -L "/installation/manual_install"
~~~

\`\`\`json {"title": "Muestra"}
{"src": "/installation/manual_install"}
\`\`\`

Después: [ya localizado](/es/installation/manual_install) sigue, [zh](/zh/installation/manual_install) intacto, [roto](/installation/nope) vuelve a inglés.

![mapa](/images/installation/manual_install.png)
`;

describePython("staged-locale-maintenance.py relink-links", () => {
  test("localizes prose links only, leaving fenced blocks and inline code byte-for-byte", () => {
    const root = makeRepo({
      "es/installation/manual_install.mdx": "# Instalación manual\n",
      "es/test.mdx": PAGE,
    });
    try {
      run(root, ["relink-links", "--lang", "es"]);
      expect(readFileSync(join(root, "es/test.mdx"), { encoding: "utf8" })).toBe(EXPECTED);
    } finally {
      execFileSync("rm", ["-rf", root]);
    }
  });

  test("is idempotent on the second run", () => {
    const root = makeRepo({
      "es/installation/manual_install.mdx": "# Instalación manual\n",
      "es/test.mdx": PAGE,
    });
    try {
      run(root, ["relink-links", "--lang", "es"]);
      const once = readFileSync(join(root, "es/test.mdx"), { encoding: "utf8" });
      const output = run(root, ["relink-links", "--lang", "es", "--check"]);
      expect(readFileSync(join(root, "es/test.mdx"), { encoding: "utf8" })).toBe(once);
      expect(output).toContain("0 file(s) touched");
    } finally {
      execFileSync("rm", ["-rf", root]);
    }
  });
});

const DOCS_JSON = `${JSON.stringify(
  {
    navigation: {
      languages: [
        {
          language: "zh",
          tabs: [
            {
              tab: "开始使用",
              pages: [
                "zh/index",
                {
                  group: "API Reference",
                  openapi: { source: "openapi-v2.yaml", directory: "zh/api-reference/v2" },
                  pages: [],
                },
              ],
            },
            {
              tab: "Cloud API 参考文档",
              openapi: { source: "openapi-cloud.yaml", directory: "zh/api-reference/cloud" },
              pages: [],
            },
          ],
        },
        {
          language: "es",
          tabs: [
            {
              tab: "Empezar",
              pages: [
                "es/index",
                {
                  group: "API Reference",
                  openapi: { source: "openapi-v2.yaml", directory: "es/api-reference/v2" },
                  pages: [],
                },
              ],
            },
            {
              tab: "Cloud API",
              openapi: { source: "openapi-cloud.yaml", directory: "es/api-reference/cloud" },
              pages: [],
            },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

describePython("staged-locale-maintenance.py prune-nav", () => {
  test("keeps the API reference tab for a locale that ships localized pages", () => {
    const root = makeRepo({
      "docs.json": DOCS_JSON,
      "zh/index.mdx": "# Inicio\n",
      "zh/api-reference/cloud/get-users.mdx": "# Users\n",
      "es/index.mdx": "# Inicio\n",
    });
    try {
      const output = run(root, ["prune-nav", "--lang", "zh", "--check"]);
      expect(output).toContain("nothing to prune");
      expect(readFileSync(join(root, "docs.json"), { encoding: "utf8" })).toBe(DOCS_JSON);
    } finally {
      execFileSync("rm", ["-rf", root]);
    }
  });

  test("drops the API reference tab for a locale with no localized pages", () => {
    const root = makeRepo({
      "docs.json": DOCS_JSON,
      "zh/index.mdx": "# Inicio\n",
      "zh/api-reference/cloud/get-users.mdx": "# Users\n",
      "es/index.mdx": "# Inicio\n",
    });
    try {
      run(root, ["prune-nav", "--lang", "es"]);
      const docs = JSON.parse(readFileSync(join(root, "docs.json"), { encoding: "utf8" }));
      const tabs = (lang: string) =>
        docs.navigation.languages.find((entry: { language: string }) => entry.language === lang).tabs;
      expect(tabs("es").map((tab: { tab: string }) => tab.tab)).toEqual(["Empezar"]);
      expect(tabs("es")[0].pages).toEqual(["es/index"]);
      expect(tabs("zh").map((tab: { tab: string }) => tab.tab)).toEqual([
        "开始使用",
        "Cloud API 参考文档",
      ]);
    } finally {
      execFileSync("rm", ["-rf", root]);
    }
  });
});
