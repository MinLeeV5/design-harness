# Design Harness contributor instructions

Use Chinese for collaboration. This repository ships a generic Codex plugin, not a product-specific design system.

- Ship exactly two public skills: design-harness-init and design-harness-design. Keep entrypoints concise and discoverable.
- Project knowledge lives in the consuming project's Figma Harness Page; each requirement gets its own Page. Never bake real project keys, paths, code mappings or task records into this distribution.
- User scope and previously granted authorization take precedence. Avoid redundant approvals; do not derive Figma file-wide authority from permission to edit one Page.
- Project design conventions outrank generic guidance. Prefer verified current code when reconstructing existing behavior; present meaningful conflicts for user choice. Preserve approved future designs separately from current code.
- Init first organizes existing context, then fills code-backed gaps. Each module's concrete content is confirmed before generation; reuse existing authorization for the same scope.
- Design interviews run one question at a time, with recommendation and rationale. Keep facts, decisions, delegations and open issues in conversation; no mandatory brief.md, project.json, run.json or local workflow artifacts.
- Confirm the overall requirement before formal Figma options. After selection, present concrete knowledge deltas and write back only the approved scope. Approved designs may be pending implementation.
- No automatic cross-project learning, background promotion, hooks or telemetry. Scoped, confirmed project knowledge maintenance is supported.
- Preserve progressive disclosure: short skill entrypoints, shared references, reusable evaluation criteria.
- Evaluation is embedded in both workflows. Inspect actual assets and renders; scripts cannot prove design quality, human approval or runtime behavior.
- Use visible native Figma text for the entrance and indexes. Read progressively; variables/styles are file-level assets, not Page-local data. Do not rely on hidden pluginData or whole-file scans.
- The Figma read helper is dependency-free JavaScript for the Plugin API. Developer packaging scripts use Python 3.10+ standard library; tests additionally use Node.js 18+. Keep paths relative to the plugin.
- For changes to contracts or behavior, update README/docs/templates and relevant tests in the same session. Preserve upstream license notices and update lock records when updating adapted material.
- Validate with `python3 scripts/validate.py`, `python3 -m unittest discover -s tests -v`, and `node --test tests/figma-reader.test.js`; test packaging from a fresh path for distribution changes. Report simulated API tests separately from live Figma validation.
- Do not publish to a remote marketplace, push Git, change another project or modify Figma unless explicitly authorized for that task.
