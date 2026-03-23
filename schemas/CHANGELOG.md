# repo-scanner schema changelog

Tracks versioned JSON schema contracts published by `repo-scanner`.

## v1 — detectors catalog schema

- **Schema ID:** `https://assets.codegene.dev/binaries/repo-scanner/schemas/detectors-v1.schema.json`
- **Command output:** `repo-scanner detectors --format json --schema`
- **Payload fields:**
  - `$schema` (const schema endpoint)
  - `version` (const `1`)
  - `detectors` (array of `{ id, description }`)
  - `presets` (preset alias map to detector-id arrays)

### Compatibility notes

- New detector IDs may be added over time.
- Existing detector IDs and preset names are stable within major schema versions.
- Breaking payload-shape changes must ship as a new schema version (`v2`, `v3`, ...).
