import { describe, expect, it } from "bun:test";
import { detectFrameworkPrefix, inferType, isRequired } from "./inference";
import type { ExtractorMatch } from "./types";

const match = (overrides: Partial<ExtractorMatch> = {}): ExtractorMatch => ({
  varName: "TEST",
  line: 1,
  pattern: "process.env.TEST",
  accessType: "read",
  ...overrides,
});

describe("inferType", () => {
  it("infers number from numeric default", () => {
    expect(inferType("PORT", [match({ defaultValue: "3000" })])).toBe("number");
  });

  it("infers boolean from boolean default", () => {
    expect(inferType("X", [match({ defaultValue: "true" })])).toBe("boolean");
    expect(inferType("X", [match({ defaultValue: "false" })])).toBe("boolean");
  });

  it("infers url from http default", () => {
    expect(
      inferType("X", [match({ defaultValue: "https://example.com" })]),
    ).toBe("url");
  });

  it("infers path from path default", () => {
    expect(inferType("X", [match({ defaultValue: "/usr/local/bin" })])).toBe(
      "path",
    );
  });

  it("uses name heuristic for _PORT suffix", () => {
    expect(inferType("SERVER_PORT", [match()])).toBe("number");
  });

  it("uses name heuristic for _URL suffix", () => {
    expect(inferType("API_URL", [match()])).toBe("url");
  });

  it("uses name heuristic for _ENABLED suffix", () => {
    expect(inferType("FEATURE_ENABLED", [match()])).toBe("boolean");
  });

  it("uses name heuristic for DEBUG", () => {
    expect(inferType("DEBUG", [match()])).toBe("boolean");
  });

  it("uses name heuristic for _PATH suffix", () => {
    expect(inferType("CONFIG_PATH", [match()])).toBe("path");
  });

  it("returns unknown for generic names", () => {
    expect(inferType("API_KEY", [match()])).toBe("unknown");
  });

  it("prefers explicit inferredType from extractor", () => {
    expect(inferType("X", [match({ inferredType: "json" })])).toBe("json");
  });

  it("prefers default value over name heuristic", () => {
    // Name suggests number, but default suggests url
    expect(
      inferType("SERVER_PORT", [match({ defaultValue: "https://foo.com" })]),
    ).toBe("url");
  });
});

describe("isRequired", () => {
  it("returns true when no default provided", () => {
    expect(isRequired([match()])).toBe(true);
  });

  it("returns false when default is provided", () => {
    expect(isRequired([match({ defaultValue: "3000" })])).toBe(false);
  });

  it("returns false for config-only definitions", () => {
    expect(
      isRequired([match({ isConfigFile: true, accessType: "definition" })]),
    ).toBe(false);
  });

  it("returns true if any code usage lacks default", () => {
    expect(
      isRequired([
        match({ defaultValue: "3000" }),
        match({ defaultValue: undefined }),
      ]),
    ).toBe(true);
  });

  it("returns false for write access", () => {
    expect(isRequired([match({ accessType: "write" })])).toBe(false);
  });

  it("returns false for optional patterns like LookupEnv", () => {
    expect(isRequired([match({ pattern: 'os.LookupEnv("FOO")' })])).toBe(false);
  });
});

describe("detectFrameworkPrefix", () => {
  it("detects NEXT_PUBLIC_", () => {
    expect(detectFrameworkPrefix("NEXT_PUBLIC_API_URL")).toBe("NEXT_PUBLIC");
  });

  it("detects VITE_", () => {
    expect(detectFrameworkPrefix("VITE_API_KEY")).toBe("VITE");
  });

  it("detects REACT_APP_", () => {
    expect(detectFrameworkPrefix("REACT_APP_TITLE")).toBe("REACT_APP");
  });

  it("returns undefined for no prefix", () => {
    expect(detectFrameworkPrefix("DATABASE_URL")).toBeUndefined();
  });
});
