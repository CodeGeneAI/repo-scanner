import { describe, expect, it } from "vitest";
import {
  parseDockerCompose,
  parseDotenv,
  parseKubernetes,
} from "./config-parsers";

describe("parseDotenv", () => {
  it("parses simple KEY=value pairs", () => {
    const content = "DATABASE_URL=postgres://localhost/db\nPORT=3000";
    const matches = parseDotenv(content, ".env");
    expect(matches).toHaveLength(2);
    expect(matches[0]!.varName).toBe("DATABASE_URL");
    expect(matches[0]!.defaultValue).toBe("postgres://localhost/db");
    expect(matches[1]!.varName).toBe("PORT");
  });

  it("strips surrounding quotes", () => {
    const content = "API_KEY=\"my-secret-key\"\nHOST='localhost'";
    const matches = parseDotenv(content, ".env");
    expect(matches[0]!.defaultValue).toBe("my-secret-key");
    expect(matches[1]!.defaultValue).toBe("localhost");
  });

  it("skips comments and empty lines", () => {
    const content = "# This is a comment\n\nACTUAL=value";
    const matches = parseDotenv(content, ".env");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.varName).toBe("ACTUAL");
  });

  it("marks all as definition and config", () => {
    const matches = parseDotenv("FOO=bar", ".env");
    expect(matches[0]!.accessType).toBe("definition");
    expect(matches[0]!.isConfigFile).toBe(true);
  });
});

describe("parseDockerCompose", () => {
  it("parses list-form environment variables", () => {
    const content = `services:
  app:
    environment:
      - DATABASE_URL=postgres://db
      - PORT=3000`;
    const matches = parseDockerCompose(content, "docker-compose.yml");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const names = matches.map((m) => m.varName);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("PORT");
  });

  it("parses map-form environment with values", () => {
    const content = `services:
  app:
    environment:
      DB_HOST: localhost
      DB_PORT: 5432
    ports:`;
    const matches = parseDockerCompose(content, "docker-compose.yml");
    expect(
      matches.some(
        (m) => m.varName === "DB_HOST" && m.defaultValue === "localhost",
      ),
    ).toBe(true);
    expect(
      matches.some((m) => m.varName === "DB_PORT" && m.defaultValue === "5432"),
    ).toBe(true);
  });

  it("does not capture interpolation outside environment section", () => {
    const content = `services:
  app:
    image: myapp:\${VERSION:-latest}`;
    const matches = parseDockerCompose(content, "docker-compose.yml");
    const version = matches.find((m) => m.varName === "VERSION");
    expect(version).toBeUndefined();
  });
});

describe("parseKubernetes", () => {
  it("parses env name/value pairs", () => {
    const content = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: DATABASE_URL
              value: "postgres://db"
            - name: PORT
              value: "3000"`;
    const matches = parseKubernetes(content, "k8s/deployment.yml");
    const names = matches.map((m) => m.varName);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("PORT");
  });

  it("detects valueFrom references", () => {
    const content = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: my-secret
                  key: key`;
    const matches = parseKubernetes(content, "k8s/deployment.yml");
    const secret = matches.find((m) => m.varName === "SECRET_KEY");
    expect(secret).toBeDefined();
    expect(secret!.pattern).toContain("secret/configMap");
  });

  it("ignores non-k8s YAML files", () => {
    const content = "name: Not a k8s file\nfoo: bar";
    const matches = parseKubernetes(content, "random.yml");
    expect(matches).toHaveLength(0);
  });
});
