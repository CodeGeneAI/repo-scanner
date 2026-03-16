import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** npm package → framework name. Only actual frameworks/platforms, not libraries. */
const NPM_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["react", "React"],
  ["react-dom", "React"],
  ["next", "Next.js"],
  ["@remix-run/react", "Remix"],
  ["vue", "Vue"],
  ["nuxt", "Nuxt"],
  ["@angular/core", "Angular"],
  ["svelte", "Svelte"],
  ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"],
  ["solid-js", "SolidJS"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
  ["@hono/node-server", "Hono"],
  ["koa", "Koa"],
  ["electron", "Electron"],
  ["react-native", "React Native"],
  ["expo", "Expo"],
  ["@tauri-apps/api", "Tauri"],
  ["tailwindcss", "Tailwind CSS"],
  ["gatsby", "Gatsby"],
  ["@docusaurus/core", "Docusaurus"],
  ["storybook", "Storybook"],
  ["@storybook/react", "Storybook"],
  ["elysia", "Elysia"],
]);

/** Config file → framework name (build tools excluded — those go in build detector). */
const CONFIG_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["next.config.js", "Next.js"],
  ["next.config.mjs", "Next.js"],
  ["next.config.ts", "Next.js"],
  ["nuxt.config.ts", "Nuxt"],
  ["nuxt.config.js", "Nuxt"],
  ["angular.json", "Angular"],
  ["svelte.config.js", "Svelte"],
  ["svelte.config.ts", "Svelte"],
  ["astro.config.mjs", "Astro"],
  ["astro.config.ts", "Astro"],
  ["tailwind.config.js", "Tailwind CSS"],
  ["tailwind.config.ts", "Tailwind CSS"],
  ["gatsby-config.js", "Gatsby"],
  ["gatsby-config.ts", "Gatsby"],
  ["remix.config.js", "Remix"],
  ["remix.config.ts", "Remix"],
  ["manage.py", "Django"],
]);

/** Python package → framework name. */
const PYTHON_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
  ["starlette", "Starlette"],
  ["tornado", "Tornado"],
  ["celery", "Celery"],
  ["sqlalchemy", "SQLAlchemy"],
  ["pydantic", "Pydantic"],
  ["numpy", "NumPy"],
  ["pandas", "pandas"],
  ["tensorflow", "TensorFlow"],
  ["torch", "PyTorch"],
  ["scikit-learn", "scikit-learn"],
]);

/** Go module → framework name. */
const GO_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["github.com/gin-gonic/gin", "Gin"],
  ["github.com/gofiber/fiber", "Fiber"],
  ["github.com/labstack/echo", "Echo"],
  ["github.com/gorilla/mux", "Gorilla Mux"],
  ["github.com/go-chi/chi", "Chi"],
  ["google.golang.org/grpc", "gRPC"],
]);

/** Rust crate → framework name. */
const RUST_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["actix-web", "Actix Web"],
  ["axum", "Axum"],
  ["rocket", "Rocket"],
  ["warp", "Warp"],
  ["tonic", "Tonic"],
]);

/** Ruby gem → framework name. */
const RUBY_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["rails", "Ruby on Rails"],
  ["sinatra", "Sinatra"],
  ["hanami", "Hanami"],
]);

/** Elixir package → framework name. */
const ELIXIR_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  [":phoenix", "Phoenix"],
  [":phoenix_live_view", "Phoenix LiveView"],
  [":absinthe", "Absinthe"],
  [":nerves", "Nerves"],
]);

/** .NET framework indicators in .csproj files. */
const DOTNET_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["Microsoft.AspNetCore", "ASP.NET Core"],
  ["Microsoft.NET.Sdk.Web", "ASP.NET Core"],
  ["Microsoft.AspNetCore.Components", "Blazor"],
  ["Microsoft.AspNetCore.SignalR", "SignalR"],
  ["Microsoft.Maui", "MAUI"],
]);

/** npm deps that indicate typed contracts. */
const TYPED_CONTRACT_NPM_DEPS = new Set([
  "@trpc/server",
  "@trpc/client",
  "graphql",
  "@apollo/server",
  "@apollo/client",
  "@graphql-codegen/cli",
  "protobufjs",
  "google-protobuf",
  "@grpc/grpc-js",
  "@connectrpc/connect",
]);

/** Check if typed contracts signals are present. */
const detectTypedContracts = (
  index: FileIndex,
  allNpmDeps: Set<string>,
): boolean => {
  // GraphQL files (primary paths only)
  if (
    index.getByExtensionPrimary(".graphql").length > 0 ||
    index.getByExtensionPrimary(".gql").length > 0
  ) {
    return true;
  }

  // Protobuf files (primary paths only)
  if (index.getByExtensionPrimary(".proto").length > 0) {
    return true;
  }

  // OpenAPI / Swagger spec files
  if (
    index.hasFilePrimary("openapi.yaml") ||
    index.hasFilePrimary("openapi.yml") ||
    index.hasFilePrimary("openapi.json") ||
    index.hasFilePrimary("swagger.yaml") ||
    index.hasFilePrimary("swagger.yml") ||
    index.hasFilePrimary("swagger.json")
  ) {
    return true;
  }

  // Typed contract npm deps
  for (const dep of TYPED_CONTRACT_NPM_DEPS) {
    if (allNpmDeps.has(dep)) {
      return true;
    }
  }

  return false;
};

