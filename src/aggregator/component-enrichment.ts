import { EXT_TO_LANGUAGE } from "../detectors/language-extensions";
import type { DetectorResult } from "../detectors/types";
import type {
  Component,
  ComponentMetadata,
  ComponentPlatform,
  ExternalService,
  RuntimeInfo,
} from "../types";
import { mapWithConcurrency } from "../utils/concurrency";
import type { FileIndex, IndexedFile } from "../utils/file-index";
import { countLines, readJson, readText } from "../utils/fs";

// ─── Helpers ──────────────────────────────────────────────────────────

const isUnderComponent = (filePath: string, componentPath: string): boolean => {
  if (componentPath === "" || componentPath === ".") return true;
  return filePath === componentPath || filePath.startsWith(componentPath + "/");
};

// ─── Framework Maps (per-component, mirrors framework detector) ──────

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
  ["gatsby", "Gatsby"],
  ["@docusaurus/core", "Docusaurus"],
  ["storybook", "Storybook"],
  ["@storybook/react", "Storybook"],
  ["tailwindcss", "Tailwind CSS"],
  ["elysia", "Elysia"],
  ["@capacitor/core", "Capacitor"],
  ["@ionic/core", "Ionic"],
]);

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
  ["gatsby-config.js", "Gatsby"],
  ["gatsby-config.ts", "Gatsby"],
  ["remix.config.js", "Remix"],
  ["remix.config.ts", "Remix"],
  ["manage.py", "Django"],
  ["tailwind.config.js", "Tailwind CSS"],
  ["tailwind.config.ts", "Tailwind CSS"],
]);

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

const GO_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["github.com/gin-gonic/gin", "Gin"],
  ["github.com/labstack/echo", "Echo"],
  ["github.com/gofiber/fiber", "Fiber"],
  ["github.com/gorilla/mux", "Gorilla Mux"],
  ["github.com/go-chi/chi", "Chi"],
  ["google.golang.org/grpc", "gRPC"],
]);

const RUST_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["actix-web", "Actix Web"],
  ["axum", "Axum"],
  ["rocket", "Rocket"],
  ["warp", "Warp"],
  ["tonic", "Tonic"],
]);

const RUBY_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["rails", "Ruby on Rails"],
  ["sinatra", "Sinatra"],
  ["hanami", "Hanami"],
]);

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

const PHP_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["laravel/framework", "Laravel"],
  ["symfony/framework-bundle", "Symfony"],
  ["symfony/http-kernel", "Symfony"],
  ["slim/slim", "Slim"],
  ["cakephp/cakephp", "CakePHP"],
  ["yiisoft/yii2", "Yii"],
  ["codeigniter4/framework", "CodeIgniter"],
]);

const ELIXIR_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  [":phoenix", "Phoenix"],
  [":phoenix_live_view", "Phoenix LiveView"],
  [":absinthe", "Absinthe"],
  [":nerves", "Nerves"],
]);

const DOTNET_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["Microsoft.AspNetCore", "ASP.NET Core"],
  ["Microsoft.NET.Sdk.Web", "ASP.NET Core"],
  ["Microsoft.AspNetCore.Components", "Blazor"],
  ["Microsoft.AspNetCore.SignalR", "SignalR"],
  ["Microsoft.Maui", "MAUI"],
]);

const SCALA_FRAMEWORK_MAP: ReadonlyMap<string, string> = new Map([
  ["com.typesafe.play", "Play Framework"],
  ["com.typesafe.akka", "Akka"],
  ["org.http4s", "http4s"],
  ["dev.zio", "ZIO"],
]);

// ─── Datastore Maps (per-component, mirrors datastore detector) ──────

const NPM_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["pg", "PostgreSQL"],
  ["postgres", "PostgreSQL"],
  ["ioredis", "Redis"],
  ["redis", "Redis"],
  ["mongoose", "MongoDB"],
  ["mongodb", "MongoDB"],
  ["sqlite3", "SQLite"],
  ["better-sqlite3", "SQLite"],
  ["@elastic/elasticsearch", "Elasticsearch"],
  ["mysql2", "MySQL"],
  ["mysql", "MySQL"],
  ["@prisma/client", "Prisma"],
  ["mssql", "SQL Server"],
  ["tedious", "SQL Server"],
  ["oracledb", "Oracle"],
  ["cassandra-driver", "Cassandra"],
  ["neo4j-driver", "Neo4j"],
  ["@aws-sdk/client-dynamodb", "DynamoDB"],
  ["@aws-sdk/lib-dynamodb", "DynamoDB"],
  ["firebase-admin", "Firebase"],
  ["@google-cloud/firestore", "Firestore"],
  ["influxdb-client", "InfluxDB"],
  ["@influxdata/influxdb-client", "InfluxDB"],
  ["kafkajs", "Kafka"],
  ["amqplib", "RabbitMQ"],
  ["nats", "NATS"],
  ["@aws-sdk/client-sqs", "AWS SQS"],
  ["@aws-sdk/client-s3", "AWS S3"],
  ["@google-cloud/storage", "GCS"],
  ["meilisearch", "Meilisearch"],
  ["knex", "Knex"],
  ["sequelize", "Sequelize"],
  ["typeorm", "TypeORM"],
  ["drizzle-orm", "Drizzle"],
]);

