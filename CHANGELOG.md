# @codegeneai/repo-scanner

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