registerDetector({
  id: "framework",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];
    const allNpmDeps = new Set<string>();

    const addFinding = (name: string, confidence: number, evidence: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      findings.push({ value: name, confidence, evidence: [evidence] });
    };

    // 1. Check config files (highest confidence), skip secondary paths
    for (const [fileName, framework] of CONFIG_FRAMEWORK_MAP) {
      const files = index.getByNamePrimary(fileName);
      if (files.length > 0) {
        addFinding(framework, 1.0, `config file: ${fileName}`);
      }
    }

    // 2. Scan primary package.json files for npm dependencies
    // Only detect frameworks from production dependencies, not devDependencies
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg) continue;

      // Track all deps for typed contracts detection
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      for (const depName of Object.keys(allDeps)) {
        allNpmDeps.add(depName);
      }

      // Only use production dependencies for framework detection
      for (const depName of Object.keys(pkg.dependencies ?? {})) {
        const framework = NPM_FRAMEWORK_MAP.get(depName);
        if (framework) {
          addFinding(
            framework,
            0.95,
            `npm dependency: ${depName} in ${pkgFile.relativePath}`,
          );
        }
      }
    }

    // 3. Scan Python dependency files (primary only)
    // Use word-boundary matching to avoid substring false positives
    for (const file of [
      ...index.getByNamePrimary("pyproject.toml"),
      ...index.getByNamePrimary("requirements.txt"),
    ]) {
      const content = await readText(file.path);
      if (!content) continue;

      for (const [pkg, framework] of PYTHON_FRAMEWORK_MAP) {
        // Match as a whole word (surrounded by non-alphanumeric or line boundaries)
        const regex = new RegExp(
          `(?:^|[^a-zA-Z0-9_-])${pkg}(?:[^a-zA-Z0-9_-]|$)`,
          "m",
        );
        if (regex.test(content)) {
          addFinding(
            framework,
            0.9,
            `Python dependency: ${pkg} in ${file.relativePath}`,
          );
        }
      }
    }

    // 4. Check go.mod for Go frameworks (primary only)
    for (const goMod of index.getByNamePrimary("go.mod")) {
      const content = await readText(goMod.path);
      if (!content) continue;

      for (const [pkg, framework] of GO_FRAMEWORK_MAP) {
        if (content.includes(pkg)) {
          addFinding(framework, 0.95, `Go dependency: ${pkg}`);
        }
      }
    }

    // 5. Check Cargo.toml for Rust frameworks (primary only)
    for (const cargoFile of index.getByNamePrimary("Cargo.toml")) {
      const content = await readText(cargoFile.path);
      if (!content) continue;

      for (const [crate, framework] of RUST_FRAMEWORK_MAP) {
        if (content.includes(crate)) {
          addFinding(
            framework,
            0.95,
            `Rust crate: ${crate} in ${cargoFile.relativePath}`,
          );
        }
      }
    }

    // 6. Check Gemfile for Ruby frameworks (primary only)
    for (const gemfile of index.getByNamePrimary("Gemfile")) {
      const content = await readText(gemfile.path);
      if (!content) continue;

      for (const [gem, framework] of RUBY_FRAMEWORK_MAP) {
        if (content.includes(`'${gem}'`) || content.includes(`"${gem}"`)) {
          addFinding(framework, 1.0, `Gemfile contains ${gem}`);
        }
      }
    }

    // 7. Check mix.exs for Elixir frameworks (primary only)
    for (const mixFile of index.getByNamePrimary("mix.exs")) {
      const content = await readText(mixFile.path);
      if (!content) continue;

      for (const [dep, framework] of ELIXIR_FRAMEWORK_MAP) {
        if (content.includes(dep)) {
          addFinding(
            framework,
            0.95,
            `Elixir dependency: ${dep} in ${mixFile.relativePath}`,
          );
        }
      }
    }

    // 8. Check .csproj files for .NET frameworks (primary only)
    for (const csprojFile of index.getByExtensionPrimary(".csproj")) {
      const content = await readText(csprojFile.path);
      if (!content) continue;

      for (const [indicator, framework] of DOTNET_FRAMEWORK_MAP) {
        if (content.includes(indicator)) {
          addFinding(
            framework,
            0.95,
            `.NET reference: ${indicator} in ${csprojFile.relativePath}`,
          );
        }
      }
    }

    // Detect typed contracts signal
    const hasTypedContracts = detectTypedContracts(index, allNpmDeps);

    return {
      detectorId: "framework",
      findings,
      signals: hasTypedContracts ? { hasTypedContracts: true } : undefined,
    };
  },
});
