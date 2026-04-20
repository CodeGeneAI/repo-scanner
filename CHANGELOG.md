# @codegeneai/repo-scanner

## 0.4.0

### Minor Changes

- [#1080](https://github.com/CodeGeneAI/platform/pull/1080) [`d3ba478`](https://github.com/CodeGeneAI/platform/commit/d3ba47850abd93a4acdadb7e3280e91c01d5bec0) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Publish `@codegeneai/repo-scanner` to the public npm registry (`registry.npmjs.org`) instead of distributing prebuilt binaries via `assets.codegene.ai`.

  Install with `bun install -g @codegeneai/repo-scanner` or run via `bunx @codegeneai/repo-scanner`. Bun `>= 1.2` is required at runtime.

  Removed:

  - The `src/update/` subsystem (in-process update check, `BUILD_SHA`-based version reporting, `update` subcommand, `--no-update-check` flag). Upgrades now happen through the package manager: `bun install -g @codegeneai/repo-scanner@latest`.
  - The `build:single` / `build:all` / `build:version` scripts and the `scripts/gen-build-version.ts` / `scripts/install-repo-scanner.sh` bundle pipeline.
  - The `$id` / `$schema` URL on `detectors-v1.schema.json` — the schema is now shipped inside the package (`schemas/detectors-v1.schema.json`).

  The repo-scan CLI behavior is unchanged. `repo-scanner --version` now reports the npm package version.

  **Release pipeline — one-time bootstrap (required before CI can publish this package).** npm's Trusted Publishing (OIDC) cannot be configured for a package that doesn't exist yet, so v0.3.0 must be published **once, manually**, from a clean checkout of the tagged commit:

  1. Mint a short-lived (≤7-day) granular npm token scoped to `@codegeneai/repo-scanner` at https://www.npmjs.com/settings/<user>/tokens (type: Granular, Read & Write, single package).
  2. From a clean checkout: `cd packages/repo-scanner && npm publish --access public` (with that token in `~/.npmrc`).
  3. On npmjs.com → package settings → **Trusted Publisher**, add: org `CodeGeneAI`, repo `platform`, workflow filename `release.yml`, environment blank.
  4. Revoke the bootstrap token.

  All subsequent releases publish automatically via the `Release` workflow using GitHub Actions OIDC (no `NPM_TOKEN` secret required; provenance attached automatically).

### Patch Changes

- [#1053](https://github.com/CodeGeneAI/platform/pull/1053) [`e68b10e`](https://github.com/CodeGeneAI/platform/commit/e68b10e288954beb04c6b6f686d615dc0b5eb030) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Remove the Hono+Railway `services/assets` service and every caller of its image
  proxy. The `assets` public slug has been dropped from the non-production
  Railway service contracts and Cloudflare Tunnel ingress plan. The codegene web
  app's `ASSETS_DOMAIN`, `S3_*` envs, `src/config/s3.server.ts`, and the entire
  `src/features/uploads/` surface have been removed; workspace / project / user
  settings revert to their pre-upload state. The repo-scanner schema `$id` and
  bundle/install URLs now point at `assets.codegene.ai`, matching the sole
  public-bucket policy in `DOMAINS.md`.

## 0.3.1

### Patch Changes

- Publish with `bun publish` so Bun's `catalog:*` protocol in `dependencies` is resolved to literal semver versions in the published tarball. The 0.3.0 tarball shipped literal `"catalog:tooling"` strings for every `tree-sitter-*` grammar, which made the package impossible to install outside this monorepo. 0.3.1 is functionally identical otherwise.

## 0.3.0

### Minor Changes

- [`416fd84`](https://github.com/CodeGeneAI/platform/commit/416fd843743dec5b847a7113df9fd671bbe8e964) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Add duplication checks to pre-commit and pre-push hooks with fast path for diff-dry-check

### Patch Changes

- [#1030](https://github.com/CodeGeneAI/platform/pull/1030) [`fbecb44`](https://github.com/CodeGeneAI/platform/commit/fbecb44127008487fb0c3165f64b60467b06237e) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Upgrade outdated editor and parser dependencies, align repo-scanner with the current web-tree-sitter query API, and replace ambient CodeMirror legacy mode declarations with local typed wrappers.

- [#1020](https://github.com/CodeGeneAI/platform/pull/1020) [`3389c80`](https://github.com/CodeGeneAI/platform/commit/3389c809595323749038331b6b626ff76855da32) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Stabilize detector-selector scoping unit coverage by splitting each detector check into individual test cases so CI does not hit per-test timeout limits.

## 0.2.0

### Minor Changes

- [#874](https://github.com/CodeGeneAI/platform/pull/874) [`9298661`](https://github.com/CodeGeneAI/platform/commit/92986613b139d06e097e57b2adb380c70900af42) Thanks [@rszemplinski](https://github.com/rszemplinski)! - feat(repo-scanner): add diff-scoped DRY check and env var detection for pre-commit

- [#885](https://github.com/CodeGeneAI/platform/pull/885) [`646c023`](https://github.com/CodeGeneAI/platform/commit/646c023b85578a72d5c14387db51f8f6b76cf6e3) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Generate separate ERD diagrams per database group instead of one flat diagram. Tables are grouped by inferred database from source file paths. Cross-group relationships show stub entities.

- [#849](https://github.com/CodeGeneAI/platform/pull/849) [`ed61f89`](https://github.com/CodeGeneAI/platform/commit/ed61f892dc60603414a53dd57fd254d4427dd7d5) Thanks [@rszemplinski](https://github.com/rszemplinski)! - feat(repo-scanner): add history-learned baselines and CI drift reporting

- [#901](https://github.com/CodeGeneAI/platform/pull/901) [`93ed05a`](https://github.com/CodeGeneAI/platform/commit/93ed05ab0cdeef4bc7bc62e64e6bdab97f03fd9b) Thanks [@rszemplinski](https://github.com/rszemplinski)! - feat(repo-scanner): add VCS detector for git/hg/svn detection with provider, branch, and origin URL discovery

### Patch Changes

- [#889](https://github.com/CodeGeneAI/platform/pull/889) [`0935316`](https://github.com/CodeGeneAI/platform/commit/0935316b1707312d7c8127a00a47584c4d66d76b) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Fix Mermaid syntax errors in diagram generation: convert literal `\n` to `<br/>` and quote reserved keywords (`if`, `end`, `subgraph`, etc.) in `escapeLabel`. Fix mermaid thumbnail previews by returning a new array from `fetchTextPreviewsForArtifacts` so React detects the update.

- [#888](https://github.com/CodeGeneAI/platform/pull/888) [`500f95d`](https://github.com/CodeGeneAI/platform/commit/500f95d2cecaefd711191db028b5708aa73a2da4) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Restore combined ERD diagram for multi-database repos alongside per-database diagrams

- [#940](https://github.com/CodeGeneAI/platform/pull/940) [`2588884`](https://github.com/CodeGeneAI/platform/commit/25888845bdd79affe364daaae71b3729b17c766c) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Detect Supabase integrations in scanner output and improve shell completion installation behavior on macOS/zsh.

  - detect Supabase packages in `external-services`
  - label datastore output as `PostgreSQL (Supabase)` when Supabase and PostgreSQL are both detected
  - improve completion install paths and zsh autoload dispatch guidance

- [#931](https://github.com/CodeGeneAI/platform/pull/931) [`6b6e3dd`](https://github.com/CodeGeneAI/platform/commit/6b6e3dd66177a77ba7e3cf5de3ff7a0b7496ccf3) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Enforce strict selector-scoped detector outputs so `--detectors` returns only explicitly requested fields, split multi-field detector selectors for composability, and align detector execution with output selection.

  Also fixes topology-only detector execution scope, restores `--solid` CLI parsing, and improves `--all-detectors` behavior for SOLID and DB schema detectors.
