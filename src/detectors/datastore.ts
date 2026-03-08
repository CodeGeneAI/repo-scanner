import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** npm package name to datastore name. */
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
]);

/** Docker image substrings to datastore name. */
const COMPOSE_IMAGE_MAP: ReadonlyMap<string, string> = new Map([
  ["postgres", "PostgreSQL"],
  ["redis", "Redis"],
  ["mongo", "MongoDB"],
  ["mysql", "MySQL"],
  ["mariadb", "MariaDB"],
  ["kafka", "Kafka"],
  ["rabbitmq", "RabbitMQ"],
  ["elasticsearch", "Elasticsearch"],
  ["memcached", "Memcached"],
  ["minio", "MinIO"],
  ["clickhouse", "ClickHouse"],
]);

/** .NET ORM/data indicators in .csproj files. */
const DOTNET_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["Microsoft.EntityFrameworkCore", "Entity Framework"],
]);

/** ORM config file patterns. */
const ORM_CONFIG_CHECKS: readonly {
  detect: (index: FileIndex) => boolean;
  name: string;
  evidence: string;
}[] = [
  {
    detect: (idx) =>
      idx
        .getByName("schema.prisma")
        .some((f) => f.relativePath.startsWith("prisma/")),
    name: "Prisma",
    evidence: "prisma/schema.prisma",
  },
  {
    detect: (idx) =>
      idx.all().some((f) => f.name.startsWith("drizzle.config.")),
    name: "Drizzle",
    evidence: "drizzle.config.*",
  },
  {
    detect: (idx) => idx.all().some((f) => f.name.startsWith("ormconfig.")),
    name: "TypeORM",
    evidence: "ormconfig.*",
  },
];

const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const;

registerDetector({
  id: "datastore",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    const addFinding = (name: string, confidence: number, evidence: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      findings.push({ value: name, confidence, evidence: [evidence] });
    };

    // Scan primary package.json files for datastore dependencies
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg) continue;

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const depName of Object.keys(allDeps)) {
        const datastore = NPM_DATASTORE_MAP.get(depName);
        if (datastore) {
          addFinding(
            datastore,
            0.95,
            `npm dependency: ${depName} in ${pkgFile.relativePath}`,
          );
        }
      }
    }

    // Scan docker-compose files for image references
    for (const composeFileName of COMPOSE_FILES) {
      const composeFiles = index.getByNamePrimary(composeFileName);
      if (composeFiles.length === 0) continue;
      for (const composeFile of composeFiles) {
        const content = await readText(composeFile.path);
        if (!content) continue;

        for (const [imageSubstring, datastore] of COMPOSE_IMAGE_MAP) {
          // Match image: lines containing the substring
          const imageRegex = new RegExp(`image:\\s*.*${imageSubstring}`, "i");
          if (imageRegex.test(content)) {
            addFinding(
              datastore,
              1.0,
              `docker-compose image: ${imageSubstring} in ${composeFile.relativePath}`,
            );
          }
        }
      }
    }

    // Check .csproj files for .NET data frameworks
    for (const csprojFile of index.getByExtensionPrimary(".csproj")) {
      const content = await readText(csprojFile.path);
      if (!content) continue;

      for (const [indicator, datastore] of DOTNET_DATASTORE_MAP) {
        if (content.includes(indicator)) {
          addFinding(
            datastore,
            0.95,
            `.NET reference: ${indicator} in ${csprojFile.relativePath}`,
          );
        }
      }
    }

    // Check ORM config files
    for (const check of ORM_CONFIG_CHECKS) {
      if (check.detect(index)) {
        addFinding(check.name, 1.0, `config file: ${check.evidence}`);
      }
    }

    return { detectorId: "datastore", findings };
  },
});