const PYTHON_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["psycopg2", "PostgreSQL"],
  ["psycopg", "PostgreSQL"],
  ["asyncpg", "PostgreSQL"],
  ["pymongo", "MongoDB"],
  ["redis", "Redis"],
  ["sqlalchemy", "SQLAlchemy"],
  ["django", "Django ORM"],
  ["tortoise-orm", "Tortoise ORM"],
  ["peewee", "Peewee"],
  ["mysql-connector-python", "MySQL"],
  ["mysqlclient", "MySQL"],
  ["pymysql", "MySQL"],
  ["boto3", "AWS (boto3)"],
  ["cassandra-driver", "Cassandra"],
  ["neo4j", "Neo4j"],
  ["influxdb-client", "InfluxDB"],
  ["celery", "Celery (broker)"],
]);

const GO_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["github.com/lib/pq", "PostgreSQL"],
  ["github.com/jackc/pgx", "PostgreSQL"],
  ["github.com/go-sql-driver/mysql", "MySQL"],
  ["github.com/go-redis/redis", "Redis"],
  ["github.com/redis/go-redis", "Redis"],
  ["go.mongodb.org/mongo-driver", "MongoDB"],
  ["gorm.io/gorm", "GORM"],
  ["github.com/jmoiron/sqlx", "sqlx"],
  ["github.com/aws/aws-sdk-go", "AWS SDK"],
  ["github.com/segmentio/kafka-go", "Kafka"],
  ["github.com/nats-io/nats.go", "NATS"],
  ["github.com/neo4j/neo4j-go-driver", "Neo4j"],
]);

const RUST_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["diesel", "Diesel"],
  ["sqlx", "SQLx"],
  ["sea-orm", "SeaORM"],
  ["tokio-postgres", "PostgreSQL"],
  ["redis", "Redis"],
  ["mongodb", "MongoDB"],
  ["rusoto_dynamodb", "DynamoDB"],
  ["aws-sdk-dynamodb", "DynamoDB"],
  ["rdkafka", "Kafka"],
]);

const RUBY_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["pg", "PostgreSQL"],
  ["mysql2", "MySQL"],
  ["redis", "Redis"],
  ["mongoid", "MongoDB"],
  ["sequel", "Sequel"],
  ["elasticsearch", "Elasticsearch"],
  ["aws-sdk-dynamodb", "DynamoDB"],
  ["sidekiq", "Sidekiq (Redis)"],
]);

const JVM_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["spring-boot-starter-data-jpa", "Spring Data JPA"],
  ["spring-boot-starter-data-mongodb", "MongoDB"],
  ["spring-boot-starter-data-redis", "Redis"],
  ["spring-boot-starter-data-elasticsearch", "Elasticsearch"],
  ["spring-boot-starter-data-cassandra", "Cassandra"],
  ["spring-kafka", "Kafka"],
  ["spring-boot-starter-amqp", "RabbitMQ"],
  ["org.hibernate", "Hibernate"],
  ["postgresql", "PostgreSQL"],
  ["mysql-connector", "MySQL"],
  ["org.mongodb", "MongoDB"],
  ["jedis", "Redis"],
  ["lettuce-core", "Redis"],
]);

const PHP_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["doctrine/orm", "Doctrine ORM"],
  ["doctrine/dbal", "Doctrine DBAL"],
  ["illuminate/database", "Eloquent ORM"],
  ["predis/predis", "Redis"],
  ["mongodb/mongodb", "MongoDB"],
  ["elasticsearch/elasticsearch", "Elasticsearch"],
]);

const ELIXIR_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  [":ecto", "Ecto"],
  [":ecto_sql", "Ecto"],
  [":postgrex", "PostgreSQL"],
  [":myxql", "MySQL"],
  [":redix", "Redis"],
  [":mongodb_driver", "MongoDB"],
  [":ex_aws", "AWS"],
  [":kafka_ex", "Kafka"],
  [":broadway_kafka", "Kafka"],
]);

const SCALA_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["doobie", "Doobie"],
  ["slick", "Slick"],
  ["quill", "Quill"],
  ["skunk", "Skunk"],
  ["redis4cats", "Redis"],
  ["reactivemongo", "MongoDB"],
]);

const DART_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["sqflite", "SQLite"],
  ["hive", "Hive"],
  ["drift", "Drift"],
  ["cloud_firestore", "Firestore"],
  ["firebase_database", "Firebase Realtime DB"],
  ["mongo_dart", "MongoDB"],
]);

const SWIFT_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["fluent", "Fluent ORM"],
  ["fluent-postgres-driver", "PostgreSQL"],
  ["fluent-mysql-driver", "MySQL"],
  ["fluent-sqlite-driver", "SQLite"],
  ["fluent-mongo-driver", "MongoDB"],
  ["redis", "Redis"],
  ["RediStack", "Redis"],
]);

