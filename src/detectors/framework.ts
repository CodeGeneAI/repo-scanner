import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import {
  createFindingAdder,
  type PackageJson,
  scanComposerJson,
  scanFilesForIndicators,
  scanGemfile,
  scanPythonDeps,
} from "./shared";
import type { DetectorResult } from "./types";

/** npm package → framework or notable library name. */
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
  ["@trpc/server", "tRPC"],
  ["@trpc/client", "tRPC"],
  ["@trpc/react-query", "tRPC"],
  ["@trpc/tanstack-react-query", "tRPC"],
  ["drizzle-orm", "Drizzle"],
  ["drizzle-kit", "Drizzle"],
  ["drizzle-zod", "Drizzle"],
  ["better-auth", "Better Auth"],
  ["@tanstack/react-query", "TanStack Query"],
  ["@tanstack/react-form", "TanStack Form"],
  ["@tanstack/react-router", "TanStack Router"],
  ["@tanstack/react-start", "TanStack Start"],
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
  ["werkzeug", "Werkzeug"],
  ["jinja2", "Jinja2"],
  ["markupsafe", "MarkupSafe"],
  ["blinker", "Blinker"],
  ["itsdangerous", "ItsDangerous"],
  ["click", "Click"],
  ["asgiref", "ASGI (asgiref)"],
  ["uvicorn", "Uvicorn"],
  ["gunicorn", "Gunicorn"],
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

/** Gradle/Maven dependency indicators → JVM framework name. */
const JVM_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["org.springframework.boot", "Spring Boot"],
  ["spring-boot-starter", "Spring Boot"],
  ["org.springframework", "Spring"],
  ["io.micronaut", "Micronaut"],
  ["io.quarkus", "Quarkus"],
  ["io.dropwizard", "Dropwizard"],
  ["io.vertx", "Vert.x"],
  ["io.ktor", "Ktor"],
  ["org.hibernate", "Hibernate"],
]);

/** PHP Composer package → framework name. */
const PHP_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["laravel/framework", "Laravel"],
  ["symfony/framework-bundle", "Symfony"],
  ["symfony/http-kernel", "Symfony"],
  ["slim/slim", "Slim"],
  ["cakephp/cakephp", "CakePHP"],
  ["yiisoft/yii2", "Yii"],
  ["codeigniter4/framework", "CodeIgniter"],
]);

/** Scala build.sbt dependency indicators → framework name. */
const SCALA_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["com.typesafe.play", "Play Framework"],
  ["com.typesafe.akka", "Akka"],
  ["org.http4s", "http4s"],
  ["dev.zio", "ZIO"],
]);

registerDetector({
  id: "framework",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const { findings, addFinding } = createFindingAdder();

    // 1. Check config files (highest confidence), skip secondary paths
    for (const [fileName, framework] of CONFIG_FRAMEWORK_MAP) {
      const files = index.getByNamePrimary(fileName);
      if (files.length > 0) {
        addFinding(framework, 1.0, `config file: ${fileName}`);
      }
    }

    // 2. Scan primary package.json files for npm dependencies
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg) continue;

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
    await scanPythonDeps(index, PYTHON_FRAMEWORK_MAP, addFinding, 0.9);

    // 4. Check go.mod for Go frameworks (primary only)
    await scanFilesForIndicators(
      index,
      ["go.mod"],
      GO_FRAMEWORK_MAP,
      addFinding,
      0.95,
      "Go dep",
      { excludeLinePrefixes: ["module "] },
    );

    // 5. Check Cargo.toml for Rust frameworks (primary only)
    await scanFilesForIndicators(
      index,
      ["Cargo.toml"],
      RUST_FRAMEWORK_MAP,
      addFinding,
      0.95,
      "Rust crate",
    );

    // 6. Check Gemfile for Ruby frameworks (primary only)
    await scanGemfile(index, RUBY_FRAMEWORK_MAP, addFinding, 1.0);

    // 7. Check mix.exs for Elixir frameworks (primary only)
    for (const mixFile of index.getByNamePrimary("mix.exs")) {
      const content = await readText(mixFile.path);
      if (!content) continue;

      for (const [dep, framework] of ELIXIR_FRAMEWORK_MAP) {
        if (content.includes(dep)) {
          addFinding(
            framework,
            0.95,
            `Elixir dep: ${dep} in ${mixFile.relativePath}`,
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

    // 9. Check build.gradle / build.gradle.kts / pom.xml for JVM frameworks
    await scanFilesForIndicators(
      index,
      ["build.gradle", "build.gradle.kts", "pom.xml"],
      JVM_FRAMEWORK_MAP,
      addFinding,
      0.95,
      "JVM dep",
    );

    // 10. Check composer.json for PHP frameworks
    await scanComposerJson(index, PHP_FRAMEWORK_MAP, addFinding, 0.95);

    // 11. Check build.sbt for Scala frameworks
    await scanFilesForIndicators(
      index,
      ["build.sbt"],
      SCALA_FRAMEWORK_MAP,
      addFinding,
      0.95,
      "SBT dep",
    );

    return {
      detectorId: "framework",
      findings,
    };
  },
});
