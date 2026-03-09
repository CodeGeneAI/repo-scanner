import type { EnvValueType } from "../../types";
import type { ExtractorMatch } from "./types";

// ─── Type Inference ──────────────────────────────────────────────────

/** Infer type from a default value string. */
const inferFromDefault = (value: string): EnvValueType | undefined => {
  if (!value) return undefined;

  // Number: integer or decimal
  if (/^\d+$/.test(value) || /^\d+\.\d+$/.test(value)) return "number";

  // Boolean
  if (/^(true|false|yes|no|0|1)$/i.test(value)) return "boolean";

  // URL
  if (/^https?:\/\//.test(value)) return "url";

  // Path (starts with / or ./ or ../)
  if (/^(\/|\.\/|\.\.\/)/.test(value)) return "path";

  // JSON object or array
  if (/^\{.*\}$/.test(value) || /^\[.*\]$/.test(value)) return "json";

  return undefined;
};

/** Name-based patterns for type heuristic. */
const NAME_TYPE_PATTERNS: readonly [RegExp, EnvValueType][] = [
  // Number patterns
  [
    /(?:_PORT|_TIMEOUT|_INTERVAL|_LIMIT|_SIZE|_COUNT|_TTL|_MAX|_MIN|_RETRIES|_WORKERS|_THREADS|_MS|_SECONDS|_DELAY|_DEPTH|_CHARS|_TOKENS|_LENGTH|_BATCH|_CAPACITY|_CONCURRENCY|_ATTEMPTS|_THRESHOLD|_PERCENTAGE|_WEIGHT|_MARGIN|_BYTES)$/i,
    "number",
  ],

  // URL patterns
  [/(?:_URL|_URI|_ENDPOINT|_HREF|_WEBHOOK)$/i, "url"],

  // Boolean patterns
  [/^(?:DEBUG|VERBOSE|FORCE|SKIP|DISABLE|ENABLE)$/i, "boolean"],
  [
    /(?:_ENABLED|_DISABLED|_FLAG|_ACTIVE|_VERBOSE|_DEBUG|_DRY_RUN|_FORCE|_SKIP)$/i,
    "boolean",
  ],

  // Path patterns
  [/(?:_PATH|_DIR|_FILE|_ROOT|_HOME|_FOLDER|_DIRECTORY)$/i, "path"],
];

/** Infer type from variable name heuristics. */
const inferFromName = (name: string): EnvValueType | undefined => {
  for (const [pattern, type] of NAME_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return undefined;
};

/**
 * Infer the value type of an env var from its matches.
 * Priority: default value analysis > name heuristic > unknown.
 */
export const inferType = (
  varName: string,
  matches: readonly ExtractorMatch[],
): EnvValueType => {
  // Check defaults first — concrete evidence
  for (const match of matches) {
    if (match.defaultValue) {
      const fromDefault = inferFromDefault(match.defaultValue);
      if (fromDefault) return fromDefault;
    }
    if (match.inferredType && match.inferredType !== "unknown") {
      return match.inferredType;
    }
  }

  // Name heuristic
  return inferFromName(varName) ?? "unknown";
};

// ─── Required / Optional ─────────────────────────────────────────────

/** Patterns in the pattern string that indicate optional access. */
const OPTIONAL_PATTERNS = [
  "os.getenv", // Python getenv (returns None on missing) / Lua
  "os.environ.get",
  "os.Getenv", // Go Getenv (returns "" on missing, never panics)
  "os.LookupEnv", // Go LookupEnv returns (val, ok)
  "option_env!", // Rust compile-time optional
  "ENV.fetch", // Ruby with default
  "sys.env.getOrElse",
];

/**
 * Determine if an env var is required based on its access patterns.
 * Conservative: if any usage lacks a default, it's required.
 */
export const isRequired = (matches: readonly ExtractorMatch[]): boolean => {
  // If all usages are definitions (from config files), it's not "required" in code
  const codeUsages = matches.filter((m) => !m.isConfigFile);
  if (codeUsages.length === 0) return false;

  // Check if any code usage lacks a default value
  for (const match of codeUsages) {
    if (match.accessType === "definition" || match.accessType === "write")
      continue;

    // Has explicit default → this usage is optional
    if (match.defaultValue !== undefined) continue;

    // Check if the pattern implies optional access
    const isOptional = OPTIONAL_PATTERNS.some((p) => match.pattern.includes(p));
    if (isOptional) continue;

    // This usage has no default and no optional pattern → required
    return true;
  }

  return false;
};

// ─── Framework Prefix ────────────────────────────────────────────────

const FRAMEWORK_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "REACT_APP_",
  "GATSBY_",
  "NUXT_PUBLIC_",
  "EXPO_PUBLIC_",
  "TF_VAR_",
] as const;

/** Detect if a variable has a framework-specific prefix. */
export const detectFrameworkPrefix = (varName: string): string | undefined => {
  for (const prefix of FRAMEWORK_PREFIXES) {
    if (varName.startsWith(prefix)) return prefix.slice(0, -1); // Remove trailing _
  }
  return undefined;
};
