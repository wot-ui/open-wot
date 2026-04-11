---
name: wot-ui
description: Query wot-ui component knowledge before generating or refactoring UI code.
summary: Query wot-ui component knowledge before generating code.
---

Use the local `wot` CLI before generating or refactoring wot-ui based code.

Recommended workflow:
1. Run `wot list` to find the target component.
2. Run `wot info <Component>` to inspect props, events, slots, and CSS variables.
3. Run `wot doc <Component>` when you need the markdown documentation.
4. Run `wot token <Component>` when theme customization is involved.

Current limitations:
- Only wot-ui v2 is supported.
- Bundled data is still a seed dataset until `pnpm extract` is run against the full wot-ui source repository.
- `usage` and `lint` currently focus on `.vue` files.