const DOTNET_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["Microsoft.EntityFrameworkCore", "Entity Framework"],
]);

// ─── Observability Maps ──────────────────────────────────────────────

const NPM_OBSERVABILITY_MAP: ReadonlyMap<string, string> = new Map([
  ["dd-trace", "Datadog"],
  ["newrelic", "New Relic"],
  ["prom-client", "Prometheus"],
  ["winston", "Winston"],
  ["pino", "Pino"],
  ["bunyan", "Bunyan"],
  ["@sentry/node", "Sentry"],
  ["@sentry/browser", "Sentry"],
  ["@sentry/react", "Sentry"],
  ["@sentry/nextjs", "Sentry"],
]);

const NPM_OBSERVABILITY_PREFIXES: readonly {
  prefix: string;
  name: string;
}[] = [
  { prefix: "@opentelemetry/", name: "OpenTelemetry" },
  { prefix: "@sentry/", name: "Sentry" },
  { prefix: "@grafana/", name: "Grafana" },
];

const PYTHON_OBSERVABILITY_MAP: ReadonlyMap<string, string> = new Map([
  ["sentry-sdk", "Sentry"],
  ["prometheus-client", "Prometheus"],
  ["opentelemetry-api", "OpenTelemetry"],
  ["structlog", "structlog"],
]);

const GO_OBSERVABILITY_MAP: ReadonlyMap<string, string> = new Map([
  ["go.opentelemetry.io/otel", "OpenTelemetry"],
  ["github.com/getsentry/sentry-go", "Sentry"],
  ["github.com/prometheus/client_golang", "Prometheus"],
  ["go.uber.org/zap", "Zap"],
  ["github.com/sirupsen/logrus", "Logrus"],
]);

// ─── Deploy Target Detection ─────────────────────────────────────────

const DEPLOY_CONFIG_FILES: ReadonlyMap<string, string> = new Map([
  ["railway.toml", "Railway"],
  ["railway.json", "Railway"],
  ["vercel.json", "Vercel"],
  ["netlify.toml", "Netlify"],
  ["fly.toml", "Fly.io"],
  ["app.yaml", "Google Cloud"],
  ["app.yml", "Google Cloud"],
  ["Procfile", "Heroku"],
  ["render.yaml", "Render"],
  ["render.yml", "Render"],
  ["serverless.yml", "Serverless"],
  ["serverless.yaml", "Serverless"],
  ["serverless.ts", "Serverless"],
  ["amplify.yml", "AWS Amplify"],
]);

// ─── Platform / CLI Detection ────────────────────────────────────────

const WEB_CONFIG_FILES = new Set([
  "vite.config.js",
  "vite.config.ts",
  "vite.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "nuxt.config.ts",
  "nuxt.config.js",
  "webpack.config.js",
  "webpack.config.ts",
  "svelte.config.js",
  "svelte.config.ts",
  "astro.config.mjs",
  "astro.config.ts",
  "angular.json",
]);

const WEB_FRAMEWORKS = new Set([
  "React",
  "Vue",
  "Angular",
  "Svelte",
  "SvelteKit",
  "Next.js",
  "Nuxt",
  "Astro",
  "Remix",
  "Gatsby",
  "SolidJS",
  "Blazor",
]);

const MOBILE_FRAMEWORKS = new Set([
  "React Native",
  "Expo",
  "Flutter",
  "MAUI",
  "Capacitor",
  "Ionic",
]);

const DESKTOP_FRAMEWORKS = new Set(["Electron", "Tauri"]);

const API_FRAMEWORKS = new Set([
  "NestJS",
  "Express",
  "Fastify",
  "Hono",
  "Koa",
  "Elysia",
  "Django",
  "Flask",
  "FastAPI",
  "Starlette",
  "Gin",
  "Echo",
  "Fiber",
  "Chi",
  "Actix Web",
  "Axum",
  "Rocket",
  "Warp",
  "Spring Boot",
  "Micronaut",
  "Quarkus",
  "Ktor",
  "Ruby on Rails",
  "Sinatra",
  "Phoenix",
  "Laravel",
  "Symfony",
  "Slim",
  "ASP.NET Core",
]);

const WORKER_DEPS = new Set([
  "bullmq",
  "@nestjs/bullmq",
  "celery",
  "sidekiq",
  "resque",
]);

const CLI_NPM_DEPS = new Set([
  "commander",
  "yargs",
  "oclif",
  "meow",
  "cac",
  "citty",
  "clipanion",
]);

// ─── Entry Point Candidates ──────────────────────────────────────────

