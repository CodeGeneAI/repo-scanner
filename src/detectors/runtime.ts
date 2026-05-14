import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

const SINGLE_VERSION_FILES: ReadonlyMap<string, string> = new Map([
  [".nvmrc", "Node"],
  [".node-version", "Node"],
  [".python-version", "Python"],
  [".ruby-version", "Ruby"],
  [".terraform-version", "Terraform"],
  [".crystal-version", "Crystal"],
]);

registerDetector({
  id: "runtime",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const findings: Finding[] = [];
    const seenKeys = new Set<string>();

    const emit = (info: {
      language: string;
      version: string;
      source: string;
      filePath: string;
    }) => {
      const v = info.version.trim();
      if (!v) return;
      const key = `${info.language}::${v}::${info.filePath}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      findings.push({
        value: JSON.stringify({
          language: info.language,
          version: v,
          source: info.source,
        }),
        confidence: 1.0,
        evidence: [info.source],
        filePath: info.filePath,
      });
    };

    // 1. Single-version files
    for (const [fileName, language] of SINGLE_VERSION_FILES) {
      for (const file of index.getByNamePrimary(fileName)) {
        const content = await readText(file.path);
        if (!content) continue;
        const version = content.split("\n")[0]?.trim();
        if (version) {
          emit({
            language,
            version,
            source: fileName,
            filePath: file.relativePath,
          });
        }
      }
    }

    // 2. go.mod `go` directive
    for (const file of index.getByNamePrimary("go.mod")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^go\s+([0-9.]+)/m);
      if (m?.[1]) {
        emit({
          language: "Go",
          version: m[1],
          source: "go.mod",
          filePath: file.relativePath,
        });
      }
    }

    // 3. Gemfile `ruby` directive
    for (const file of index.getByNamePrimary("Gemfile")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^\s*ruby\s+['"]([^'"]+)['"]/m);
      if (m?.[1]) {
        emit({
          language: "Ruby",
          version: m[1],
          source: "Gemfile#ruby",
          filePath: file.relativePath,
        });
      }
    }

    // 4. package.json engines
    const enginesMap: Record<string, string> = {
      node: "Node",
      npm: "npm",
      pnpm: "pnpm",
      yarn: "Yarn",
      bun: "Bun",
    };
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<{ engines?: Record<string, string> }>(
        pkgFile.path,
      );
      if (!pkg?.engines) continue;
      for (const [key, language] of Object.entries(enginesMap)) {
        const version = pkg.engines[key];
        if (version) {
          emit({
            language,
            version,
            source: `package.json#engines.${key}`,
            filePath: pkgFile.relativePath,
          });
        }
      }
    }

    // 5. pyproject.toml#[project] requires-python
    for (const file of index.getByNamePrimary("pyproject.toml")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^\s*requires-python\s*=\s*"([^"]+)"/m);
      if (m?.[1]) {
        emit({
          language: "Python",
          version: m[1],
          source: "pyproject.toml#requires-python",
          filePath: file.relativePath,
        });
      }
    }

    // 6. Cargo.toml#[package] rust-version
    for (const file of index.getByNamePrimary("Cargo.toml")) {
      const content = await readText(file.path);
      if (!content) continue;
      const m = content.match(/^\s*rust-version\s*=\s*"([^"]+)"/m);
      if (m?.[1]) {
        emit({
          language: "Rust",
          version: m[1],
          source: "Cargo.toml#rust-version",
          filePath: file.relativePath,
        });
      }
    }

    // 7. .tool-versions
    const TOOL_ALIASES: ReadonlyMap<string, string> = new Map([
      ["nodejs", "Node"],
      ["node", "Node"],
      ["python", "Python"],
      ["ruby", "Ruby"],
      ["rust", "Rust"],
      ["golang", "Go"],
      ["go", "Go"],
      ["terraform", "Terraform"],
      ["bun", "Bun"],
      ["deno", "Deno"],
      ["elixir", "Elixir"],
      ["erlang", "Erlang"],
      ["java", "Java"],
      ["kotlin", "Kotlin"],
      ["swift", "Swift"],
    ]);

    for (const file of index.getByNamePrimary(".tool-versions")) {
      const content = await readText(file.path);
      if (!content) continue;
      for (const rawLine of content.split("\n")) {
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        const tool = parts[0];
        const rest = parts.slice(1);
        if (!tool || rest.length === 0) continue;
        const language = TOOL_ALIASES.get(tool.toLowerCase()) ?? tool;
        emit({
          language,
          version: rest.join(" "),
          source: ".tool-versions",
          filePath: file.relativePath,
        });
      }
    }

    // 8. mise.toml / .mise.toml
    for (const fileName of ["mise.toml", ".mise.toml"]) {
      for (const file of index.getByNamePrimary(fileName)) {
        const content = await readText(file.path);
        if (!content) continue;
        // Find [tools] table — single occurrence assumed
        const idx = content.indexOf("[tools]");
        if (idx < 0) continue;
        // Read lines until next [section] or end
        const afterHeader = content.slice(idx + "[tools]".length);
        const nextSection = afterHeader.search(/^\[/m);
        const block =
          nextSection >= 0 ? afterHeader.slice(0, nextSection) : afterHeader;
        const lineRe = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/gm;
        let m: RegExpExecArray | null;
        while ((m = lineRe.exec(block)) !== null) {
          const toolName = m[1]!;
          const language =
            TOOL_ALIASES.get(toolName.toLowerCase()) ?? toolName;
          emit({
            language,
            version: m[2]!,
            source: `${fileName}#tools.${toolName}`,
            filePath: file.relativePath,
          });
        }
      }
    }

    return { detectorId: "runtime", findings };
  },
});
