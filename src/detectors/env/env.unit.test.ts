import { describe, expect, it } from "bun:test";
import {
  parseDockerCompose,
  parseDotenv,
  parseKubernetes,
} from "./config-parsers";
import { getExtractorForExtension } from "./extractors";
import { detectFrameworkPrefix, inferType, isRequired } from "./inference";
import type { ExtractorMatch } from "./types";

// ─── TypeScript / JavaScript Extractor ───────────────────────────────

describe("TypeScript/JavaScript extractor", () => {
  const extract = getExtractorForExtension(".ts")!;

  it("extracts process.env.FOO", () => {
    const matches = extract(["const x = process.env.DATABASE_URL;"], "test.ts");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.accessType).toBe("read");
  });

  it("extracts process.env.FOO with ?? default", () => {
    const matches = extract(
      ['const port = process.env.PORT ?? "3000";'],
      "test.ts",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("extracts process.env.FOO with || default", () => {
    const matches = extract(
      ['const host = process.env.HOST || "localhost";'],
      "test.ts",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("localhost");
  });

  it("extracts bracket access process.env['FOO']", () => {
    const matches = extract(["const x = process.env['API_KEY'];"], "test.ts");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
    expect(matches[0]!.pattern).toContain('process.env["API_KEY"]');
  });

  it('extracts bracket access process.env["FOO"]', () => {
    const matches = extract(['const x = process.env["SECRET"];'], "test.ts");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("SECRET");
  });

  it("extracts dynamic access as isDynamic", () => {
    const matches = extract(["const x = process.env[envKey];"], "test.ts");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.isDynamic).toBe(true);
    expect(matches[0]!.varName).toContain("<dynamic");
  });

  it("extracts import.meta.env (Vite)", () => {
    const matches = extract(
      ["const url = import.meta.env.VITE_API_URL;"],
      "test.ts",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("VITE_API_URL");
  });

  it("extracts single-line destructuring", () => {
    const matches = extract(["const { PORT, HOST } = process.env;"], "test.ts");
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.varName).sort()).toEqual(["HOST", "PORT"]);
  });

  it("extracts multi-line destructuring", () => {
    const matches = extract(
      ["const {", "  PORT,", "  HOST,", "  DB_URL", "} = process.env;"],
      "test.ts",
    );
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.varName).sort()).toEqual([
      "DB_URL",
      "HOST",
      "PORT",
    ]);
  });

  it("extracts write access", () => {
    const matches = extract(['process.env.NODE_ENV = "test";'], "test.ts");
    expect(matches.some((m) => m.accessType === "write")).toBe(true);
    expect(matches.some((m) => m.varName === "NODE_ENV")).toBe(true);
  });

  it("extracts multiple vars on different lines", () => {
    const matches = extract(
      [
        "const db = process.env.DATABASE_URL;",
        "const port = process.env.PORT;",
        "const host = process.env.HOST;",
      ],
      "test.ts",
    );
    expect(matches).toHaveLength(3);
  });
});

// ─── Python Extractor ────────────────────────────────────────────────

