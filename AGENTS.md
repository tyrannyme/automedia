# Automedia Guidelines

Don't roll your own component if one already exist.

Prefer pulling in shadcn components instead of rolling your own unless you're making something real custom.

If designing UI, follow our DESIGN.md strictly, unless told otherwise or inventing new UI with the user. And if doing so, always ask for permission from the user. Never silently drop DESIGN.md!

## UI implementation gates

These rules apply to renderer/UI work, not backend-only changes:

- Before writing UI, inspect `src/renderer/components/ui`, `components.json`, and the installed shadcn CLI. If a shadcn primitive exists, use it or add it with the project CLI; do not hand-roll an equivalent or import a lower-level primitive directly.
- Use installed tooling only: `pnpm exec shadcn add ...` (or the local binary) is allowed. Never use `npx`, `pnpx`, `pnpm dlx`, or another one-shot downloader.
- Treat generated shadcn code as a starting point. Restyle every used primitive to `DESIGN.md`; its registry defaults are not the product design.
- UI work is screenshot-led. Capture a baseline before changing the UI, then capture at least the app viewport (`800x600`) and the default/wide viewport (`1280x800`) after each meaningful pass. Use project/browser preview tooling when available.
- Inspect those screenshots for overlap, clipping, density, hierarchy, scroll reachability, and open popovers/menus/dialogs. Iterate until the actual rendered surfaces are usable. Screenshots are part of implementation, not optional handoff evidence.
- Exercise loading, empty, error, and populated states when the surface supports them. Typecheck, tests, and DOM snapshots alone cannot qualify UI as complete.
