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
repo-scanner --path /path/to/repo --format json
repo-scanner --detectors language,framework      # subset
repo-scanner detectors                            # list available detectors
repo-scanner detectors --format json              # machine-readable catalog
repo-scanner completion zsh > _repo-scanner
repo-scanner completion install fish
repo-scanner --version
```

## What it detects

- **language** — files and lines of code per language across the supported language set (extension-based).
- **framework** — framework and library detection from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `composer.json`, `pubspec.yaml`, etc.).
- **monorepo** — workspace detection (Turborepo, Nx, Lerna, Rush, pnpm workspaces, Go workspaces, Bazel, Pants, Melos, .NET Solutions) plus component classification.

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
result.architecture.monorepo;         // boolean
result.architecture.components;       // Component[]
result.languageStats;                 // LanguageStats
```

### Exported types

```ts
import type {
  Architecture,
  Component,
  ComponentKind,
  DetectorId,
  Inventory,
  LanguageStats,
  RepoScanResult,
  ScanRepoOptions,
} from "@codegeneai/repo-scanner";
```

## CLI options

| Flag | Description | Default |
|------|-------------|---------|
| `-p`, `--path <dir>` | Directory to scan | cwd |
| `-f`, `--format <fmt>` | Output format: `table` or `json` | `table` |
| `--detectors <list>` | Comma-separated detector IDs (`language`, `framework`, `monorepo`) | all three |
| `--version`, `-v` | Show version | |
| `--help`, `-h` | Show help | |

### Subcommands

| Command | Description |
|---------|-------------|
| `detectors` | List available detector IDs and descriptions |
| `detectors --format json` | Emit the catalog as JSON |
| `completion <shell>` | Print a completion script (`bash`, `zsh`, `fish`) |
| `completion install <shell>` | Install the completion script |
| `completion uninstall <shell>` | Remove the installed completion script |

## License

MIT
