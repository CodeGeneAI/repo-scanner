import type { RuntimeInfo } from "../types";
import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult } from "./types";

// ─── Version check definitions ──────────────────────────────────────

interface VersionCheck {
  readonly language: string;
  readonly source: string;
  readonly fileName?: string;
  readonly extension?: string;
  extract(content: string): string | undefined;
}

/** Extract version from a simple one-line file like .nvmrc or .node-version. */
const firstLine = (content: string): string | undefined => {
  const line = content.trim().split("\n")[0]?.trim();
  if (!line) return undefined;
  // Strip leading "v" prefix
  return line.replace(/^v/, "");
};

const VERSION_CHECKS: readonly VersionCheck[] = [
  // ── Node.js ─────────────────────────────────────────────
  {
    language: "Node.js",
    source: ".nvmrc",
    fileName: ".nvmrc",
    extract: firstLine,
  },
  {
    language: "Node.js",
    source: ".node-version",
    fileName: ".node-version",
    extract: firstLine,
  },

  // ── Python ──────────────────────────────────────────────
  {
    language: "Python",
    source: ".python-version",
    fileName: ".python-version",
    extract: firstLine,
  },
  {
    language: "Python",
    source: "pyproject.toml requires-python",
    fileName: "pyproject.toml",
    extract: (content) => {
      const m = /requires-python\s*=\s*"([^"]+)"/.exec(content);
      return m?.[1];
    },
  },

  // ── Go ──────────────────────────────────────────────────
  {
    language: "Go",
    source: "go.mod",
    fileName: "go.mod",
    extract: (content) => {
      const m = /^go\s+(\S+)/m.exec(content);
      return m?.[1];
    },
  },

  // ── Rust ────────────────────────────────────────────────
  {
    language: "Rust",
    source: "rust-toolchain.toml",
    fileName: "rust-toolchain.toml",
    extract: (content) => {
      const m = /channel\s*=\s*"([^"]+)"/.exec(content);
      return m?.[1];
    },
  },
  {
    language: "Rust",
    source: "Cargo.toml rust-version",
    fileName: "Cargo.toml",
    extract: (content) => {
      const m = /rust-version\s*=\s*"([^"]+)"/.exec(content);
      return m?.[1];
    },
  },

  // ── Ruby ────────────────────────────────────────────────
  {
    language: "Ruby",
    source: ".ruby-version",
    fileName: ".ruby-version",
    extract: firstLine,
  },
  {
    language: "Ruby",
    source: "Gemfile",
    fileName: "Gemfile",
    extract: (content) => {
      const m = /ruby\s+["']([^"']+)["']/.exec(content);
      return m?.[1];
    },
  },

  // ── Java ────────────────────────────────────────────────
  {
    language: "Java",
    source: "pom.xml",
    fileName: "pom.xml",
    extract: (content) => {
      const m = /<maven\.compiler\.source>([^<]+)</.exec(content);
      return m?.[1];
    },
  },
  {
    language: "Java",
    source: "build.gradle",
    fileName: "build.gradle",
    extract: (content) => {
      const m = /sourceCompatibility\s*=\s*['"]?([^'"\s]+)/.exec(content);
      return m?.[1];
    },
  },

  // ── Dart ────────────────────────────────────────────────
  {
    language: "Dart",
    source: ".dart-version",
    fileName: ".dart-version",
    extract: firstLine,
  },
  {
    language: "Dart",
    source: "pubspec.yaml sdk",
    fileName: "pubspec.yaml",
    extract: (content) => {
      const m = /sdk:\s*['"]?>=?\s*([0-9]+\.[0-9]+\.[0-9]+)/.exec(content);
      return m?.[1];
    },
  },

  // ── Elixir ─────────────────────────────────────────────
  {
    language: "Elixir",
    source: ".elixir-version",
    fileName: ".elixir-version",
    extract: firstLine,
  },
  {
    language: "Elixir",
    source: "mix.exs elixir",
    fileName: "mix.exs",
    extract: (content) => {
      const m = /elixir:\s*"~>\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)"/.exec(content);
      return m?.[1];
    },
  },

  // ── Swift ──────────────────────────────────────────────
  {
    language: "Swift",
    source: ".swift-version",
    fileName: ".swift-version",
    extract: firstLine,
  },

  // ── .NET ────────────────────────────────────────────────
  {
    language: ".NET",
    source: "global.json",
    fileName: "global.json",
    extract: (_content) => undefined, // Handled via readJson below
  },
];

// ─── JSON-based checks (need parsed JSON) ───────────────────────────

interface JsonVersionCheck {
  readonly language: string;
  readonly source: string;
  readonly fileName: string;
  extract(json: Record<string, unknown>): string | undefined;
}

const JSON_CHECKS: readonly JsonVersionCheck[] = [
  {
    language: "Node.js",
    source: "package.json engines.node",
    fileName: "package.json",
    extract: (json) => {
      const engines = json.engines as Record<string, string> | undefined;
      return engines?.node;
    },
  },
  {
    language: "PHP",
    source: "composer.json require.php",
    fileName: "composer.json",
    extract: (json) => {
      const req = json.require as Record<string, string> | undefined;
      return req?.php;
    },
  },
  {
    language: ".NET",
    source: "global.json sdk.version",
    fileName: "global.json",
    extract: (json) => {
      const sdk = json.sdk as Record<string, string> | undefined;
      return sdk?.version;
    },
  },
  {
    language: "Bun",
    source: "package.json engines.bun",
    fileName: "package.json",
    extract: (json) => {
      const engines = json.engines as Record<string, string> | undefined;
      return engines?.bun;
    },
  },
];

// ─── .tool-versions (asdf) ──────────────────────────────────────────

const TOOL_VERSIONS_MAP: Record<string, string> = {
  nodejs: "Node.js",
  python: "Python",
  golang: "Go",
  rust: "Rust",
  ruby: "Ruby",
  java: "Java",
  php: "PHP",
  dotnet: ".NET",
  dart: "Dart",
  elixir: "Elixir",
  swift: "Swift",
};

// ─── .csproj TargetFramework ────────────────────────────────────────

const extractCsprojVersion = (content: string): string | undefined => {
  const m = /<TargetFramework>([^<]+)</.exec(content);
  return m?.[1];
};

// ─── Detector ───────────────────────────────────────────────────────

registerDetector({
  id: "runtime",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const runtimes: RuntimeInfo[] = [];
    const seen = new Set<string>(); // Dedupe by "language:source"

    const addRuntime = (
      language: string,
      version: string,
      source: string,
      file: string,
    ) => {
      const key = `${language}:${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      runtimes.push({ language, version, source, file });
    };

    // Text-based checks
    for (const check of VERSION_CHECKS) {
      if (!check.fileName) continue;
      // Skip the global.json text check (handled in JSON checks)
      if (check.fileName === "global.json") continue;

      const files = index.getByNamePrimary(check.fileName);
      for (const f of files) {
        const content = await readText(f.path);
        if (!content) continue;
        const version = check.extract(content);
        if (version) {
          addRuntime(check.language, version, check.source, f.relativePath);
        }
      }
    }

    // JSON-based checks
    for (const check of JSON_CHECKS) {
      const files = index.getByNamePrimary(check.fileName);
      for (const f of files) {
        const json = await readJson<Record<string, unknown>>(f.path);
        if (!json) continue;
        const version = check.extract(json);
        if (version) {
          addRuntime(check.language, version, check.source, f.relativePath);
        }
      }
    }

    // .tool-versions (asdf)
    const toolVersionFiles = index.getByNamePrimary(".tool-versions");
    for (const f of toolVersionFiles) {
      const content = await readText(f.path);
      if (!content) continue;
      const regex = /^(\S+)\s+(\S+)/gm;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        const toolName = m[1]!;
        const version = m[2]!;
        const language = TOOL_VERSIONS_MAP[toolName];
        if (language) {
          addRuntime(language, version, ".tool-versions", f.relativePath);
        }
      }
    }

    // .csproj files (TargetFramework)
    const csprojFiles = index.getByExtensionPrimary(".csproj");
    for (const f of csprojFiles) {
      const content = await readText(f.path);
      if (!content) continue;
      const version = extractCsprojVersion(content);
      if (version) {
        addRuntime(".NET", version, "TargetFramework", f.relativePath);
        break; // One .csproj is enough
      }
    }

    return {
      detectorId: "runtime",
      findings: runtimes.map((r) => ({
        value: `${r.language} ${r.version}`,
        confidence: 1.0,
        evidence: [`${r.source} in ${r.file}`],
      })),
      metadata: { runtimeDetails: runtimes },
    };
  },
});
