# repo-scanner

Universal repository structure scanner. Detects languages, frameworks, monorepo structure, CI providers, datastores, and more from any codebase.

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
```

## Features

- Single filesystem walk → in-memory index → all detectors query without disk I/O
- 12 independent detectors: language, framework, monorepo, dependency-manager, CI, containerization, IaC, testing, datastore, linting, build, repo-tools
- Component discovery with path-based classification (app, service, package, infra, script)
- Confidence scores and evidence on all findings
- Zero runtime dependencies
- ~140ms for a 1800-package monorepo
- Built-in dependency intelligence subsystem exposed via API (`scanDependencies`) and CLI (`--deps`)


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


## CLI dependency scanning

Use `--deps` to enable dependency scanning. Optional flags:

- `--ecosystems <list>`
- `--deps-debug` (print dependency vulnerability-key diagnostics to stderr)
- `--no-usage`
- `--no-security`
- `--concurrency <n>`
- `--component-grouping <default|apps-only|services-only|workspace-package>`
- `--fail-on-vulns`
- `--fail-on-vulns-count <n>`
- `--severity-threshold <unknown|low|moderate|high|critical>`
- `--fail-on-outdated`
- `--fail-on-outdated-count <n>`
- `--outdated-threshold <patch|minor|major>`


Dependency JSON output includes summary lists (`topOutdated`, `topVulnerable`), component-level grouping (`byComponent`), and a machine-readable `policyEvaluation` block when dependency scanning is enabled.