const ENTRY_POINT_CANDIDATES: readonly string[] = [
  // Node / TypeScript
  "src/main.ts",
  "src/main.tsx",
  "src/main.js",
  "src/main.jsx",
  "src/index.ts",
  "src/index.tsx",
  "src/index.js",
  "src/index.jsx",
  "src/app.ts",
  "src/app.tsx",
  "src/app.js",
  "src/app.jsx",
  "src/server.ts",
  "src/server.js",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.jsx",
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  // Go
  "main.go",
  "cmd/main.go",
  // Python
  "manage.py",
  "__main__.py",
  "src/__main__.py",
  "app.py",
  "main.py",
  // Rust
  "src/main.rs",
  "src/lib.rs",
  // .NET
  "Program.cs",
  "Startup.cs",
  // Ruby
  "config.ru",
  "app.rb",
  // PHP
  "public/index.php",
  "index.php",
  // Elixir
  "lib/application.ex",
];

// ─── Test / Migration Patterns ───────────────────────────────────────

const TEST_FILE_PATTERNS = [
  ".test.",
  ".spec.",
  "_test.",
  "_spec.",
  ".tests.",
  ".e2e.",
];

const MIGRATION_DIR_NAMES = [
  "/migrations/",
  "/migrate/",
  "/db/migrations/",
  "/db/migrate/",
  "/alembic/",
  "/prisma/migrations/",
];

// ─── Manifest types ──────────────────────────────────────────────────

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  main?: string;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// ─── Pre-read manifest cache ─────────────────────────────────────────

/** Pre-read all manifests under a component once, to avoid redundant I/O. */
interface ManifestCache {
  readonly pkg?: PackageJson;
  readonly textFiles: ReadonlyMap<string, string>; // fileName → content
}

const buildManifestCache = async (
  files: readonly IndexedFile[],
): Promise<ManifestCache> => {
  let pkg: PackageJson | undefined;
  const textFiles = new Map<string, string>();

  const manifestNames = new Set([
    "go.mod",
    "Cargo.toml",
    "pyproject.toml",
    "requirements.txt",
    "Gemfile",
    "build.gradle",
    "build.gradle.kts",
    "pom.xml",
    "composer.json",
    "mix.exs",
    "build.sbt",
    "pubspec.yaml",
    "Package.swift",
  ]);

  // Read package.json first
  const pkgFile = files.find((f) => f.name === "package.json");
  if (pkgFile) {
    pkg = (await readJson<PackageJson>(pkgFile.path)) ?? undefined;
  }

  // Read all other manifests
  for (const f of files) {
    if (
      manifestNames.has(f.name) ||
      f.ext === ".csproj" ||
      f.ext === ".fsproj"
    ) {
      const content = await readText(f.path);
      if (content) textFiles.set(f.relativePath, content);
    }
  }

  return { pkg, textFiles };
};

// ─── Extracted detector data ─────────────────────────────────────────

interface ExtractedData {
  readonly externalServices: readonly ExternalService[];
  readonly runtimes: readonly RuntimeInfo[];
}

const extractDetectorData = (
  results: readonly DetectorResult[],
): ExtractedData => {
  let externalServices: readonly ExternalService[] = [];
  let runtimes: readonly RuntimeInfo[] = [];

  for (const result of results) {
    if (
      result.detectorId === "external-services" &&
      Array.isArray(result.metadata?.externalServices)
    ) {
      externalServices = result.metadata.externalServices as ExternalService[];
    }
    if (
      result.detectorId === "runtime" &&
      Array.isArray(result.metadata?.runtimeDetails)
    ) {
      runtimes = result.metadata.runtimeDetails as RuntimeInfo[];
    }
  }

  return { externalServices, runtimes };
};

// ─── Per-component enrichment functions ──────────────────────────────

const scanTextForMap = (
  content: string,
  map: ReadonlyMap<string, string>,
  target: Set<string>,
): void => {
  for (const [dep, value] of map) {
    if (content.includes(dep)) target.add(value);
  }
};

const detectFrameworks = (
  files: readonly IndexedFile[],
  componentPath: string,
  cache: ManifestCache,
): string[] => {
  const frameworks = new Set<string>();

  // Config files under this component
  for (const [fileName, framework] of CONFIG_FRAMEWORK_MAP) {
    if (
      files.some(
        (f) =>
          f.name === fileName &&
          isUnderComponent(f.relativePath, componentPath),
      )
    ) {
      frameworks.add(framework);
    }
  }

  // package.json deps (only production deps for frameworks)
  if (cache.pkg) {
    for (const depName of Object.keys(cache.pkg.dependencies ?? {})) {
      const fw = NPM_FRAMEWORK_MAP.get(depName);
      if (fw) frameworks.add(fw);
    }
  }

  // Scan text-based manifests
  for (const [relPath, content] of cache.textFiles) {
    const name = relPath.split("/").pop() ?? "";
    if (name === "go.mod")
      scanTextForMap(content, GO_FRAMEWORK_MAP, frameworks);
    else if (name === "Cargo.toml")
      scanTextForMap(content, RUST_FRAMEWORK_MAP, frameworks);
    else if (name === "pyproject.toml" || name === "requirements.txt")
      scanTextForMap(content, PYTHON_FRAMEWORK_MAP, frameworks);
    else if (name === "Gemfile") {
      for (const [dep, fw] of RUBY_FRAMEWORK_MAP) {
        if (content.includes(`"${dep}"`) || content.includes(`'${dep}'`))
          frameworks.add(fw);
      }
    } else if (
      name === "build.gradle" ||
      name === "build.gradle.kts" ||
      name === "pom.xml"
    )
      scanTextForMap(content, JVM_FRAMEWORK_MAP, frameworks);
    else if (name === "composer.json")
      scanTextForMap(content, PHP_FRAMEWORK_MAP, frameworks);
    else if (name === "mix.exs")
      scanTextForMap(content, ELIXIR_FRAMEWORK_MAP, frameworks);
    else if (name === "build.sbt")
      scanTextForMap(content, SCALA_FRAMEWORK_MAP, frameworks);
    else if (name.endsWith(".csproj") || name.endsWith(".fsproj"))
      scanTextForMap(content, DOTNET_FRAMEWORK_MAP, frameworks);
  }

  return [...frameworks].sort();
};

