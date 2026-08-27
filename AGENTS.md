# Agent guide — ComfyUI docs repo

English is the source of truth. **Docs translation**, **CMS changelog sync**, and **Mintlify analytics** are separate pipelines — do not mix them.

## Skills

| Skill | Path | Use when |
|-------|------|----------|
| **docs-i18n-translate** | [.cursor/skills/docs-i18n-translate/SKILL.md](.cursor/skills/docs-i18n-translate/SKILL.md) | Translating MDX to ja/zh/ko, `pnpm translate`, glossary |
| **docs-i18n-review** | [.cursor/skills/docs-i18n-review/SKILL.md](.cursor/skills/docs-i18n-review/SKILL.md) | Reviewing translation quality, `pnpm translate:review` |
| **cms-changelog-sync** | [.cursor/skills/cms-changelog-sync/SKILL.md](.cursor/skills/cms-changelog-sync/SKILL.md) | Strapi release notes, `pnpm cms:prepare`, `pnpm cms:sync` |

Load the matching skill and its README before changing that pipeline.

## Prose style (English MDX)

When writing or editing English documentation, follow [.cursor/rules/docs-prose.mdc](.cursor/rules/docs-prose.mdc):

- **Avoid em dashes (—).** They read as generic AI copy. Use periods, commas, colons, parentheses, or a second sentence instead.
- Prefer short, direct sentences over stacked clauses joined by dashes.
- Match the tone of surrounding pages: technical reference, not marketing blog.

**Instead of:** `Comfy Cloud MCP is in public beta — APIs may change.`  
**Prefer:** `Comfy Cloud MCP is in public beta. APIs may change while we iterate.`

**Instead of:** `**Discord** — #channel for questions.`  
**Prefer:** `**Discord**: #channel for questions.`

## Reference docs

| Topic | Doc |
|-------|-----|
| Env / secrets | [`.env.local.example`](.env.local.example) |
| Docs i18n | [.github/scripts/i18n/README.md](.github/scripts/i18n/README.md) |
| CMS changelog | [.github/scripts/cms/README.md](.github/scripts/cms/README.md) |
| Mintlify analytics | [.github/scripts/analytics/README.md](.github/scripts/analytics/README.md) |
