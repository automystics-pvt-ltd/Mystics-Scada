---
name: Scoped installs and native binding approval in the pnpm workspace
description: How to add a dependency (especially one with native bindings, e.g. serialport) to a single artifact package without polluting the workspace root.
---

- Use `pnpm --filter @workspace/<pkg> add <dep>` to add a dependency to one workspace package. The generic `installLanguagePackages` tool call in this repo defaults to adding to the workspace root (`ERR_PNPM_ADDING_TO_ROOT`), which is wrong for artifact-scoped deps — fall back to a direct `pnpm --filter` shell command when that happens.
- Packages with native bindings (e.g. `serialport` → `@serialport/bindings-cpp`) have their install/build scripts ignored by default under pnpm's script-approval security model. Add the native package to `onlyBuiltDependencies` in `pnpm-workspace.yaml`, then re-run `pnpm install` — interactive `pnpm approve-builds` doesn't work non-interactively.
- **Why:** without the `onlyBuiltDependencies` entry, the package installs but its compiled binary never builds, so `require`/`import` throws at runtime instead of at install time — a confusing, delayed failure.
- **How to apply:** whenever adding an npm package with a native/compiled component (serial, crypto, image, ffi bindings), check for post-install `Ignored build scripts` warnings and add the package name to `onlyBuiltDependencies` if the app needs the real binary (not just a pure-JS fallback).