const detectDatastores = (
  files: readonly IndexedFile[],
  cache: ManifestCache,
): string[] => {
  const datastores = new Set<string>();

  // package.json (both deps and devDeps for datastores)
  if (cache.pkg) {
    const allDeps = {
      ...cache.pkg.dependencies,
      ...cache.pkg.devDependencies,
    };
    for (const depName of Object.keys(allDeps)) {
      const ds = NPM_DATASTORE_MAP.get(depName);
      if (ds) datastores.add(ds);
    }
  }

  // Scan text-based manifests
  for (const [relPath, content] of cache.textFiles) {
    const name = relPath.split("/").pop() ?? "";
    if (name === "go.mod")
      scanTextForMap(content, GO_DATASTORE_MAP, datastores);
    else if (name === "Cargo.toml")
      scanTextForMap(content, RUST_DATASTORE_MAP, datastores);
    else if (name === "pyproject.toml" || name === "requirements.txt")
      scanTextForMap(content, PYTHON_DATASTORE_MAP, datastores);
    else if (name === "Gemfile") {
      for (const [dep, ds] of RUBY_DATASTORE_MAP) {
        if (content.includes(`"${dep}"`) || content.includes(`'${dep}'`))
          datastores.add(ds);
      }
    } else if (
      name === "build.gradle" ||
      name === "build.gradle.kts" ||
      name === "pom.xml"
    )
      scanTextForMap(content, JVM_DATASTORE_MAP, datastores);
    else if (name === "composer.json")
      scanTextForMap(content, PHP_DATASTORE_MAP, datastores);
    else if (name === "mix.exs")
      scanTextForMap(content, ELIXIR_DATASTORE_MAP, datastores);
    else if (name === "build.sbt")
      scanTextForMap(content, SCALA_DATASTORE_MAP, datastores);
    else if (name === "pubspec.yaml")
      scanTextForMap(content, DART_DATASTORE_MAP, datastores);
    else if (name === "Package.swift")
      scanTextForMap(content, SWIFT_DATASTORE_MAP, datastores);
    else if (name.endsWith(".csproj"))
      scanTextForMap(content, DOTNET_DATASTORE_MAP, datastores);
  }

  // ORM configs under component
  if (files.some((f) => f.name === "schema.prisma")) datastores.add("Prisma");
  if (files.some((f) => f.name.startsWith("drizzle.config.")))
    datastores.add("Drizzle");
  if (files.some((f) => f.name.startsWith("ormconfig.")))
    datastores.add("TypeORM");

  return [...datastores].sort();
};

const detectObservability = (cache: ManifestCache): string[] => {
  const tools = new Set<string>();

  // package.json (both deps and devDeps)
  if (cache.pkg) {
    const allDeps = {
      ...cache.pkg.dependencies,
      ...cache.pkg.devDependencies,
    };
    for (const depName of Object.keys(allDeps)) {
      const obs = NPM_OBSERVABILITY_MAP.get(depName);
      if (obs) {
        tools.add(obs);
        continue;
      }
      for (const { prefix, name } of NPM_OBSERVABILITY_PREFIXES) {
        if (depName.startsWith(prefix)) {
          tools.add(name);
          break;
        }
      }
    }
  }

  // Scan text-based manifests
  for (const [relPath, content] of cache.textFiles) {
    const name = relPath.split("/").pop() ?? "";
    if (name === "go.mod") scanTextForMap(content, GO_OBSERVABILITY_MAP, tools);
    else if (name === "pyproject.toml" || name === "requirements.txt")
      scanTextForMap(content, PYTHON_OBSERVABILITY_MAP, tools);
  }

  return [...tools].sort();
};

const detectDeployTarget = (
  files: readonly IndexedFile[],
): string | undefined => {
  for (const f of files) {
    const target = DEPLOY_CONFIG_FILES.get(f.name);
    if (target) return target;
  }
  // k8s manifests under component
  if (
    files.some(
      (f) =>
        f.relativePath.includes("/k8s/") ||
        f.relativePath.includes("/kubernetes/") ||
        f.relativePath.includes("/helm/"),
    )
  ) {
    return "Kubernetes";
  }
  return undefined;
};

