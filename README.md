# repo-scanner

Universal repository structure scanner. Detects languages, frameworks, monorepo structure, CI providers, datastores, and more from any codebase — any repo, any size, any language(s).

## Usage

```bash
bun packages/repo-scanner/src/bin.ts --path /path/to/repo
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --format json
# enable dependency intelligence
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps
# JSON + dependency scan controls
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --format json --deps --ecosystems npm,pypi --no-security
# CI-style failure when matching vulnerabilities are found
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps --fail-on-vulns --severity-threshold high
# quota-style failure gates
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --deps --fail-on-vulns-count 3 --fail-on-outdated-count 5
# adjust large-file LOC threshold
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --large-file-threshold 1000
```

## Features

- Single filesystem walk → in-memory index → all detectors query without disk I/O
- 20 independent detectors covering structure, code health, and dependency intelligence
- Component discovery with path-based classification (app, service, package, infra, script)
- Confidence scores and evidence on all findings
- Zero runtime dependencies
- ~140ms for a 1800-package monorepo
- Built-in dependency intelligence subsystem exposed via API (`scanDependencies`) and CLI (`--deps`)

## Detectors

| Detector | Description |
|----------|-------------|
| language | Language detection with LOC stats |
| framework | Framework & library detection |
| monorepo | Monorepo structure & component discovery |
| cross-package-deps | Internal dependency graph between packages |
| dependency-manager | Package manager detection |
| ci | CI/CD provider detection |
| containerization | Docker & PaaS detection |
| iac | Infrastructure-as-code detection |
| testing | Test framework detection |
| datastore | Database & cache detection |
| linting | Linter & formatter detection |
| build | Build system & command extraction |
| repo-tools | Git hooks, changesets, AI config |
| env | Environment variable extraction |
| naming-convention | Code naming pattern analysis |
| runtime | Runtime version detection |
| api-surface | API endpoint detection (REST, GraphQL, gRPC, WebSocket) |
| large-file | LOC-heavy source file detection |
| todo | TODO/FIXME/HACK/BUG/XXX annotation scanning |
| dead-export | Unused export detection (heuristic) |

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
| **monorepo** | ✅ | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ | — | — | — | — | ✅ | ✅ | ✅ | — |
| **containerization** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **iac** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| **repo-tools** | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

> **Note:** `ci`, `containerization`, `iac`, and `repo-tools` are language-agnostic detectors that work by file/config presence rather than language-specific patterns.

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
| Java/Kotlin | Spring (RequestMapping, GetMapping, etc.) |
| Ruby | Rails routes |
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

const result = await scanRepo("/path/to/repo", {
  dependencies: {
    enabled: true,
    skipSecurity: true,
  },
});
```

## CLI options

### General

- `--path <dir>` — Directory to scan (default: cwd)
- `--format <fmt>` — Output format: `table` | `json` (default: table)
- `--large-file-threshold <n>` — Line count threshold for large file detection (default: 500)
- `--help`, `-h` — Show help text

### Dependency scanning

Use `--deps` to enable. Optional flags:

- `--ecosystems <list>` — Comma-separated ecosystems to scan
- `--deps-debug` — Print dependency vulnerability-key diagnostics to stderr
- `--no-usage` — Skip dependency usage scanning
- `--no-security` — Skip vulnerability checks
- `--no-version-lookup` — Skip registry version lookups
- `--concurrency <n>` — Max parallel dependency scan operations
- `--component-grouping <default|apps-only|services-only|workspace-package>`
- `--fail-on-vulns` — Exit code 1 when vulnerabilities match threshold
- `--fail-on-vulns-count <n>` — Exit code 1 when vulnerability matches >= n
- `--severity-threshold <unknown|low|moderate|high|critical>` (default: low)
- `--fail-on-outdated` — Exit code 1 when updates match outdated threshold
- `--fail-on-outdated-count <n>` — Exit code 1 when outdated matches >= n
- `--outdated-threshold <patch|minor|major>` (default: patch)

Dependency JSON output includes summary lists (`topOutdated`, `topVulnerable`), component-level grouping (`byComponent`), and a machine-readable `policyEvaluation` block when dependency scanning is enabled.
