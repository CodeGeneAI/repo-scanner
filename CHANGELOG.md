# @codegeneai/repo-scanner

## [2.1.0](https://github.com/CodeGeneAI/repo-scanner/compare/v2.0.0...v2.1.0) (2026-05-14)


### Features

* per-component frameworks + languageStats (Component.scoped) ([#16](https://github.com/CodeGeneAI/repo-scanner/issues/16)) ([6b7f961](https://github.com/CodeGeneAI/repo-scanner/commit/6b7f961649939121833670409624768346336a3d))

## [2.0.0](https://github.com/CodeGeneAI/repo-scanner/compare/v1.0.1...v2.0.0) (2026-05-14)


### ⚠ BREAKING CHANGES

* **cli:** --format and -f are gone. Migrate '--format json' to '--json' and drop '--format table' entirely.
* **api:** SDK consumers calling scanRepo(path, { detectors: [...] }) who access fields outside their selected detectors will now see undefined where they previously got empty defaults. Migrate by either omitting options.detectors or by checking optional fields before access.

### Features

* add packageManager detector (lockfile + manifest fallback) ([9536c53](https://github.com/CodeGeneAI/repo-scanner/commit/9536c53ff6f90e6788cd086c1f831c9367ecfb6f))
* **api:** --detectors filter slices the result schema ([ae66ced](https://github.com/CodeGeneAI/repo-scanner/commit/ae66ced7dcae03bcbca6a8344518ab3baafc08e8))
* **api:** --detectors filter slices the result schema ([6a6e8f1](https://github.com/CodeGeneAI/repo-scanner/commit/6a6e8f14effde027f5000b4f74ac02585274d3e6))
* **architecture:** expose monorepo toolName ([9b72ae3](https://github.com/CodeGeneAI/repo-scanner/commit/9b72ae3857373b389c92c7027742eb83eba5da34))
* **cli:** expose packageManager detector in CLI and README ([18e86ac](https://github.com/CodeGeneAI/repo-scanner/commit/18e86ac024a02656747d2666a4217a3e72dc8ac2))
* **cli:** replace --format with boolean --json flag ([d316176](https://github.com/CodeGeneAI/repo-scanner/commit/d316176133fb5e8685d8a61f3d6d9ec4370949a5))
* **detector:** packageManager detects 20 lockfile types ([a2fb136](https://github.com/CodeGeneAI/repo-scanner/commit/a2fb13638a9014b6e81eb77b85a6fef9ea12f165))
* **detector:** packageManager manifest fallback rules ([4a95d9f](https://github.com/CodeGeneAI/repo-scanner/commit/4a95d9f6b4e85ebb3ce4445f5d5c632fcab0dcc8))
* **detector:** scaffold packageManager detector surface ([808c8bc](https://github.com/CodeGeneAI/repo-scanner/commit/808c8bc410aa46784e3df92ce1412e2ef2e7c2fb))
* **framework:** detect TanStack Start ([aadbb91](https://github.com/CodeGeneAI/repo-scanner/commit/aadbb9130d26097f267b34ada34e59b2079ef869))
* **framework:** detect tRPC, Drizzle, Better Auth, TanStack libs ([fb7b0be](https://github.com/CodeGeneAI/repo-scanner/commit/fb7b0be31cef90359b6cdef5e9b9dbe82573473d))
* **framework:** detect Werkzeug, Jinja2, and related Python libs ([48a76a8](https://github.com/CodeGeneAI/repo-scanner/commit/48a76a8392482a3af3fc5333e5cb16fedd18e29c))
* **monorepo:** include tooling/ in convention component scan ([2c954df](https://github.com/CodeGeneAI/repo-scanner/commit/2c954dfd3828118f30dfecad40361cc58eef1332))
* **monorepo:** parse go.work use() directive into components ([e56f2ff](https://github.com/CodeGeneAI/repo-scanner/commit/e56f2ff4b9431b349245b93e1bf3c6ff03e2ec35))
* **monorepo:** parse pnpm-workspace.yaml packages globs ([882516a](https://github.com/CodeGeneAI/repo-scanner/commit/882516a33fdb2ad70338e2dba8327869e8a2eb3c))
* **output:** colorize JSON on TTY + --no-color / NO_COLOR ([f4b6ff0](https://github.com/CodeGeneAI/repo-scanner/commit/f4b6ff059cc8dc3dc5b32681befbc0172ddf57d5))
* **output:** colorize JSON output on TTY ([aa47485](https://github.com/CodeGeneAI/repo-scanner/commit/aa47485bb586e3aa0e2446950880f23e1a753125))
* **output:** render monorepo flag in table view ([dab86a7](https://github.com/CodeGeneAI/repo-scanner/commit/dab86a7376128e87776420864bdd2e23c86eabe0))
* **output:** table renderer slices sections under --detectors ([c3ffbdc](https://github.com/CodeGeneAI/repo-scanner/commit/c3ffbdcdd7f03f2264f52763d245e7bde46892ae))


### Bug Fixes

* **aggregator:** derive inventory.languages from languageStats ([39b6e4c](https://github.com/CodeGeneAI/repo-scanner/commit/39b6e4cd9010e9ce409403f4a9561060757b8ea0))
* **api:** re-export PartialInventory and PartialRepoScanResult ([d3d55d1](https://github.com/CodeGeneAI/repo-scanner/commit/d3d55d1a822220376e983de0e398ee7be2e3b65d))
* **api:** register detectors on SDK import ([672bdf0](https://github.com/CodeGeneAI/repo-scanner/commit/672bdf0bd31d1150f9390d7d40b586ddca0a29fb))
* CI self-scan flag + ScanRepoOptions overload acceptance ([44855ba](https://github.com/CodeGeneAI/repo-scanner/commit/44855ba97918c8820864628093d5069b55795f0f))
* **classifier:** recognize crates/ and keep explicit workspace members ([d4b2938](https://github.com/CodeGeneAI/repo-scanner/commit/d4b2938510775eab010a9e27c8d5f17057cf5d40))
* **cli:** --detectors preserves canonical RepoScanResult schema ([8e382ae](https://github.com/CodeGeneAI/repo-scanner/commit/8e382ae90b8a659c577642d395696cf5a34a9c21))
* **cli:** friendly error for nonexistent --path ([023670e](https://github.com/CodeGeneAI/repo-scanner/commit/023670e4c59e9b8be93e72586a070e07ae47a206))
* **framework:** exclude Go module directive line from substring match ([0fd00fc](https://github.com/CodeGeneAI/repo-scanner/commit/0fd00fcc74b73bc5c93fe026ae0b680590d3dd75))
* **monorepo:** attach manifest paths to go.work use() components ([f21089b](https://github.com/CodeGeneAI/repo-scanner/commit/f21089b7f96e97db237a0d34194dd525b7b722b5))
* **output:** emit null for non-finite numbers + handle async EPIPE ([8d444dc](https://github.com/CodeGeneAI/repo-scanner/commit/8d444dcd051b01b33947b37d9eac20424c0d2100))
* **output:** swallow EPIPE in renderJson when stdout pipe closes ([02ec422](https://github.com/CodeGeneAI/repo-scanner/commit/02ec4220df96cd63c3af2305761c53a002c68a88))
* **packageManager:** address PR [#11](https://github.com/CodeGeneAI/repo-scanner/issues/11) review feedback ([25a080d](https://github.com/CodeGeneAI/repo-scanner/commit/25a080d4053efc1ccf7ba8af65199ce2b70e6c8e))
* **scanignore:** recurse into ignored dirs when descendant negation exists ([f2931ad](https://github.com/CodeGeneAI/repo-scanner/commit/f2931ad6d4652ce704e4ece37002d4c664317fa9))

## [1.0.1](https://github.com/CodeGeneAI/repo-scanner/compare/v1.0.0...v1.0.1) (2026-05-13)


### Bug Fixes

* **packaging:** re-tag prior tarball cleanup as a fix to cut 1.0.1 ([c9daa8a](https://github.com/CodeGeneAI/repo-scanner/commit/c9daa8ad0c9ac52b9cc937716dcec2bd4b84c675))

## [1.0.0](https://github.com/CodeGeneAI/repo-scanner/compare/v0.4.3...v1.0.0) (2026-05-13)


### ⚠ BREAKING CHANGES

* strip down to language + framework + monorepo detectors ([#7](https://github.com/CodeGeneAI/repo-scanner/issues/7))

### Features

* strip down to language + framework + monorepo detectors ([#7](https://github.com/CodeGeneAI/repo-scanner/issues/7)) ([68607ac](https://github.com/CodeGeneAI/repo-scanner/commit/68607ac3858f9e899c46cc9efb607862d0c71caa))

## [0.4.3](https://github.com/CodeGeneAI/repo-scanner/compare/v0.4.2...v0.4.3) (2026-05-12)


### Bug Fixes

* **ci:** retry post-publish smoke against npm registry propagation lag ([e451324](https://github.com/CodeGeneAI/repo-scanner/commit/e4513247a4b4f16c2a5561924724595415853d2a))

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