const detectPlatform = (
  component: Component,
  files: readonly IndexedFile[],
  frameworks: readonly string[],
  npmDeps: ReadonlySet<string>,
): ComponentPlatform | undefined => {
  const fileNames = new Set(files.map((f) => f.name));
  const hasApiFramework = frameworks.some((f) => API_FRAMEWORKS.has(f));

  // Mobile
  if (frameworks.some((f) => MOBILE_FRAMEWORKS.has(f))) return "mobile";

  // Desktop
  if (frameworks.some((f) => DESKTOP_FRAMEWORKS.has(f))) return "desktop";

  // Worker: name-based hint (e.g., "*-worker") takes priority over service kind
  const nameHasWorker =
    component.name.endsWith("-worker") ||
    component.name.includes("-worker-") ||
    component.path.endsWith("-worker");
  const hasWorkerDep = [...WORKER_DEPS].some((d) => npmDeps.has(d));
  if (nameHasWorker && hasWorkerDep) return "worker";

  // Services are api (even if they have React for email templates, etc.)
  if (component.kind === "service") return "api";

  // Web: has web config or web framework, but not a library/service
  const hasWebConfig = [...WEB_CONFIG_FILES].some((c) => fileNames.has(c));
  const hasWebFramework = frameworks.some((f) => WEB_FRAMEWORKS.has(f));
  if (
    (hasWebConfig || hasWebFramework) &&
    component.kind !== "package" &&
    component.kind !== "library"
  ) {
    return "web";
  }

  // CLI: explicit CLI deps or cmd/ dir
  const cmdPrefix = component.path ? component.path + "/cmd/" : "cmd/";
  const hasCmdDir = files.some((f) => f.relativePath.startsWith(cmdPrefix));
  const hasCliDep = [...CLI_NPM_DEPS].some((d) => npmDeps.has(d));
  if (hasCmdDir || hasCliDep) return "cli";

  // Worker: has worker deps but no API framework, and not a script/test/package/library kind
  if (
    hasWorkerDep &&
    !hasApiFramework &&
    component.kind !== "script" &&
    component.kind !== "package" &&
    component.kind !== "library"
  ) {
    return "worker";
  }

  // API: has API framework + Dockerfile
  if (hasApiFramework && fileNames.has("Dockerfile")) return "api";

  // Library
  if (component.kind === "package" || component.kind === "library")
    return "library";

  return undefined;
};

const detectEntryPoint = (
  componentPath: string,
  files: readonly IndexedFile[],
  manifestMain?: string,
): string | undefined => {
  // Manifest-declared entry point takes priority
  if (manifestMain) {
    const expected = componentPath
      ? componentPath + "/" + manifestMain
      : manifestMain;
    if (files.some((f) => f.relativePath === expected)) return manifestMain;
  }

  // Conventional entry point files
  for (const candidate of ENTRY_POINT_CANDIDATES) {
    const fullPath = componentPath
      ? componentPath + "/" + candidate
      : candidate;
    if (files.some((f) => f.relativePath === fullPath)) return candidate;
  }

  // Go: look for main.go in cmd/ subdirs
  const cmdPrefix = componentPath ? componentPath + "/cmd/" : "cmd/";
  const cmdMainFiles = files.filter(
    (f) => f.relativePath.startsWith(cmdPrefix) && f.name === "main.go",
  );
  if (cmdMainFiles.length === 1) {
    return cmdMainFiles[0]!.relativePath.substring(
      componentPath ? componentPath.length + 1 : 0,
    );
  }

  return undefined;
};

const detectPorts = async (
  files: readonly IndexedFile[],
): Promise<number[]> => {
  const ports = new Set<number>();

  const addPort = (n: number) => {
    if (n > 0 && n < 65536) ports.add(n);
  };

  // Dockerfile EXPOSE
  for (const f of files.filter(
    (f) => f.name === "Dockerfile" || f.name === "dockerfile",
  )) {
    const content = await readText(f.path);
    if (!content) continue;
    for (const m of content.matchAll(/^EXPOSE\s+(\d+)/gm)) {
      addPort(Number.parseInt(m[1]!, 10));
    }
  }

  // .env / .env.example for PORT=
  for (const f of files.filter(
    (f) =>
      f.name === ".env" ||
      f.name === ".env.example" ||
      f.name === ".env.local" ||
      f.name === ".env.development",
  )) {
    const content = await readText(f.path);
    if (!content) continue;
    const match = /^PORT\s*=\s*(\d+)/m.exec(content);
    if (match) addPort(Number.parseInt(match[1]!, 10));
  }

  // Source files: .listen(PORT) patterns (cap at 30 files)
  const sourceExts = new Set([
    ".ts",
    ".js",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".rb",
  ]);
  const sourceFiles = files.filter((f) => sourceExts.has(f.ext)).slice(0, 30);
  for (const f of sourceFiles) {
    const content = await readText(f.path);
    if (!content) continue;
    for (const m of content.matchAll(/\.listen\s*\(\s*(\d{2,5})\s*[,)]/g)) {
      const port = Number.parseInt(m[1]!, 10);
      if (port >= 80) addPort(port);
    }
    // Spring server.port
    const springMatch = /server\.port\s*=\s*(\d+)/.exec(content);
    if (springMatch) addPort(Number.parseInt(springMatch[1]!, 10));
  }

  return [...ports].sort((a, b) => a - b);
};

