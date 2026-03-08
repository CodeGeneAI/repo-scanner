# repo-scanner

Universal repository structure scanner. Detects languages, frameworks, monorepo structure, CI providers, datastores, and more from any codebase.

## Usage

```bash
bun packages/repo-scanner/src/bin.ts --path /path/to/repo
bun packages/repo-scanner/src/bin.ts --path /path/to/repo --format json
```

## Features

- Single filesystem walk → in-memory index → all detectors query without disk I/O
- 12 independent detectors: language, framework, monorepo, dependency-manager, CI, containerization, IaC, testing, datastore, linting, build, repo-tools
- Component discovery with path-based classification (app, service, package, infra, script)
- Confidence scores and evidence on all findings
- Zero runtime dependencies
- ~140ms for a 1800-package monorepo
