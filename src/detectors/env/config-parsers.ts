import type { ExtractorMatch } from "./types";

// ─── Helpers ────────────────────────────────────────────────────────

/** Get leading whitespace length. */
const leadingIndent = (line: string): number =>
  line.length - line.trimStart().length;

/**
 * Env var names in config files must look like env vars (UPPER_SNAKE_CASE).
 * This filters out YAML structural keys like `if`, `uses`, `with`, `command`.
 */
const isEnvVarName = (name: string): boolean => /^[A-Z][A-Z0-9_]*$/.test(name);

// ─── .env file parser ────────────────────────────────────────────────

/** Parse a .env file into env var matches. */
export const parseDotenv = (
  content: string,
  _filePath: string,
): ExtractorMatch[] => {
  const matches: ExtractorMatch[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) continue;

    // Match KEY=value (key must start with letter or underscore)
    const m = /^([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;

    const varName = m[1];
    let value = m[2]?.trim() ?? "";

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (only for unquoted values)
    if (!m[2]?.trim().startsWith('"') && !m[2]?.trim().startsWith("'")) {
      const commentIdx = value.indexOf(" #");
      if (commentIdx > 0) value = value.slice(0, commentIdx).trim();
    }

    matches.push({
      varName,
      line: i + 1,
      pattern: `${varName}=${value || "..."}`,
      accessType: "definition",
      defaultValue: value || undefined,
      isConfigFile: true,
    });
  }

  return matches;
};

/** Check if a filename is a .env file (including .flaskenv). */
export const isDotenvFile = (fileName: string): boolean =>
  fileName === ".env" ||
  fileName.startsWith(".env.") ||
  fileName === ".flaskenv";

// ─── docker-compose.yml parser ───────────────────────────────────────

const COMPOSE_FILE_NAMES = new Set([
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
]);

/** Parse docker-compose environment sections. */
export const parseDockerCompose = (
  content: string,
  _filePath: string,
): ExtractorMatch[] => {
  const matches: ExtractorMatch[] = [];
  const lines = content.split("\n");
  let inEnvironment = false;
  let envIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines and comments (don't affect section tracking)
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = leadingIndent(line);

    // Detect environment: section
    if (/^\s*environment\s*:\s*$/.test(line)) {
      inEnvironment = true;
      envIndent = indent;
      continue;
    }

    // Exit environment section when indent returns to same or lower level
    if (inEnvironment && indent <= envIndent) {
      inEnvironment = false;
    }

    if (inEnvironment) {
      // List form: - KEY=value
      const listMatch = /^\s*-\s*["']?([A-Za-z_]\w*)=([^"']*)["']?\s*$/.exec(
        trimmed,
      );
      if (listMatch?.[1]) {
        matches.push({
          varName: listMatch[1],
          line: i + 1,
          pattern: `${listMatch[1]}=${listMatch[2] ?? ""}`,
          accessType: "definition",
          defaultValue: listMatch[2] || undefined,
          isConfigFile: true,
        });
        continue;
      }

      // List form without value: - KEY (require uppercase to avoid YAML keys)
      const listRefMatch = /^\s*-\s*["']?([A-Za-z_]\w*)["']?\s*$/.exec(trimmed);
      if (listRefMatch?.[1] && isEnvVarName(listRefMatch[1])) {
        matches.push({
          varName: listRefMatch[1],
          line: i + 1,
          pattern: listRefMatch[1],
          accessType: "read",
          isConfigFile: true,
        });
        continue;
      }

      // Map form: KEY: value (require uppercase to avoid YAML structural keys)
      const mapMatch = /^\s*([A-Za-z_]\w*)\s*:\s*(.+)?\s*$/.exec(trimmed);
      if (mapMatch?.[1] && isEnvVarName(mapMatch[1])) {
        matches.push({
          varName: mapMatch[1],
          line: i + 1,
          pattern: `${mapMatch[1]}: ${mapMatch[2] ?? ""}`,
          accessType: "definition",
          defaultValue: mapMatch[2]?.trim() || undefined,
          isConfigFile: true,
        });
        continue;
      }
    }

    // Variable interpolation in environment sections: ${FOO} or ${FOO:-default}
    if (inEnvironment) {
      const interpRegex = /\$\{([A-Za-z_]\w*)(?::-([^}]*))?\}/g;
      let interpMatch: RegExpExecArray | null;
      while ((interpMatch = interpRegex.exec(line)) !== null) {
        matches.push({
          varName: interpMatch[1]!,
          line: i + 1,
          pattern: `\${${interpMatch[1]}}`,
          accessType: "read",
          defaultValue: interpMatch[2],
          isConfigFile: true,
        });
      }
    }
  }

  return matches;
};

/** Check if a filename is a docker-compose file. */
export const isDockerComposeFile = (fileName: string): boolean =>
  COMPOSE_FILE_NAMES.has(fileName);

// ─── Kubernetes manifest parser ──────────────────────────────────────

const K8S_KIND_PATTERN =
  /^kind:\s*(Deployment|Pod|StatefulSet|CronJob|DaemonSet|Job|ReplicaSet)\s*$/m;

/** Parse Kubernetes manifest env sections. */
export const parseKubernetes = (
  content: string,
  _filePath: string,
): ExtractorMatch[] => {
  // Only parse files that look like k8s manifests
  if (!K8S_KIND_PATTERN.test(content)) return [];

  const matches: ExtractorMatch[] = [];
  const lines = content.split("\n");
  let inEnvSection = false;
  let envIndent = 0;
  let currentName: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Reset state on multi-document separator
    if (trimmed === "---") {
      inEnvSection = false;
      currentName = undefined;
      continue;
    }

    const indent = leadingIndent(line);

    // Detect env: section (but not envFrom:)
    if (/^\s+env\s*:\s*$/.test(line) && !trimmed.startsWith("envFrom")) {
      inEnvSection = true;
      envIndent = indent;
      currentName = undefined;
      continue;
    }

    // Exit env section when indent returns to same or lower level
    if (inEnvSection && indent <= envIndent) {
      inEnvSection = false;
      currentName = undefined;
    }

    if (inEnvSection) {
      // name: FOO
      const nameMatch = /^\s*-?\s*name:\s*["']?([A-Za-z_]\w*)["']?\s*$/.exec(
        line,
      );
      if (nameMatch?.[1]) {
        currentName = nameMatch[1];
        continue;
      }

      // value: "bar"
      if (currentName) {
        const valueMatch = /^\s*value:\s*["']?([^"'\n]*)["']?\s*$/.exec(line);
        if (valueMatch !== null) {
          matches.push({
            varName: currentName,
            line: i + 1,
            pattern: `${currentName}: ${valueMatch[1] ?? ""}`,
            accessType: "definition",
            defaultValue: valueMatch[1]?.trim() || undefined,
            isConfigFile: true,
          });
          currentName = undefined;
          continue;
        }

        // valueFrom: (secretKeyRef or configMapKeyRef)
        if (/^\s*valueFrom:/.test(line)) {
          matches.push({
            varName: currentName,
            line: i + 1,
            pattern: `${currentName} (from secret/configMap)`,
            accessType: "definition",
            isConfigFile: true,
          });
          currentName = undefined;
        }
      }
    }
  }

  return matches;
};

/** Check if content looks like a k8s manifest. */
export const isKubernetesManifest = (content: string): boolean =>
  K8S_KIND_PATTERN.test(content);

/** Check if a file path is a GitHub Actions workflow. */
export const isGitHubActionsWorkflow = (relativePath: string): boolean =>
  relativePath.startsWith(".github/workflows/") &&
  (relativePath.endsWith(".yml") || relativePath.endsWith(".yaml"));
