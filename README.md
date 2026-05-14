# repo-scanner

Universal repository scanner. Detects languages, frameworks, and monorepo component structure from any codebase.

## Installation

Published as `@codegeneai/repo-scanner`. Requires [Bun](https://bun.sh) `>= 1.3` at runtime.

### Global install

```bash
bun install -g @codegeneai/repo-scanner
repo-scanner --version
```

### One-off

```bash
bunx @codegeneai/repo-scanner --path /path/to/repo
```

### In a project

```bash
bun add -d @codegeneai/repo-scanner
bun x repo-scanner --path .
```

## Usage

```bash
repo-scanner --path /path/to/repo
repo-scanner --path /path/to/repo --json
repo-scanner --detectors language,framework      # subset
repo-scanner detectors                            # list available detectors
repo-scanner detectors --json                     # machine-readable catalog
repo-scanner completion zsh > _repo-scanner
repo-scanner completion install fish
repo-scanner --version

# Only the monorepo section (sliced output)
repo-scanner --path . --detectors monorepo
repo-scanner --path . --detectors monorepo --json
# Outputs only architecture + rootPath + scannedAt — inventory and languageStats are omitted.
```

## What it detects

- **language** — files and lines of code per language across the supported language set (extension-based).
- **framework** — framework and library detection from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `composer.json`, `pubspec.yaml`, etc.).
- **monorepo** — workspace detection (Turborepo, Nx, Lerna, Rush, pnpm workspaces, Go workspaces, Bazel, Pants, Melos, .NET Solutions) plus component classification. Returns the detected workspace tool name in `architecture.toolName`. Each component carries `scoped.frameworks` and `scoped.languageStats` for per-component inventory.
- **packageManager** — detects npm, pnpm, Yarn, Bun, pip, Poetry, uv, Pipenv, Cargo, Go modules, Bundler, Composer, NuGet, pub, Maven, Gradle, sbt, Mix, Swift Package Manager, Stack, Cabal from lockfiles and manifests.
- **ciProvider** — CI/CD provider detection from config files: GitHub Actions, GitLab CI, CircleCI, Travis CI, Buildkite, Jenkins, Azure Pipelines, Bitbucket Pipelines, AppVeyor, Drone CI, Google Cloud Build, TeamCity, Semaphore, Codemagic, Bitrise.
- **buildSystem** — language-agnostic build orchestration tools (Make, Just, Task, Bazel, Earthly, Mage, Dagger, etc.).
- **containerization** — container runtime and orchestration: Docker (Dockerfile), Podman (Containerfile), Docker Compose (docker-compose.yml / compose.yml), Dev Container (.devcontainer/).
- **runtime** — runtime versions from `.nvmrc` / `.python-version` / `.tool-versions` / `mise.toml` / `go.mod` / `Gemfile` / `package.json#engines` / `pyproject.toml` / `Cargo.toml`.

## Component classification

Components discovered in monorepos are classified with a primary kind from their directory path and optional secondary kinds from file-name signals.

| Path prefix | Primary kind |
|-------------|--------------|
| `apps/`, `app/` | `app` |
| `services/`, `service/` | `service` |
| `packages/`, `libs/`, `pkg/` | `package` |
| `infra/`, `terraform/`, `deploy/`, `pulumi/`, `cdk/` | `infra` |
| `scripts/`, `tools/`, `tooling/` | `script` |

Secondary kinds are inferred from files inside the component directory (see `src/aggregator/content-signals.ts` for the full signal list).

## `.scanignore`

Drop a `.scanignore` file at the repo root (or any subdirectory) to exclude paths from scanning. Uses gitignore syntax with additive nesting.

```scanignore
# Ignore benchmarks everywhere
**/bench/

# Ignore specific root directories
scripts/
tools/

# Negate (un-ignore)
!tools/critical-tool/
```

## Programmatic API

```ts
import { scanRepo } from "@codegeneai/repo-scanner";

const result = await scanRepo("/path/to/repo");

result.inventory.languages;           // string[]
result.inventory.frameworks;          // string[]
result.inventory.packageManagers;     // string[]
result.inventory.ciProviders;         // string[] — e.g. ["GitHub Actions", "CircleCI"]
result.inventory.buildSystems;        // string[]
result.inventory.containerization;     // string[]
result.inventory.runtimes;            // RuntimeInfo[] — { language, version, source }[]
result.architecture.monorepo;         // boolean
result.architecture.toolName;         // string | undefined — workspace tool, e.g. "Turborepo"
result.architecture.components;       // Component[]
result.languageStats;                 // LanguageStats
```

### Component-level inventory

Each `Component` in `architecture.components` carries optional `scoped` data with per-component frameworks and language stats:

```ts
const component = result.architecture.components[0];
component.scoped?.frameworks;      // readonly string[] | undefined
component.scoped?.languageStats;   // LanguageStats | undefined
```

`scoped` itself is present when at least one of the framework or language detectors ran for this scan. Each sub-field is individually present iff its detector ran — empty arrays mean "scanned, found nothing"; absent fields mean "didn't run." Top-level `inventory.frameworks` and `languageStats` continue to report the repo-wide aggregate (union across all components plus root-level files).

### Filtered scans

Passing `options.detectors` makes `scanRepo` return only the fields owned by the selected detectors. Other top-level keys are omitted entirely (not present-as-undefined), so `JSON.stringify` drops them and TypeScript narrows the return type to `PartialRepoScanResult`.

```ts
const partial = await scanRepo("/path/to/repo", { detectors: ["monorepo"] });
// partial.architecture   // Architecture
// partial.inventory      // undefined
// partial.languageStats  // undefined
```

Field ownership:

| Detector | Owns |
|---|---|
| `language` | `inventory.languages`, `languageStats` |
| `framework` | `inventory.frameworks` |
| `monorepo` | `architecture` |
| `packageManager` | `inventory.packageManagers` |
| `ciProvider` | `inventory.ciProviders` |
| `buildSystem` | `inventory.buildSystems` |
| `containerization` | `inventory.containerization` |
| `runtime` | `inventory.runtimes` |

### Exported types

```ts
import type {
  Architecture,
  Component,
  ComponentKind,
  ComponentScope,
  DetectorId,
  Inventory,
  LanguageStats,
  PartialInventory,
  PartialRepoScanResult,
  RepoScanResult,
  RuntimeInfo,
  ScanRepoOptions,
} from "@codegeneai/repo-scanner";
```

## CLI options

| Flag | Description | Default |
|------|-------------|---------|
| `-p`, `--path <dir>` | Directory to scan | cwd |
| `--json` | Output JSON instead of the default table. JSON output is colorized when stdout is a TTY. Pipe or redirect to disable, or set `NO_COLOR=1` / pass `--no-color`. | |
| `--no-color` | Disable ANSI colors in JSON output (also honors `NO_COLOR` env var) | colors when stdout is a TTY |
| `--detectors <list>` | Comma-separated detector IDs (`framework`, `language`, `monorepo`, `packageManager`, `ciProvider`, `buildSystem`, `containerization`, `runtime`). When provided, output only includes fields owned by the selected detectors. | all eight |
| `--version`, `-v` | Show version | |
| `--help`, `-h` | Show help | |

### Subcommands

| Command | Description |
|---------|-------------|
| `detectors` | List available detector IDs and descriptions |
| `detectors --json` | Emit the catalog as JSON |
| `completion <shell>` | Print a completion script (`bash`, `zsh`, `fish`) |
| `completion install <shell>` | Install the completion script |
| `completion uninstall <shell>` | Remove the installed completion script |

## License

MIT
