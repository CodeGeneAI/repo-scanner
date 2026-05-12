# @codegeneai/repo-scanner

## [0.5.0](https://github.com/CodeGeneAI/repo-scanner/compare/repo-scanner-v0.4.2...repo-scanner-v0.5.0) (2026-05-12)


### Features

* add --topology flag for mermaid diagram generation ([#818](https://github.com/CodeGeneAI/repo-scanner/issues/818)) ([18b8359](https://github.com/CodeGeneAI/repo-scanner/commit/18b8359ea8e91c08fdc48f9921a98a6d33646707))
* add diff-scoped duplication and env var detection for pre-commit ([#874](https://github.com/CodeGeneAI/repo-scanner/issues/874)) ([0151581](https://github.com/CodeGeneAI/repo-scanner/commit/015158197476c87a746407a70209bdf77ca1d79d))
* add ERD diagram generation for database schema visualization ([#843](https://github.com/CodeGeneAI/repo-scanner/issues/843)) ([58110c2](https://github.com/CodeGeneAI/repo-scanner/commit/58110c2e797f7d9f391db374ebddcdb917cd3d51))
* **e2e:** add live test-bench scenarios and scanner binary pipeline ([192a87b](https://github.com/CodeGeneAI/repo-scanner/commit/192a87bff6ea37411c63247cceb6cb245cfbd6a4))
* **preview:** automate codegene.app ingress ([#1030](https://github.com/CodeGeneAI/repo-scanner/issues/1030)) ([94a189c](https://github.com/CodeGeneAI/repo-scanner/commit/94a189c2c1c799467d0668ac89992834f877ed57))
* **repo-scanner:** add architecture violations, blast radius, complexity hotspots, and external services ([d16b9d8](https://github.com/CodeGeneAI/repo-scanner/commit/d16b9d89a425757838071f71845ff14653940854))
* **repo-scanner:** add AST-based SOLID principles health detector ([9ed1d69](https://github.com/CodeGeneAI/repo-scanner/commit/9ed1d6978d41ab0d00e85e134ff171c5cfd2fea0))
* **repo-scanner:** add built-in auto-updater CLI ([9f8c332](https://github.com/CodeGeneAI/repo-scanner/commit/9f8c332c6513cf24b118998063678a4cfb2e364f))
* **repo-scanner:** add duplication checks to pre-commit and pre-push hooks ([#983](https://github.com/CodeGeneAI/repo-scanner/issues/983)) ([d1bf1a6](https://github.com/CodeGeneAI/repo-scanner/commit/d1bf1a6e992dca510a62272126487ec469176b3f))
* **repo-scanner:** add duplication checks to pre-commit and pre-push hooks ([#983](https://github.com/CodeGeneAI/repo-scanner/issues/983)) ([04bdd54](https://github.com/CodeGeneAI/repo-scanner/commit/04bdd546c7a4e185a17d25185046f32aecb84819))
* **repo-scanner:** add env var detector and naming convention detector ([a6ca4e3](https://github.com/CodeGeneAI/repo-scanner/commit/a6ca4e36aca0d58ea395747e044497b45876a7d8))
* **repo-scanner:** add isPolyglot signal for multi-language repos ([daf2d2d](https://github.com/CodeGeneAI/repo-scanner/commit/daf2d2d3733874729b2303b0d5a86fdb77bca0cd))
* **repo-scanner:** add large-file detector for LOC-heavy source files ([71ba6f5](https://github.com/CodeGeneAI/repo-scanner/commit/71ba6f5f198f829b92c2149e2386329b0ad252b7))
* **repo-scanner:** add per-component metadata enrichment ([e13a032](https://github.com/CodeGeneAI/repo-scanner/commit/e13a03243decbae3f1b89b036ffd8bdad5b55a75))
* **repo-scanner:** add Python, Java, and Kotlin monorepo detection ([76d142f](https://github.com/CodeGeneAI/repo-scanner/commit/76d142f461cca1e8e66a1ff74e55662ac4fb0136))
* **repo-scanner:** add runtime version detector and API surface detector ([8948a78](https://github.com/CodeGeneAI/repo-scanner/commit/8948a7821d3fd17aec60f56c3dd56b8d18c024e8))
* **repo-scanner:** add TODO scanner, cross-package deps, dead export detector, and broad language parity ([2c19947](https://github.com/CodeGeneAI/repo-scanner/commit/2c19947e7862854baa7465265656f4ac26f908d8))
* **repo-scanner:** add universal repo structure scanner with 12 detectors ([f97d7e8](https://github.com/CodeGeneAI/repo-scanner/commit/f97d7e811b1a9e5c82c584883e4b23642135bcff))
* **repo-scanner:** add vcs confidence and branch provenance ([#904](https://github.com/CodeGeneAI/repo-scanner/issues/904)) ([faed919](https://github.com/CodeGeneAI/repo-scanner/commit/faed919fcc77d56b8811a05f9498e06b4e95547c))
* **repo-scanner:** add VCS detector for git/hg/svn detection ([#901](https://github.com/CodeGeneAI/repo-scanner/issues/901)) ([b4f00ac](https://github.com/CodeGeneAI/repo-scanner/commit/b4f00acb6389b6bc4f3bb055f41c179894986f58))
* **repo-scanner:** expand language coverage across all detectors to near-universal support ([8bf21a4](https://github.com/CodeGeneAI/repo-scanner/commit/8bf21a4c7c2b9c7792ec90f5b529e756c99bad9f))
* **repo-scanner:** integrate dry-check code duplication detector ([47b0ce8](https://github.com/CodeGeneAI/repo-scanner/commit/47b0ce88766a27ce091af74200e4a393d2a95519))
* **repo-scanner:** publish to public npm registry ([#1080](https://github.com/CodeGeneAI/repo-scanner/issues/1080)) ([4e716a1](https://github.com/CodeGeneAI/repo-scanner/commit/4e716a173a962cb7215a847177e3148b9e5d1618))
* **repo-scanner:** restore section flags and full-scan alias ([#838](https://github.com/CodeGeneAI/repo-scanner/issues/838)) ([20f1890](https://github.com/CodeGeneAI/repo-scanner/commit/20f1890c88a3b4248803fdf3864a76065e5bd7f8))
* **repo-scanner:** tune SOLID thresholds for production-worthy results ([c324a28](https://github.com/CodeGeneAI/repo-scanner/commit/c324a28aab2f28f29fdad0b14fe8d19c699d07b3))
* **scanner-baseline:** hard-cut scanner install to canonical installer ([0e0ce37](https://github.com/CodeGeneAI/repo-scanner/commit/0e0ce375f7c078a84ef8ca58e5963f99be6d919a))
* **trigger-migration:** finalize preview and reconcile hard-cut ([#955](https://github.com/CodeGeneAI/repo-scanner/issues/955)) ([75edd90](https://github.com/CodeGeneAI/repo-scanner/commit/75edd90092897eb32e7699415c0441741e08816e))


### Bug Fixes

* **ci:** release workflow must auth git as the App bot ([6862192](https://github.com/CodeGeneAI/repo-scanner/commit/68621922f085670c478f90b8deb57bf4d9774a8b))
* **ci:** retry post-publish smoke against npm registry propagation lag ([e451324](https://github.com/CodeGeneAI/repo-scanner/commit/e4513247a4b4f16c2a5561924724595415853d2a))
* **ci:** self-scan smoke must run all detectors, not print help ([0ce4d50](https://github.com/CodeGeneAI/repo-scanner/commit/0ce4d5046e00b8e836743fcfa8e7ec266cbedeaa))
* **e2e:** stabilize deployment protection cross-host tests ([#1020](https://github.com/CodeGeneAI/repo-scanner/issues/1020)) ([26996ef](https://github.com/CodeGeneAI/repo-scanner/commit/26996ef36f7ff861e47bb8927eca6deaf7fa2672))
* **release:** publish public npm independently ([871f572](https://github.com/CodeGeneAI/repo-scanner/commit/871f5722291b9956f53b0c8f2647e3b59ea48fa4))
* **repo-scanner:** detect literal workspace paths and expand quality gate signals ([f9e2386](https://github.com/CodeGeneAI/repo-scanner/commit/f9e23867da0e5148116b2f0009a6cacc526f7381))
* **repo-scanner:** enforce explicit topology output and ERD fidelity ([7b08101](https://github.com/CodeGeneAI/repo-scanner/commit/7b08101e38776d90cf918f20f10502ccff426843))
* **repo-scanner:** enforce selector-scoped and composable detector outputs ([#931](https://github.com/CodeGeneAI/repo-scanner/issues/931)) ([84bf742](https://github.com/CodeGeneAI/repo-scanner/commit/84bf7427ac0dc367951381e8aeb724827630a938))
* **repo-scanner:** honor detector-only output for env scans ([#924](https://github.com/CodeGeneAI/repo-scanner/issues/924)) ([8eed92c](https://github.com/CodeGeneAI/repo-scanner/commit/8eed92c165de870f2c340ddd54ec54d5f24e33d7))
* **repo-scanner:** improve Supabase detection and macOS completion ([#940](https://github.com/CodeGeneAI/repo-scanner/issues/940)) ([3517192](https://github.com/CodeGeneAI/repo-scanner/commit/3517192397377cda29848a86d02ea1048c190d95))
* **repo-scanner:** repair installer version-url parsing ([#919](https://github.com/CodeGeneAI/repo-scanner/issues/919)) ([d764b45](https://github.com/CodeGeneAI/repo-scanner/commit/d764b45cd455a8cc025040070c8e4e55ef5fff22))

## 0.4.2

### Patch Changes

- [`422153c`](https://github.com/CodeGeneAI/repo-scanner/commit/422153c681160790bc7c628809f107744064a234) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Remove the redundant `trustedDependencies` field from `package.json`. The scanner uses `web-tree-sitter` (WASM-only) at runtime and never loads native `.node` bindings — the field was inert. Verified by running `--all-detectors` against a clean install with tree-sitter postinstalls explicitly blocked: the naming-convention detector (which requires tree-sitter AST parsing) populates correctly. `node-gyp-build`'s runtime fallback to `prebuilds/` handles asset resolution without needing the postinstall copy step.

  The release workflow also gains a post-publish smoke step that installs the just-published version into a clean dir, scans an external small JS repo (`sindresorhus/p-map`), and asserts the output structure — catching publish-pipeline regressions before consumers see them.

## 0.4.1

### Patch Changes

- [`f634b13`](https://github.com/CodeGeneAI/repo-scanner/commit/f634b1309db266ea6a5d7139a4bc769467c6d8f5) Thanks [@rszemplinski](https://github.com/rszemplinski)! - Initial release from the standalone CodeGeneAI/repo-scanner repository.

  Functionally identical to the prior 0.4.0 release from
  CodeGeneAI/platform; the version bump is purely a publishing-pipeline
  validation step.

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
