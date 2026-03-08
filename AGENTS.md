# repo-scanner

Universal repository structure scanner CLI tool.

## Purpose

Scans any repository to detect structure, languages, frameworks, CI providers, datastores, containerization, IaC, testing tools, linting, build systems, and repo tooling. Zero runtime dependencies.

## Structure

```
src/
  bin.ts              # CLI entry point
  cli.ts              # Argument parsing (--path, --format, --help)
  scanner.ts          # Orchestrator: build FileIndex → run detectors → aggregate
  types.ts            # Output schema (RepoScanResult, Component, etc.)
  index.ts            # Public API exports

  detectors/          # 12 independent detectors (one per concern area)
    types.ts          # Detector/Finding/DetectorResult interfaces
    registry.ts       # registerDetector / getDetectors
    init.ts           # Imports all detectors to register them
    language.ts       # Extension-based language detection
    framework.ts      # Framework detection from deps + config files
    monorepo.ts       # Monorepo detection + component discovery
    dependency-manager.ts  # Package manager detection from lockfiles
    ci.ts             # CI provider detection
    containerization.ts    # Docker, PaaS detection
    iac.ts            # Infrastructure-as-code detection
    testing.ts        # Test framework detection
    datastore.ts      # Database/cache detection from deps + docker-compose
    linting.ts        # Linter/formatter config detection
    build.ts          # Build system + command extraction
    repo-tools.ts     # Git hooks, changesets, AI config, etc.

  aggregator/
    aggregator.ts         # Merges DetectorResult[] → RepoScanResult
    component-classifier.ts  # Path-based component kind classification

  output/
    json.ts           # JSON output
    table.ts          # ANSI color table output

  utils/
    fs.ts             # File walking with dotdir support, readJson, readText
    concurrency.ts    # mapWithConcurrency helper
    file-index.ts     # FileIndex: single-walk in-memory file index
```

## Key patterns

- Detectors implement `Detector` interface from `detectors/types.ts`
- All detectors auto-register via side-effect imports in `detectors/init.ts`
- FileIndex is built once, all detectors query it in-memory (no repeated I/O)
- Detectors return flat `Finding[]` + optional `commands`, `componentHints`, `signals`
- Aggregator routes findings by detector ID, merges signals with OR semantics

## Testing

Unit tests are co-located as `*.unit.test.ts`. Run with `bun test`.
