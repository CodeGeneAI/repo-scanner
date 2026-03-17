import type { ComponentKind } from "../types";
import type { FileIndex } from "../utils/file-index";

/** Dev server / frontend app config file prefixes. */
const APP_CONFIG_PREFIXES = [
  "vite.config",
  "next.config",
  "nuxt.config",
  "webpack.config",
  "svelte.config",
  "remix.config",
  "astro.config",
];

/** Deployment config files that indicate a deployable app. */
const APP_DEPLOY_FILES = new Set([
  "vercel.json",
  "netlify.toml",
  "fly.toml",
  "render.yaml",
  "app.yaml",
  "angular.json",
]);

/** Files that indicate a service. */
const SERVICE_MARKER_FILES = new Set([
  "Dockerfile",
  "nest-cli.json",
  "nodemon.json",
]);

/** Entry-point file names typical of services. */
const SERVICE_ENTRY_FILES = new Set([
  "server.ts",
  "server.js",
  "app.ts",
  "app.js",
]);

/** Build tooling configs typical of publishable packages. */
const PACKAGE_CONFIG_PREFIXES = ["tsup.config", "rollup.config"];

/**
 * Detect secondary component kinds from file-based signals within a
 * component's directory. Uses only the in-memory FileIndex — no disk I/O.
 */
export const detectSecondaryKinds = (
  componentPath: string,
  primaryKind: ComponentKind,
  index: FileIndex,
): ComponentKind[] => {
  const files = index.getUnderPath(componentPath);
  if (files.length === 0) return [];

  const fileNames = new Set<string>();
  for (const f of files) {
    fileNames.add(f.name);
  }

  const kinds = new Set<ComponentKind>();

  // App signals
  if (
    fileNames.has("index.html") ||
    hasAny(fileNames, APP_DEPLOY_FILES) ||
    hasFileWithPrefix(fileNames, APP_CONFIG_PREFIXES)
  ) {
    kinds.add("app");
  }

  // Service signals
  if (
    hasAny(fileNames, SERVICE_MARKER_FILES) ||
    hasAny(fileNames, SERVICE_ENTRY_FILES)
  ) {
    kinds.add("service");
  }

  // Package signals
  if (hasFileWithPrefix(fileNames, PACKAGE_CONFIG_PREFIXES)) {
    kinds.add("package");
  }

  // Remove primary kind — secondary should only contain additional roles
  kinds.delete(primaryKind);

  return [...kinds].sort();
};

/** Check if any needle exists in the haystack. */
const hasAny = (haystack: Set<string>, needles: Set<string>): boolean => {
  for (const v of needles) {
    if (haystack.has(v)) return true;
  }
  return false;
};

/** Check if any file name starts with one of the given prefixes. */
const hasFileWithPrefix = (
  fileNames: Set<string>,
  prefixes: readonly string[],
): boolean => {
  for (const name of fileNames) {
    for (const prefix of prefixes) {
      if (name.startsWith(prefix)) return true;
    }
  }
  return false;
};
