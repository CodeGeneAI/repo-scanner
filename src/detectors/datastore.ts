import type { FileIndex } from "../utils/file-index";
import { isSecondaryPath } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import {
  createFindingAdder,
  escapeRegex,
  type PackageJson,
  scanComposerJson,
  scanFilesForIndicators,
  scanGemfile,
  scanPythonDeps,
} from "./shared";
import type { DetectorResult } from "./types";

/** npm package name → datastore name. */
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

/** Docker image substrings → datastore name. */
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
  ["cassandra", "Cassandra"],
  ["neo4j", "Neo4j"],
  ["influxdb", "InfluxDB"],
  ["nats", "NATS"],
  ["dynamodb-local", "DynamoDB"],
  ["meilisearch", "Meilisearch"],
]);

/** Python package → datastore name. */
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

/** Go module → datastore name. */
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

/** Rust crate → datastore name. */
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

/** Ruby gem → datastore name. */
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

/** Java/Kotlin Gradle/Maven indicators → datastore name. */
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

/** PHP Composer package → datastore name. */
const PHP_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["doctrine/orm", "Doctrine ORM"],
  ["doctrine/dbal", "Doctrine DBAL"],
  ["illuminate/database", "Eloquent ORM"],
  ["predis/predis", "Redis"],
  ["mongodb/mongodb", "MongoDB"],
  ["elasticsearch/elasticsearch", "Elasticsearch"],
]);

/** Elixir Mix dependency → datastore name. */
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

/** Scala build.sbt dependency → datastore name. */
const SCALA_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["doobie", "Doobie"],
  ["slick", "Slick"],
  ["quill", "Quill"],
  ["skunk", "Skunk"],
  ["redis4cats", "Redis"],
  ["reactivemongo", "MongoDB"],
]);

/** Dart pubspec.yaml dependency → datastore name. */
const DART_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["sqflite", "SQLite"],
  ["hive", "Hive"],
  ["drift", "Drift"],
  ["cloud_firestore", "Firestore"],
  ["firebase_database", "Firebase Realtime DB"],
  ["mongo_dart", "MongoDB"],
]);

/** Swift Package.swift dependency → datastore name. */
const SWIFT_DATASTORE_MAP: ReadonlyMap<string, string> = new Map([
  ["fluent", "Fluent ORM"],
  ["fluent-postgres-driver", "PostgreSQL"],
  ["fluent-mysql-driver", "MySQL"],
  ["fluent-sqlite-driver", "SQLite"],
  ["fluent-mongo-driver", "MongoDB"],
  ["redis", "Redis"],
  ["RediStack", "Redis"],
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
        .getByNamePrimary("schema.prisma")
        .some((f) => f.relativePath.startsWith("prisma/")),
    name: "Prisma",
    evidence: "prisma/schema.prisma",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) &&
            f.name.startsWith("drizzle.config."),
        ),
    name: "Drizzle",
    evidence: "drizzle.config.*",
  },
  {
    detect: (idx) =>
      idx
        .all()
        .some(
          (f) =>
            !isSecondaryPath(f.relativePath) && f.name.startsWith("ormconfig."),
        ),
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
    const { findings, addFinding } = createFindingAdder();
    let supabaseEvidence: string | undefined;

    // Scan primary package.json files for datastore dependencies
    for (const pkgFile of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(pkgFile.path);
      if (!pkg) continue;

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const depName of Object.keys(allDeps)) {
        if (!supabaseEvidence && depName.startsWith("@supabase/")) {
          supabaseEvidence = `npm dependency: ${depName} in ${pkgFile.relativePath}`;
        }
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

    if (!supabaseEvidence) {
      for (const file of index.getByNamePrimary("config.toml")) {
        const pathValue = file.relativePath;
        if (
          pathValue === "supabase/config.toml" ||
          pathValue.includes("/supabase/config.toml")
        ) {
          supabaseEvidence = `supabase config: ${pathValue}`;
          break;
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
          const imageRegex = new RegExp(
            `image:\\s*.*${escapeRegex(imageSubstring)}`,
            "i",
          );
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

    // Check .csproj files for .NET data frameworks (primary only)
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

    // Scan Python dependency files for datastore packages
    await scanPythonDeps(index, PYTHON_DATASTORE_MAP, addFinding, 0.9);

    // Check go.mod for Go datastore dependencies
    await scanFilesForIndicators(
      index,
      ["go.mod"],
      GO_DATASTORE_MAP,
      addFinding,
      0.95,
      "Go dep",
    );

    // Check Cargo.toml for Rust datastore crates
    await scanFilesForIndicators(
      index,
      ["Cargo.toml"],
      RUST_DATASTORE_MAP,
      addFinding,
      0.95,
      "Rust crate",
    );

    // Check Gemfile for Ruby datastore gems
    await scanGemfile(index, RUBY_DATASTORE_MAP, addFinding, 0.95);

    // Check build.gradle / build.gradle.kts / pom.xml for JVM datastore deps
    await scanFilesForIndicators(
      index,
      ["build.gradle", "build.gradle.kts", "pom.xml"],
      JVM_DATASTORE_MAP,
      addFinding,
      0.95,
      "JVM dep",
    );

    // Check composer.json for PHP datastore packages
    await scanComposerJson(index, PHP_DATASTORE_MAP, addFinding, 0.95);

    // Check mix.exs for Elixir datastore deps
    for (const mixFile of index.getByNamePrimary("mix.exs")) {
      const content = await readText(mixFile.path);
      if (!content) continue;
      for (const [dep, datastore] of ELIXIR_DATASTORE_MAP) {
        if (content.includes(dep)) {
          addFinding(
            datastore,
            0.95,
            `Elixir dep: ${dep} in ${mixFile.relativePath}`,
          );
        }
      }
    }

    // Check build.sbt for Scala datastore deps
    await scanFilesForIndicators(
      index,
      ["build.sbt"],
      SCALA_DATASTORE_MAP,
      addFinding,
      0.95,
      "SBT dep",
    );

    // Check pubspec.yaml for Dart datastore deps
    for (const pubspec of index.getByNamePrimary("pubspec.yaml")) {
      const content = await readText(pubspec.path);
      if (!content) continue;
      for (const [pkg, datastore] of DART_DATASTORE_MAP) {
        if (content.includes(pkg)) {
          addFinding(
            datastore,
            0.95,
            `Dart dep: ${pkg} in ${pubspec.relativePath}`,
          );
        }
      }
    }

    // Check Package.swift for Swift datastore deps
    await scanFilesForIndicators(
      index,
      ["Package.swift"],
      SWIFT_DATASTORE_MAP,
      addFinding,
      0.95,
      "Swift dep",
    );

    // Check ORM config files
    for (const check of ORM_CONFIG_CHECKS) {
      if (check.detect(index)) {
        addFinding(check.name, 1.0, `config file: ${check.evidence}`);
      }
    }

    const normalizedFindings = supabaseEvidence
      ? findings.map((finding) => {
          if (finding.value !== "PostgreSQL") {
            return finding;
          }

          const evidence = finding.evidence.includes(supabaseEvidence)
            ? finding.evidence
            : [...finding.evidence, supabaseEvidence];

          return {
            ...finding,
            value: "PostgreSQL (Supabase)",
            evidence,
          };
        })
      : findings;

    return { detectorId: "datastore", findings: normalizedFindings };
  },
});