const detectRuntime = (
  componentPath: string,
  files: readonly IndexedFile[],
  runtimes: readonly RuntimeInfo[],
  cache: ManifestCache,
): { name: string; version?: string } | undefined => {
  // Check for runtime version files under this component
  for (const rt of runtimes) {
    if (isUnderComponent(rt.file, componentPath)) {
      return { name: rt.language, version: rt.version };
    }
  }

  // Infer from manifest type
  const fileNames = new Set(files.map((f) => f.name));
  if (cache.pkg) return { name: "Node.js" };
  if (fileNames.has("go.mod")) return { name: "Go" };
  if (fileNames.has("Cargo.toml")) return { name: "Rust" };
  if (fileNames.has("pyproject.toml") || fileNames.has("requirements.txt"))
    return { name: "Python" };
  if (fileNames.has("Gemfile")) return { name: "Ruby" };
  if (fileNames.has("pom.xml") || fileNames.has("build.gradle"))
    return { name: "Java" };
  if (fileNames.has("build.gradle.kts")) return { name: "Kotlin" };
  if (fileNames.has("composer.json")) return { name: "PHP" };
  if (fileNames.has("mix.exs")) return { name: "Elixir" };
  if (fileNames.has("pubspec.yaml")) return { name: "Dart" };
  if (files.some((f) => f.ext === ".csproj" || f.ext === ".fsproj"))
    return { name: ".NET" };
  if (fileNames.has("Package.swift")) return { name: "Swift" };
  if (fileNames.has("build.sbt")) return { name: "Scala" };

  // Fall back to root-level runtimes
  if (runtimes.length > 0) {
    return { name: runtimes[0]!.language, version: runtimes[0]!.version };
  }

  return undefined;
};

const filterExternalServices = (
  componentPath: string,
  externalServices: readonly ExternalService[],
): { name: string; category: string }[] => {
  const result: { name: string; category: string }[] = [];
  for (const svc of externalServices) {
    const matches = svc.evidence.some((e) => {
      const inMatch = / in (.+)$/.exec(e);
      if (!inMatch) return false;
      const filePath = inMatch[1]!;
      // Use the full file path for matching, not just the directory
      return isUnderComponent(filePath, componentPath);
    });
    if (matches) {
      result.push({ name: svc.name, category: svc.category });
    }
  }
  return result.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
};

const countComponentLines = async (
  files: readonly IndexedFile[],
): Promise<number> => {
  const sourceFiles = files.filter((f) => EXT_TO_LANGUAGE.has(f.ext));
  if (sourceFiles.length === 0) return 0;

  const results = await mapWithConcurrency(sourceFiles, 32, (f) =>
    countLines(f.path),
  );
  return results.reduce((sum, n) => sum + n, 0);
};

const readManifestMetadata = (
  cache: ManifestCache,
): {
  version?: string;
  isPrivate?: boolean;
  manifestMain?: string;
  npmDeps: Set<string>;
} => {
  const npmDeps = new Set<string>();
  let version: string | undefined;
  let isPrivate: boolean | undefined;
  let manifestMain: string | undefined;

  // package.json
  if (cache.pkg) {
    version = cache.pkg.version;
    isPrivate = cache.pkg.private === true ? true : undefined;
    manifestMain = cache.pkg.main ?? undefined;
    if (cache.pkg.bin) {
      npmDeps.add("__has_bin__");
    }
    for (const dep of Object.keys(cache.pkg.dependencies ?? {})) {
      npmDeps.add(dep);
    }
    for (const dep of Object.keys(cache.pkg.devDependencies ?? {})) {
      npmDeps.add(dep);
    }
  }

  // Cargo.toml version — only match in [package] section (before first [dependencies])
  if (!version) {
    for (const [, content] of cache.textFiles) {
      if (!content.includes("[package]")) continue;
      const pkgSection = content.split(/\n\[(?!package\])/)[0] ?? "";
      const match = /^version\s*=\s*"([^"]+)"/m.exec(pkgSection);
      if (match) {
        version = match[1];
        break;
      }
    }
  }

  // pyproject.toml version — match in [project] or [tool.poetry] section
  if (!version) {
    for (const [relPath, content] of cache.textFiles) {
      const name = relPath.split("/").pop() ?? "";
      if (name !== "pyproject.toml") continue;
      // Extract version from [project] or [tool.poetry] section, not from deps
      const projectSection =
        content.match(/\[project\]\s*\n([\s\S]*?)(?=\n\[|$)/)?.[1] ??
        content.match(/\[tool\.poetry\]\s*\n([\s\S]*?)(?=\n\[|$)/)?.[1];
      const match = projectSection
        ? /^version\s*=\s*"([^"]+)"/m.exec(projectSection)
        : null;
      if (match) {
        version = match[1];
        break;
      }
    }
  }

  // pom.xml version — skip <parent> block, match top-level <version>
  if (!version) {
    for (const [relPath, content] of cache.textFiles) {
      const name = relPath.split("/").pop() ?? "";
      if (name !== "pom.xml") continue;
      // Remove <parent>...</parent> block to avoid matching parent version
      const withoutParent = content.replace(/<parent>[\s\S]*?<\/parent>/, "");
      const match = /<version>([^<]+)<\/version>/.exec(withoutParent);
      if (match) {
        version = match[1];
        break;
      }
    }
  }

  return { version, isPrivate, manifestMain, npmDeps };
};