describe("Python extractor", () => {
  const extract = getExtractorForExtension(".py")!;

  it("extracts os.getenv()", () => {
    const matches = extract(['host = os.getenv("DB_HOST")'], "test.py");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DB_HOST");
  });

  it("extracts os.getenv() with default", () => {
    const matches = extract(['port = os.getenv("PORT", "8080")'], "test.py");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("8080");
  });

  it("extracts os.environ[]", () => {
    const matches = extract(['key = os.environ["API_KEY"]'], "test.py");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("extracts os.environ.get() with default", () => {
    const matches = extract(
      ['debug = os.environ.get("DEBUG", "false")'],
      "test.py",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("false");
  });
});

// ─── Go Extractor ────────────────────────────────────────────────────

describe("Go extractor", () => {
  const extract = getExtractorForExtension(".go")!;

  it("extracts os.Getenv()", () => {
    const matches = extract(['host := os.Getenv("DB_HOST")'], "test.go");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DB_HOST");
  });

  it("extracts os.LookupEnv()", () => {
    const matches = extract(
      ['val, ok := os.LookupEnv("OPTIONAL_VAR")'],
      "test.go",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("OPTIONAL_VAR");
  });

  it("extracts struct tag env:", () => {
    const matches = extract(
      ['  Port int `env:"PORT" envDefault:"8080"`'],
      "test.go",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("8080");
  });

  it("extracts envconfig struct tag", () => {
    const matches = extract(['  Host string `envconfig:"DB_HOST"`'], "test.go");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DB_HOST");
  });
});

// ─── Rust Extractor ──────────────────────────────────────────────────

describe("Rust extractor", () => {
  const extract = getExtractorForExtension(".rs")!;

  it("extracts env::var()", () => {
    const matches = extract(
      ['let key = env::var("API_KEY").unwrap();'],
      "test.rs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("extracts env::var() with unwrap_or default", () => {
    const matches = extract(
      ['let port = env::var("PORT").unwrap_or("3000".to_string());'],
      "test.rs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("extracts env!()", () => {
    const matches = extract(
      ['const KEY: &str = env!("BUILD_KEY");'],
      "test.rs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("BUILD_KEY");
  });

  it("extracts option_env!()", () => {
    const matches = extract(
      ['let opt = option_env!("OPTIONAL_KEY");'],
      "test.rs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("OPTIONAL_KEY");
  });
});

// ─── Shell Extractor ─────────────────────────────────────────────────

describe("Shell extractor", () => {
  const extract = getExtractorForExtension(".sh")!;

  it("extracts export definition", () => {
    const matches = extract(
      ["export DATABASE_URL=postgres://localhost:5432/db"],
      "test.sh",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.accessType).toBe("definition");
  });

  it("extracts ${FOO:-default}", () => {
    const matches = extract(['echo "${PORT:-3000}"'], "test.sh");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("extracts ${FOO:?error}", () => {
    const matches = extract(
      ['echo "${API_KEY:?API_KEY is required}"'],
      "test.sh",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
    expect(matches[0]!.defaultValue).toBeUndefined();
  });

  it("skips comments", () => {
    const matches = extract(["# export COMMENTED_OUT=value"], "test.sh");
    expect(matches).toHaveLength(0);
  });
});

// ─── Java Extractor ──────────────────────────────────────────────────

describe("Java extractor", () => {
  const extract = getExtractorForExtension(".java")!;

  it("extracts System.getenv()", () => {
    const matches = extract(
      ['String key = System.getenv("API_KEY");'],
      "Test.java",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("extracts Spring @Value with default", () => {
    const matches = extract(['@Value("${SERVER_PORT:8080}")'], "Config.java");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("SERVER_PORT");
    expect(matches[0]!.defaultValue).toBe("8080");
  });
});

// ─── Other Extractors ────────────────────────────────────────────────

describe("C# extractor", () => {
  const extract = getExtractorForExtension(".cs")!;

  it("extracts Environment.GetEnvironmentVariable()", () => {
    const matches = extract(
      ['var key = Environment.GetEnvironmentVariable("CONNECTION_STRING");'],
      "test.cs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("CONNECTION_STRING");
  });
});

describe("Ruby extractor", () => {
  const extract = getExtractorForExtension(".rb")!;

  it("extracts ENV[]", () => {
    const matches = extract(['key = ENV["API_KEY"]'], "test.rb");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("extracts ENV.fetch with default", () => {
    const matches = extract(["port = ENV.fetch('PORT', '3000')"], "test.rb");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("3000");
  });
});

describe("PHP extractor", () => {
  const extract = getExtractorForExtension(".php")!;

  it("extracts getenv()", () => {
    const matches = extract(["$key = getenv('API_KEY');"], "test.php");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("extracts $_ENV[]", () => {
    const matches = extract(["$db = $_ENV['DATABASE_URL'];"], "test.php");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
  });
});

describe("C/C++ extractor", () => {
  const extract = getExtractorForExtension(".c")!;

  it("extracts getenv()", () => {
    const matches = extract(['char *val = getenv("HOME");'], "test.c");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("HOME");
  });

  it("extracts std::getenv()", () => {
    const cpp = getExtractorForExtension(".cpp")!;
    const matches = cpp(['auto val = std::getenv("CONFIG_PATH");'], "test.cpp");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("CONFIG_PATH");
  });
});

// ─── Config Parsers ──────────────────────────────────────────────────

describe("dotenv parser", () => {
  it("parses KEY=value pairs", () => {
    const matches = parseDotenv(
      "DATABASE_URL=postgres://localhost:5432/db\nPORT=3000\nDEBUG=true",
      ".env",
    );
    expect(matches).toHaveLength(3);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.defaultValue).toBe("postgres://localhost:5432/db");
    expect(matches[1]!.varName).toBe("PORT");
    expect(matches[2]!.varName).toBe("DEBUG");
  });

  it("handles quoted values", () => {
    const matches = parseDotenv(
      "SECRET=\"my secret value\"\nKEY='single quoted'",
      ".env",
    );
    expect(matches).toHaveLength(2);
    expect(matches[0]!.defaultValue).toBe("my secret value");
    expect(matches[1]!.defaultValue).toBe("single quoted");
  });

  it("skips comments and empty lines", () => {
    const matches = parseDotenv(
      "# Comment\n\nKEY=value\n# Another comment",
      ".env",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("KEY");
  });

  it("handles empty values", () => {
    const matches = parseDotenv("EMPTY=\nALSO_EMPTY=", ".env");
    expect(matches).toHaveLength(2);
    expect(matches[0]!.defaultValue).toBeUndefined();
  });

  it("all matches are definitions with isConfigFile", () => {
    const matches = parseDotenv("FOO=bar", ".env");
    expect(matches[0]!.accessType).toBe("definition");
    expect(matches[0]!.isConfigFile).toBe(true);
  });
});

describe("docker-compose parser", () => {
  it("parses list-form environment", () => {
    const matches = parseDockerCompose(
      "services:\n  app:\n    environment:\n      - DB_HOST=localhost\n      - DB_PORT=5432",
      "docker-compose.yml",
    );
    expect(matches.some((m) => m.varName === "DB_HOST")).toBe(true);
    expect(matches.some((m) => m.varName === "DB_PORT")).toBe(true);
  });

  it("parses map-form environment variables with values", () => {
    const matches = parseDockerCompose(
      "services:\n  app:\n    environment:\n      DB_HOST: localhost\n      DB_PORT: 5432\n    ports:",
      "docker-compose.yml",
    );
    expect(
      matches.some(
        (m) => m.varName === "DB_HOST" && m.defaultValue === "localhost",
      ),
    ).toBe(true);
    expect(
      matches.some((m) => m.varName === "DB_PORT" && m.defaultValue === "5432"),
    ).toBe(true);
  });
});

describe("kubernetes parser", () => {
  it("parses env name/value pairs", () => {
    const content = [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "spec:",
      "  template:",
      "    spec:",
      "      containers:",
      "        - name: app",
      "          env:",
      "            - name: DATABASE_URL",
      '              value: "postgres://db:5432"',
      "            - name: API_KEY",
      "              valueFrom:",
      "                secretKeyRef:",
      "                  name: app-secrets",
      "                  key: api-key",
    ].join("\n");
    const matches = parseKubernetes(content, "deployment.yaml");
    expect(matches.some((m) => m.varName === "DATABASE_URL")).toBe(true);
    expect(matches.some((m) => m.varName === "API_KEY")).toBe(true);
  });

  it("ignores non-k8s yaml files", () => {
    const matches = parseKubernetes("name: test\nversion: 1", "config.yaml");
    expect(matches).toHaveLength(0);
  });
});

// ─── Type Inference ──────────────────────────────────────────────────

describe("type inference", () => {
  const match = (overrides: Partial<ExtractorMatch>): ExtractorMatch => ({
    varName: "TEST",
    line: 1,
    pattern: "process.env.TEST",
    accessType: "read",
    ...overrides,
  });

  it("infers number from numeric default", () => {
    expect(inferType("PORT", [match({ defaultValue: "3000" })])).toBe("number");
  });

  it("infers boolean from true/false default", () => {
    expect(inferType("DEBUG", [match({ defaultValue: "true" })])).toBe(
      "boolean",
    );
  });

  it("infers url from https:// default", () => {
    expect(
      inferType("API_URL", [
        match({ defaultValue: "https://api.example.com" }),
      ]),
    ).toBe("url");
  });

  it("infers path from / default", () => {
    expect(inferType("DATA_DIR", [match({ defaultValue: "/tmp/data" })])).toBe(
      "path",
    );
  });

  it("infers number from *_PORT name pattern", () => {
    expect(inferType("SERVER_PORT", [match({})])).toBe("number");
  });

  it("infers url from *_URL name pattern", () => {
    expect(inferType("DATABASE_URL", [match({})])).toBe("url");
  });

  it("infers boolean from DEBUG name", () => {
    expect(inferType("DEBUG", [match({})])).toBe("boolean");
  });

  it("infers boolean from *_ENABLED name", () => {
    expect(inferType("CACHE_ENABLED", [match({})])).toBe("boolean");
  });

  it("infers path from *_PATH name", () => {
    expect(inferType("CONFIG_PATH", [match({})])).toBe("path");
  });

  it("returns unknown for unrecognized patterns", () => {
    expect(inferType("SOME_CUSTOM_VAR", [match({})])).toBe("unknown");
  });

  it("prioritizes default value over name heuristic", () => {
    // Name says boolean (DEBUG), but default is a URL
    expect(
      inferType("DEBUG", [
        match({ defaultValue: "https://debug.example.com" }),
      ]),
    ).toBe("url");
  });
});

// ─── Required / Optional ────────────────────────────────────────────

describe("required/optional inference", () => {
  const match = (overrides: Partial<ExtractorMatch>): ExtractorMatch => ({
    varName: "TEST",
    line: 1,
    pattern: "process.env.TEST",
    accessType: "read",
    ...overrides,
  });

  it("required when no default and direct access", () => {
    expect(isRequired([match({})])).toBe(true);
  });

  it("optional when has default value", () => {
    expect(isRequired([match({ defaultValue: "3000" })])).toBe(false);
  });

  it("optional for os.getenv pattern (Python)", () => {
    expect(isRequired([match({ pattern: 'os.getenv("TEST")' })])).toBe(false);
  });

  it("optional for os.LookupEnv pattern (Go)", () => {
    expect(isRequired([match({ pattern: 'os.LookupEnv("TEST")' })])).toBe(
      false,
    );
  });

  it("optional for option_env! pattern (Rust)", () => {
    expect(isRequired([match({ pattern: 'option_env!("TEST")' })])).toBe(false);
  });

  it("required when mixed: one usage has no default", () => {
    expect(
      isRequired([
        match({ defaultValue: "3000" }),
        match({}), // no default
      ]),
    ).toBe(true);
  });

  it("not required when only config file definitions", () => {
    expect(
      isRequired([match({ accessType: "definition", isConfigFile: true })]),
    ).toBe(false);
  });
});

// ─── Framework Prefix ────────────────────────────────────────────────

describe("framework prefix detection", () => {
  it("detects NEXT_PUBLIC_", () => {
    expect(detectFrameworkPrefix("NEXT_PUBLIC_API_URL")).toBe("NEXT_PUBLIC");
  });

  it("detects VITE_", () => {
    expect(detectFrameworkPrefix("VITE_API_URL")).toBe("VITE");
  });

  it("detects REACT_APP_", () => {
    expect(detectFrameworkPrefix("REACT_APP_KEY")).toBe("REACT_APP");
  });

  it("returns undefined for non-prefixed vars", () => {
    expect(detectFrameworkPrefix("DATABASE_URL")).toBeUndefined();
  });
});
