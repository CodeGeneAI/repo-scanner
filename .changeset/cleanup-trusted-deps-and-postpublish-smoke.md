---
"@codegeneai/repo-scanner": patch
---

Remove the redundant `trustedDependencies` field from `package.json`. The scanner uses `web-tree-sitter` (WASM-only) at runtime and never loads native `.node` bindings — the field was inert. Verified by running `--all-detectors` against a clean install with tree-sitter postinstalls explicitly blocked: the naming-convention detector (which requires tree-sitter AST parsing) populates correctly. `node-gyp-build`'s runtime fallback to `prebuilds/` handles asset resolution without needing the postinstall copy step.

The release workflow also gains a post-publish smoke step that installs the just-published version into a clean dir, scans an external small JS repo (`sindresorhus/p-map`), and asserts the output structure — catching publish-pipeline regressions before consumers see them.