const detectBooleanFlags = (
  files: readonly IndexedFile[],
): Pick<
  ComponentMetadata,
  "hasReadme" | "hasDockerfile" | "hasTests" | "hasMigrations"
> => {
  const hasReadme = files.some(
    (f) =>
      f.name.toLowerCase() === "readme.md" || f.name.toLowerCase() === "readme",
  );
  const hasDockerfile = files.some(
    (f) => f.name === "Dockerfile" || f.name === "dockerfile",
  );
  const hasTests = files.some((f) =>
    TEST_FILE_PATTERNS.some((p) => f.name.includes(p)),
  );
  const hasMigrations = files.some((f) =>
    MIGRATION_DIR_NAMES.some((d) => f.relativePath.includes(d)),
  );

  return { hasReadme, hasDockerfile, hasTests, hasMigrations };
};

// ─── Orchestrator ────────────────────────────────────────────────────

const enrichSingleComponent = async (
  component: Component,
  files: readonly IndexedFile[],
  data: ExtractedData,
): Promise<ComponentMetadata | undefined> => {
  if (files.length === 0) return undefined;

  // Build manifest cache once — all detection functions share it
  const cache = await buildManifestCache(files);

  // Read manifest metadata (version, private, main, npmDeps)
  const { version, isPrivate, manifestMain, npmDeps } =
    readManifestMetadata(cache);

  // Run all detections using cached data (no redundant I/O)
  const frameworks = detectFrameworks(files, component.path, cache);
  const datastores = detectDatastores(files, cache);
  const observability = detectObservability(cache);
  const deployTarget = detectDeployTarget(files);
  const platform = detectPlatform(component, files, frameworks, npmDeps);
  const entryPoint = detectEntryPoint(component.path, files, manifestMain);
  const [ports, lineCount] = await Promise.all([
    detectPorts(files),
    countComponentLines(files),
  ]);
  const runtime = detectRuntime(component.path, files, data.runtimes, cache);
  const externalServices = filterExternalServices(
    component.path,
    data.externalServices,
  );
  const booleanFlags = detectBooleanFlags(files);

  const metadata: ComponentMetadata = {
    ...(frameworks.length > 0 ? { frameworks } : {}),
    ...(platform ? { platform } : {}),
    ...(entryPoint ? { entryPoint } : {}),
    ...(ports.length > 0 ? { ports } : {}),
    ...(runtime ? { runtime } : {}),
    ...(datastores.length > 0 ? { datastores } : {}),
    ...(externalServices.length > 0 ? { externalServices } : {}),
    ...(lineCount > 0 ? { lineCount } : {}),
    ...(version ? { version } : {}),
    ...(isPrivate ? { private: true } : {}),
    ...booleanFlags,
    ...(observability.length > 0 ? { observability } : {}),
    ...(deployTarget ? { deployTarget } : {}),
  };

  // Only return metadata if it has meaningful content beyond boolean flags
  const hasContent =
    frameworks.length > 0 ||
    platform !== undefined ||
    entryPoint !== undefined ||
    ports.length > 0 ||
    runtime !== undefined ||
    datastores.length > 0 ||
    externalServices.length > 0 ||
    lineCount > 0 ||
    version !== undefined ||
    isPrivate ||
    observability.length > 0 ||
    deployTarget !== undefined ||
    booleanFlags.hasReadme ||
    booleanFlags.hasDockerfile ||
    booleanFlags.hasTests ||
    booleanFlags.hasMigrations;

  return hasContent ? metadata : undefined;
};

/** Enrich components with per-component metadata from detector results + file index. */
export const enrichComponents = async (
  components: readonly Component[],
  index: FileIndex,
  results: readonly DetectorResult[],
): Promise<Component[]> => {
  const data = extractDetectorData(results);

  const enriched: Component[] = [];
  for (const component of components) {
    // Handle root-level components (path="" or ".") by using all files
    const files =
      component.path === "" || component.path === "."
        ? index.all()
        : index.getUnderPath(component.path);
    const metadata = await enrichSingleComponent(component, files, data);
    enriched.push(metadata ? { ...component, metadata } : component);
  }
  return enriched;
};
