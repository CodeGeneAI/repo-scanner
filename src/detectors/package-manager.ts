import type { FileIndex } from "../utils/file-index";
import { registerDetector } from "./registry";
import { createFindingAdder } from "./shared";
import type { DetectorResult } from "./types";

/** Lockfile name → display name. Presence alone is sufficient signal. */
const LOCKFILE_RULES: ReadonlyMap<string, string> = new Map([
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "Yarn"],
  ["bun.lock", "Bun"],
  ["bun.lockb", "Bun"],
  ["Pipfile.lock", "Pipenv"],
  ["poetry.lock", "Poetry"],
  ["uv.lock", "uv"],
  ["Cargo.lock", "Cargo"],
  ["go.sum", "Go modules"],
  ["Gemfile.lock", "Bundler"],
  ["composer.lock", "Composer"],
  ["packages.lock.json", "NuGet"],
  ["pubspec.lock", "pub"],
  ["gradle.lockfile", "Gradle"],
  ["mix.lock", "Mix"],
  ["stack.yaml.lock", "Stack"],
  ["cabal.project.freeze", "Cabal"],
  ["Package.resolved", "Swift Package Manager"],
]);

registerDetector({
  id: "packageManager",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();

    for (const [fileName, pmName] of LOCKFILE_RULES) {
      for (const file of index.getByNamePrimary(fileName)) {
        addFinding(pmName, 1.0, `lockfile: ${file.relativePath}`);
      }
    }

    return {
      detectorId: "packageManager",
      findings,
    };
  },
});
