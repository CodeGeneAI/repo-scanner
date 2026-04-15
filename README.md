# repo-scanner

Universal repository structure scanner. Detects languages, frameworks, monorepo structure, CI providers, datastores, and more from any codebase — any repo, any size, any language(s).

## Installation

### Quick install (recommended)

Auto-detects your platform (OS + architecture) and installs the latest binary:

```bash
curl -fsSL https://assets.codegene.ai/binaries/install-repo-scanner.sh | sh -s -- \
  --version-url https://assets.codegene.ai/binaries/version.json
```

Verify the installation:

```bash
repo-scanner --version
```

### Pinned install (CI / reproducible builds)

For CI pipelines or when you need a specific version, pass the bundle URL and SHA-256 checksum directly:

```bash
curl -fsSL https://assets.codegene.ai/binaries/install-repo-scanner.sh | sh -s -- \
  --bundle-url <BUNDLE_URL> \
  --bundle-sha256 <BUNDLE_SHA256>
```

The bundle URL and checksum for each release are published in [`version.json`](https://assets.codegene.ai/binaries/version.json).

### Supported platforms

| Platform | Key | Install method |
|----------|-----|----------------|
| Linux x64 | `bun-linux-x64` | Shell installer |
| Linux x64 (no AVX2) | `bun-linux-x64-baseline` | Shell installer |
| Linux ARM64 | `bun-linux-arm64` | Shell installer |
| macOS x64 | `bun-darwin-x64` | Shell installer |
| macOS x64 (no AVX2) | `bun-darwin-x64-baseline` | Shell installer |
| macOS ARM64 (Apple Silicon) | `bun-darwin-arm64` | Shell installer |
| Windows x64 | `bun-windows-x64` | Manual download |
| Windows x64 (no AVX2) | `bun-windows-x64-baseline` | Manual download |

#### Windows

The shell installer does not support Windows. Download the bundle archive directly from:

```
https://assets.codegene.ai/binaries/scanner-tools-bundle-bun-windows-x64.tar.gz
```

Extract it and add the `bin/` directory to your `PATH`.

### Prerequisites

- `curl` and `tar`
- `sha256sum` or `shasum` (checksum verification)
- `python3` (only required for `--version-url` mode)

### Install locations

| Path | Purpose |
|------|---------|
| `~/.local/bin/repo-scanner` | Symlinked binary (ensure `~/.local/bin` is on your `PATH`) |
| `~/.cache/codegene/scanner-tools/` | Downloaded archive cache |
| `~/.local/share/codegene/scanner-tools/` | Extracted binary versions |

These defaults can be overridden with `REPO_SCANNER_BIN_ROOT`, `REPO_SCANNER_CACHE_ROOT`, and `REPO_SCANNER_INSTALL_ROOT` environment variables.

## Usage

```bash
# basic scan
bun packages/repo-scanner/src/bin.ts --path /path/to/repo

# JSON output
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --format json

# enable dependency intelligence
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps

# detector-only scan (advanced)
bun packages/repo-scanner/src/bin.ts --detectors @inventory,@quality

# list available detector IDs and descriptions
bun packages/repo-scanner/src/bin.ts detectors

# machine-readable detector schema
bun packages/repo-scanner/src/bin.ts detectors --format json --schema

# generate completion script
bun packages/repo-scanner/src/bin.ts completion zsh > _repo-scanner

# install completion script automatically
bun packages/repo-scanner/src/bin.ts completion install fish

# uninstall completion script
bun packages/repo-scanner/src/bin.ts completion uninstall fish

# JSON + dependency scan controls
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --format json --deps --ecosystems npm,pypi --no-security

# CI-style failure when matching vulnerabilities are found
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps --fail-on-vulns --severity-threshold high

# quota-style failure gates
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps --fail-on-vulns-count 3 --fail-on-outdated-count 5

# adjust large-file LOC threshold
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --large-file-threshold 1000

# code duplication detection (dry-check mode)
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --dry-check

# SOLID principles analysis
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --solid

# exclude test files from env var detection (default) or include them
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --env-include-tests

# version
bun packages/repo-scanner/src/bin.ts --version
```

## Features

- Single filesystem walk → in-memory index → all detectors query without disk I/O
- 38 independent detectors covering structure, code health, and dependency intelligence
- Component discovery with multi-label classification (primary kind + secondary kinds from content signals)
- Categorized tooling output (containers, IaC, testing, build tools, linting, deploy, etc.)
- `.scanignore` file support with gitignore syntax and scoped rules per detector
- Code duplication detection with configurable thresholds
- SOLID principles analysis via tree-sitter AST
- Confidence scores and evidence on all findings
- Zero runtime dependencies (except optional tree-sitter for SOLID)
- ~140ms for a 1800-package monorepo
- Built-in dependency intelligence subsystem exposed via API (`scanDependencies`) and CLI (`--deps`)

## Advanced detector selection

`repo-scanner` now uses `--detectors` as the single advanced entrypoint for detector-only runs.

```bash
# Run inventory + quality presets
repo-scanner --detectors @inventory,@quality

# Mix section profile with additional detectors
repo-scanner --inventory --detectors solid-health,db-schema
```

See `repo-scanner detectors --format json --schema` for machine-readable detector metadata and preset mappings.
Schema definition endpoint: `https://assets.codegene.ai/binaries/repo-scanner/schemas/detectors-v1.schema.json`.
Schema changelog: `packages/repo-scanner/schemas/CHANGELOG.md`.

## Detectors

| Detector | Description |
|----------|-------------|
| api-surface | API endpoint and protocol detection |
| build | Build systems and commands |
| build-commands | Build command extraction |
| call-graph | Static call graph extraction |
| ci | CI provider and workflow detection |
| codebase-size | Total file and LOC summary |
| code-duplication | Token-level duplication analysis |
| code-quality | Quality gate and scanner detection |
| complexity-hotspots | Complexity hotspot detection |
| components | Repository component inventory |
| containerization | Docker and container tooling detection |
| circular-deps | Circular dependency analysis between components |
| cross-package-deps | Cross-package dependency graph |
| datastore | Datastore and cache detection |
| db-schema | Database schema extraction |
| dead-export | Potentially unused export detection |
| dependency-manager | Dependency manager detection |
| deployment-platform | Deployment platform detection |
| env | Environment variable usage and inference |
| external-services | External service integration detection |
| framework | Framework and library detection |
| high-impact-components | High blast-radius component analysis |
| iac | Infrastructure-as-code detection |
| language | Language and LOC detection (names selector) |
| language-stats | Language percentage and LOC stats |
| large-file | Large source file detection |
| layer-violations | Architecture layer violation analysis |
| lint-commands | Lint command extraction |
| linting | Linter and formatter detection |
| monorepo | Monorepo structure and components |
| naming-convention | Naming convention analysis |
| repo-tools | Repository tooling and config detection |
| runtime | Runtime version detection |
| solid-health | SOLID principle analysis |
| test-commands | Test command extraction |
| testing | Test framework detection |
| todo | TODO/FIXME annotation detection |
| vcs | VCS metadata detection |

## Detector × Language Coverage Matrix

Coverage status: ✅ good coverage | 🟡 partial/minimal | 🟥 not covered | — not applicable

| Detector | JS/TS | Python | Go | Rust | Java | Kotlin | Scala | C/C++ | Ruby | PHP | Swift | Dart | Elixir | .NET | Shell |
|----------|-------|--------|-----|------|------|--------|-------|-------|------|-----|-------|------|--------|------|-------|
| **language** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **framework** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ | ✅ | — |
| **dependency-manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **build** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **testing** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **linting** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **datastore** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **runtime** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **env** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **api-surface** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| **naming-convention** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **dead-export** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **ci** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **monorepo** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ | ✅ | ✅ | — |
| **containerization** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **iac** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **repo-tools** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

> **Note:** `ci`, `containerization`, `iac`, and `repo-tools` are language-agnostic detectors that work by file/config presence rather than language-specific patterns.

## `.scanignore`

Drop a `.scanignore` file in your repo root (or any subdirectory) to exclude paths from scanning. Uses gitignore syntax with support for nested files (additive).

### Basic usage

```scanignore
# Ignore benchmarks everywhere
**/bench/

# Ignore specific root directories
scripts/
tools/

# Negate (un-ignore)
!tools/critical-tool/
```

### Scoped rules

By default, ignored paths are excluded from the **entire scan**. Scoped rules let you exclude paths from specific detectors only — the files stay indexed but individual detectors skip them.

Two syntaxes:

**Section headers** — scope all subsequent rules until the next header:

```scanignore
# Global ignores (excluded from everything)
**/bench/

# Only exclude from env var detection
[env]
/e2e/
**/*.test.ts
**/*.spec.ts

# Only exclude from API surface detection
[api]
**/*.test.ts

# Reset to global
[]
some-global-pattern/
```

**Inline prefix** — scope a single rule:

```scanignore
env:e2e/
env:**/*.test.ts
api:**/*.spec.ts
```

### Nesting

`.scanignore` files are additive — a child `.scanignore` in a subdirectory adds rules on top of the parent, never removes them. This works like `.gitignore` nesting.

```
repo/
  .scanignore          # root rules
  packages/
    agent-sdk/
      .scanignore      # adds rules scoped to packages/agent-sdk/
```

### Available scopes

Scopes correspond to detector IDs: `env`, `api`, `language`, `framework`, `testing`, `linting`, `build`, `containerization`, `iac`, `datastore`, etc.

## Component classification

Components discovered in monorepos are classified with a **primary kind** based on directory path and optional **secondary kinds** based on content signals.

### Primary kind (path-based)

| Path prefix | Kind |
|-------------|------|
| `apps/`, `app/` | app |
| `services/`, `service/` | service |
| `packages/`, `libs/`, `pkg/` | package |
| `infra/`, `terraform/`, `deploy/`, `pulumi/`, `cdk/` | infra |
| `scripts/`, `tools/`, `tooling/` | script |

### Secondary kinds (content-based signals)

| Signal | Secondary kind |
|--------|---------------|
| `index.html`, `vite.config.*`, `next.config.*`, `vercel.json`, `netlify.toml` | +app |
| `Dockerfile`, `nest-cli.json`, `server.ts`, `main.ts` | +service |
| `tsconfig.build.json`, `tsup.config.*`, `rollup.config.*` | +package |

Example output:
```
    package  (+app) @acme/ui — Component library  packages/ui
    service  (+app) @acme/api — API gateway  services/api
    package  @acme/shared — Shared utils  packages/shared
```

## Inventory categories

The scan output categorizes detected tooling into specific groups instead of a single bucket:

| Category | Examples |
|----------|---------|
| Frameworks | NestJS, React, Tailwind CSS |
| Datastores | PostgreSQL, Redis, AWS S3 |
| Dep Managers | Bun, npm, pip |
| Containers | Docker, Docker Compose, Helm |
| IaC | Terraform, Pulumi, AWS CDK |
| Testing | Vitest, Bun Test, Playwright, Jest |
| Build Tools | Turborepo, Nx, Make |
| Linting | Biome, ESLint, Prettier |
| Code Quality | SonarQube, CodeClimate |
| Deploy | Vercel, Railway, Fly.io |
| Other Tools | Husky, Changesets, Nix |

## Language support by detector

### Language detection & LOC counting

Used by: **language**, **large-file**, **todo**

| Language | Extensions |
|----------|-----------|
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py` |
| Go | `.go` |
| Rust | `.rs` |
| Java | `.java` |
| C# | `.cs` |
| Ruby | `.rb` |
| PHP | `.php` |
| Swift | `.swift` |
| Dart | `.dart` |
| C | `.c`, `.h` |
| C++ | `.cpp`, `.cc`, `.cxx`, `.hpp` |
| Kotlin | `.kt` |
| Scala | `.scala` |
| Elixir | `.ex`, `.exs` |
| Zig | `.zig` |
| Lua | `.lua` |
| R | `.r`, `.R` |
| Perl | `.pl` |
| Shell | `.sh`, `.bash`, `.zsh` |
| Tcl | `.tcl` |
| F# | `.fs`, `.fsx` |
| VB.NET | `.vb` |

### Environment variable detection

| Language | Patterns |
|----------|----------|
| TypeScript/JavaScript | `process.env.*`, `import.meta.env.*` (Vite) |
| Python | `os.getenv()`, `os.environ[]`, `os.environ.get()` |
| Go | `os.Getenv()`, `os.LookupEnv()`, struct tags (`env:`, `envconfig:`) |
| Rust | `env::var()`, `env!()`, `option_env!()` |
| Shell | `export VAR=`, `${VAR:-default}`, `${VAR:=}`, `${VAR:?}` |
| Java/Kotlin | `System.getenv()`, Spring `@Value("${...}")` |
| C# | `Environment.GetEnvironmentVariable()`, `configuration[]` |
| Ruby | `ENV[]`, `ENV.fetch()` |
| PHP | `getenv()`, `$_ENV[]`, `$_SERVER[]` |
| C/C++ | `getenv()` |
| Swift | `ProcessInfo.processInfo.environment[]` |
| Scala | `sys.env()`, `sys.env.getOrElse()` |
| Dart | `Platform.environment[]`, `String.fromEnvironment()` |
| Lua | `os.getenv()` |

### API endpoint detection

| Language | Frameworks |
|----------|-----------|
| TypeScript/JavaScript | NestJS (REST, GraphQL, WebSocket), Express |
| Python | Flask, FastAPI |
| Go | net/http, gorilla/mux |
| Rust | Actix-web, Axum, Rocket |
| Java/Kotlin | Spring (RequestMapping, GetMapping, etc.) |
| Ruby | Rails routes |
| PHP | Laravel |
| Elixir | Phoenix |
| Swift | Vapor |
| Scala | Play Framework |
| C# | ASP.NET |
| GraphQL | `.graphql`, `.gql` schema files |
| gRPC | `.proto` service definitions |

### Runtime version detection

| Runtime | Sources |
|---------|---------|
| Node.js | `.nvmrc`, `.node-version`, `package.json engines.node` |
| Python | `.python-version`, `pyproject.toml requires-python` |
| Go | `go.mod` go directive |
| Rust | `rust-toolchain.toml`, `Cargo.toml rust-version` |
| Ruby | `.ruby-version`, `Gemfile` ruby declaration |
| Java | `pom.xml maven.compiler.source`, `build.gradle sourceCompatibility` |
| .NET | `global.json sdk.version`, `.csproj TargetFramework` |
| PHP | `composer.json require.php` |
| Bun | `package.json engines.bun` |
| asdf | `.tool-versions` (nodejs, python, golang, rust, ruby, java, php, dotnet) |

### Dead export detection (heuristic)

| Language | Export patterns | Import/reference patterns |
|----------|---------------|--------------------------|
| TypeScript/JavaScript | `export function/const/class/type/interface/enum`, `export { }` | `import { }`, `import x from`, `export { } from` |
| Go | Capitalized `func`, `type`, `var`, `const` | Symbol name occurrence in other files |
| Rust | `pub fn/struct/enum/trait/const/type` | `use path::Symbol`, `use path::{A, B}` |
| Python | Top-level `def`, `class` (non `_`-prefixed) | `from M import X` |
| Java/Kotlin | `public class/interface/enum/record` | `import pkg.X` |
| Ruby | Top-level `def`, `class`, `module` | Symbol name occurrence |
| C# | `public class/interface/enum/struct/record/delegate` | `using` directives + PascalCase references |
| F# | Top-level `let`, `type`, `module` | `open` directives + references |
| VB.NET | `Public Class/Interface/Enum/Structure/Module` | `Imports` directives + references |

### Cross-package dependency graph

| Ecosystem | Manifest | Dependency mechanism |
|-----------|----------|---------------------|
| npm | `package.json` | `dependencies`, `devDependencies`, `peerDependencies` |
| Go | `go.mod` | `require` directives (module path matching) |
| Cargo (Rust) | `Cargo.toml` | `[dependencies]` with name/path matching |
| Python | `pyproject.toml` | `[project] dependencies` name matching |
| NuGet (.NET) | `.csproj`, `.fsproj`, `.vbproj` | `<ProjectReference>` path resolution |

### Naming convention analysis

| Language | Analyzed constructs |
|----------|-------------------|
| TypeScript/JavaScript | functions, classes, interfaces, types, enums, constants, variables |
| Python | functions, classes, constants |
| Go | functions, structs, interfaces, constants, variables |
| Rust | functions, structs, enums, traits, constants |
| Java/Kotlin | classes, interfaces, enums, methods, constants |

### Deep dependency scanning (11 ecosystems)

| Ecosystem | Parser | Manifests |
|-----------|--------|-----------|
| npm | JavaScript/TypeScript | `package.json`, `package-lock.json` |
| PyPI | Python | `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.cfg` |
| Go Modules | Go | `go.mod`, `go.sum` |
| Cargo | Rust | `Cargo.toml`, `Cargo.lock` |
| RubyGems | Ruby | `Gemfile`, `Gemfile.lock` |
| Maven | Java | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| NuGet | .NET | `.csproj`, `Directory.Packages.props`, `packages.config` |
| Packagist | PHP | `composer.json` |
| CocoaPods | Swift/iOS | `Package.swift`, `Package.resolved` |
| Pub | Dart | `pubspec.yaml`, `pubspec.lock` |
| Conan | C/C++ | `conanfile.txt` |

## Programmatic API

```ts
import { scanRepo } from "@codegeneai/repo-scanner";

// Basic scan
const result = await scanRepo("/path/to/repo");

// With dependency intelligence
const result = await scanRepo("/path/to/repo", {
  dependencies: {
    enabled: true,
    ecosystems: ["npm", "pypi"],
    skipSecurity: false,
    skipUsage: false,
    concurrency: 4,
  },
});

// Access results
result.inventory.languages;          // ["TypeScript", "Python"]
result.inventory.frameworks;         // ["NestJS", "React"]
result.inventory.containerization;   // ["Docker", "Docker Compose"]
result.inventory.testing;            // ["Vitest", "Playwright"]
result.inventory.deploymentPlatforms; // ["Vercel", "Railway"]
result.inventory.envVars;            // EnvVarInfo[]
result.inventory.apiSurface;         // { endpoints, protocols, frameworksUsed }

result.architecture.monorepo;        // true
result.architecture.components;      // Component[] with kind + secondaryKinds
result.architecture.crossPackageDeps; // { edges, nodes, orphans }

result.buildAndTest.ciSystems;       // ["GitHub Actions"]
result.signals.hasIaC;               // boolean
result.signals.hasContainerization;  // boolean
```

### Exported types

```ts
import type {
  RepoScanResult,
  Component,
  ComponentKind,
  EnvVarInfo,
  ApiEndpoint,
  ApiSurface,
  LanguageStats,
  RuntimeInfo,
  LargeFileInfo,
  TodoAnnotation,
  DeadExport,
  CrossPackageDependencyGraph,
  CodeDuplicationResult,
  SolidHealthResult,
  ScanRepoOptions,
  DependencyScanConfig,
} from "@codegeneai/repo-scanner";
```

## CLI options

### General

| Flag | Description | Default |
|------|-------------|---------|
| `-p`, `--path <dir>` | Directory to scan | cwd |
| `-f`, `--format <fmt>` | Output format: `table` or `json` | `table` |
| `--version`, `-v` | Show version number | |
| `--help`, `-h` | Show help text | |

### Scan tuning

| Flag | Description | Default |
|------|-------------|---------|
| `--large-file-threshold <n>` | Line count threshold for large file detection | 500 |
| `--env-include-tests` | Include test files in env var detection | off |

### Code duplication

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-check` | Run duplication-only scan with dry-check output contract | |
| `--min-tokens <n>` | Minimum token window for duplication detection | 50 |
| `--min-lines <n>` | Minimum duplicate lines to report | 6 |
| `--extensions <list>` | Comma-separated file extensions for duplication scan | |
| `--min-unique-ratio <f>` | Min distinct/total token ratio for duplication filtering | 0.10 |
| `--max-literal-ratio <f>` | Max literal token ratio for duplication filtering | 0.50 |
| `--no-barrel-filter` | Disable barrel re-export duplication filtering | |

### SOLID analysis

| Flag | Description | Default |
|------|-------------|---------|
| `--solid` | Enable SOLID principles analysis (uses tree-sitter AST) | off |
| `--solid-threshold <n>` | SOLID score threshold for reporting | 80 |

### Dependency scanning

Use `--deps` to enable. Optional flags:

| Flag | Description | Default |
|------|-------------|---------|
| `--deps` | Enable deep dependency analysis | off |
| `--ecosystems <list>` | Comma-separated ecosystems to scan | all |
| `--deps-debug` | Emit dependency debug diagnostics to stderr | |
| `--no-usage` | Skip dependency usage scanning | |
| `--no-security` | Skip vulnerability checks | |
| `--no-version-lookup` | Skip registry version lookups | |
| `--concurrency <n>` | Max parallel dependency scan operations | CPU count |
| `--component-grouping <mode>` | Component grouping for dependency summaries | `default` |
| `--fail-on-vulns` | Exit code 1 when vulnerabilities match threshold | |
| `--fail-on-vulns-count <n>` | Exit code 1 when vulnerability matches >= n | |
| `--severity-threshold <lvl>` | Vulnerability threshold (`unknown`/`low`/`moderate`/`high`/`critical`) | `low` |
| `--fail-on-outdated` | Exit code 1 when updates match outdated threshold | |
| `--fail-on-outdated-count <n>` | Exit code 1 when outdated matches >= n | |
| `--outdated-threshold <lvl>` | Update threshold (`patch`/`minor`/`major`) | `patch` |

Valid ecosystems: `npm`, `pypi`, `go`, `cargo`, `rubygems`, `maven`, `nuget`, `packagist`, `cocoapods`, `pub`, `conan`

Valid component grouping modes: `default`, `apps-only`, `services-only`, `workspace-package`

### Detector-only mode

| Command/Flag | Description |
|--------------|-------------|
| `--detectors <list>` | Comma-separated canonical detector IDs (e.g. `env,language,todo`) |
| `detectors` | Print supported detector IDs and descriptions |
| `completion <shell>` | Generate shell completion script (`bash`, `zsh`, or `fish`) |
| `completion install <shell>` | Install shell completion script in the default user completion path |
| `completion uninstall <shell>` | Remove installed shell completion script from the default user completion path |
| `detectors --format json --schema` | Emit schema-friendly detector + preset metadata payload |

Dependency JSON output includes summary lists (`topOutdated`, `topVulnerable`), component-level grouping (`byComponent`), and a machine-readable `policyEvaluation` block when dependency scanning is enabled.
