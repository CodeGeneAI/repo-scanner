import { describe, expect, it } from "bun:test";
import { getExtractorForExtension } from "./extractors";

const extract = (ext: string, code: string) => {
  const extractor = getExtractorForExtension(ext);
  if (!extractor) throw new Error(`No extractor for ${ext}`);
  return extractor(code.split("\n"), "test.ts");
};

describe("TypeScript extractor", () => {
  it("detects process.env.FOO", () => {
    const matches = extract(".ts", "const x = process.env.DATABASE_URL;");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.accessType).toBe("read");
  });

  it("detects process.env bracket access", () => {
    const matches = extract(".ts", 'const x = process.env["API_KEY"];');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("detects default values with ??", () => {
    const matches = extract(".ts", 'const x = process.env.PORT ?? "3000";');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("detects default values with ||", () => {
    const matches = extract(
      ".ts",
      'const x = process.env.HOST || "localhost";',
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("localhost");
  });

  it("detects destructuring", () => {
    const matches = extract(".ts", "const { NODE_ENV, PORT } = process.env;");
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.varName)).toContain("NODE_ENV");
    expect(matches.map((m) => m.varName)).toContain("PORT");
  });

  it("detects import.meta.env", () => {
    const matches = extract(".ts", "const url = import.meta.env.VITE_API_URL;");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("VITE_API_URL");
  });

  it("detects write access", () => {
    const matches = extract(".ts", 'process.env.NODE_ENV = "test";');
    const write = matches.find((m) => m.accessType === "write");
    expect(write).toBeDefined();
    expect(write!.varName).toBe("NODE_ENV");
  });

  it("detects dynamic access", () => {
    const matches = extract(".ts", "const val = process.env[key];");
    const dyn = matches.find((m) => m.isDynamic);
    expect(dyn).toBeDefined();
    expect(dyn!.varName).toMatch(/^<dynamic:/);
  });
});

describe("Python extractor", () => {
  it("detects os.getenv", () => {
    const matches = extract(".py", 'db = os.getenv("DATABASE_URL")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
  });

  it("detects os.getenv with default", () => {
    const matches = extract(".py", 'port = os.getenv("PORT", "8080")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("8080");
  });

  it("detects os.environ bracket", () => {
    const matches = extract(".py", 'key = os.environ["SECRET_KEY"]');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("SECRET_KEY");
  });

  it("detects os.environ.get", () => {
    const matches = extract(".py", 'debug = os.environ.get("DEBUG", "false")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("false");
  });
});

describe("Go extractor", () => {
  it("detects os.Getenv", () => {
    const matches = extract(".go", 'port := os.Getenv("PORT")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
  });

  it("detects os.LookupEnv", () => {
    const matches = extract(".go", 'val, ok := os.LookupEnv("DEBUG")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DEBUG");
  });

  it("detects struct env tags", () => {
    const matches = extract(".go", '  Port int `env:"PORT" envDefault:"8080"`');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("8080");
  });
});

describe("Shell extractor", () => {
  it("detects export", () => {
    const matches = extract(
      ".sh",
      "export DATABASE_URL=postgres://localhost/db",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.accessType).toBe("definition");
  });

  it("detects ${VAR:-default}", () => {
    const matches = extract(".sh", 'echo "${PORT:-3000}"');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PORT");
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("detects ${VAR:?error}", () => {
    const matches = extract(".sh", "${API_KEY:?Missing API key}");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
    expect(matches[0]!.defaultValue).toBeUndefined();
  });

  it("skips comments", () => {
    const matches = extract(".sh", "# export COMMENT_VAR=foo");
    expect(matches).toHaveLength(0);
  });
});

describe("Rust extractor", () => {
  it("detects env::var", () => {
    const matches = extract(".rs", 'let key = env::var("API_KEY").unwrap();');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("detects env::var with unwrap_or default", () => {
    const matches = extract(
      ".rs",
      'let port = env::var("PORT").unwrap_or("3000".to_string());',
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("3000");
  });

  it("detects env! macro", () => {
    const matches = extract(".rs", 'let key = env!("CARGO_PKG_VERSION");');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("CARGO_PKG_VERSION");
  });
});

describe("Java extractor", () => {
  it("detects System.getenv", () => {
    const matches = extract(
      ".java",
      'String url = System.getenv("DATABASE_URL");',
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
  });

  it("detects @Value annotation with default", () => {
    const matches = extract(".java", '@Value("${SERVER_PORT:8080}")');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("SERVER_PORT");
    expect(matches[0]!.defaultValue).toBe("8080");
  });
});

describe("Ruby extractor", () => {
  it("detects ENV bracket", () => {
    const matches = extract(".rb", 'key = ENV["SECRET_KEY"]');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("SECRET_KEY");
  });

  it("detects ENV.fetch with default", () => {
    const matches = extract(".rb", "port = ENV.fetch('PORT', '3000')");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.defaultValue).toBe("3000");
  });
});

describe("PHP extractor", () => {
  it("detects getenv()", () => {
    const matches = extract(".php", '$key = getenv("API_KEY");');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("API_KEY");
  });

  it("detects $_ENV", () => {
    const matches = extract(".php", '$host = $_ENV["DB_HOST"];');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("DB_HOST");
  });
});

describe("C/C++ extractor", () => {
  it("detects getenv()", () => {
    const matches = extract(".c", 'char* home = getenv("HOME");');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("HOME");
  });

  it("detects std::getenv()", () => {
    const matches = extract(".cpp", 'auto path = std::getenv("PATH");');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("PATH");
  });
});
