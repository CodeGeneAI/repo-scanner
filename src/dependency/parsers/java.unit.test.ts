import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { javaParser } from "./java";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-java-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("javaParser", () => {
  it("has correct ecosystem", () => {
    expect(javaParser.ecosystem).toBe("maven");
  });

  describe("parseDependencies - pom.xml", () => {
    it("parses dependency blocks with groupId:artifactId format", async () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.20</version>
    </dependency>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>31.1-jre</version>
    </dependency>
  </dependencies>
</project>
      `.trim();
      const filePath = path.join(tmpDir, "pom.xml");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("org.springframework:spring-core");
      expect(deps[0]?.currentVersion).toBe("5.3.20");
      expect(deps[1]?.name).toBe("com.google.guava:guava");
    });

    it("handles Maven property substitution as version string", async () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.example</groupId>
      <artifactId>my-lib</artifactId>
      <version>\${project.version}</version>
    </dependency>
  </dependencies>
</project>
      `.trim();
      const filePath = path.join(tmpDir, "pom.xml");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.currentVersion).toBe("${project.version}");
    });

    it("marks scope=test dependencies as isDev", async () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
      `.trim();
      const filePath = path.join(tmpDir, "pom.xml");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.isDev).toBe(true);
    });

    it("handles dependencies without version", async () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.example</groupId>
      <artifactId>managed-dep</artifactId>
    </dependency>
  </dependencies>
</project>
      `.trim();
      const filePath = path.join(tmpDir, "pom.xml");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.currentVersion).toBe("*");
    });
  });

  describe("parseDependencies - build.gradle", () => {
    it("parses implementation dependencies", async () => {
      const content = `
dependencies {
    implementation "org.springframework:spring-core:5.3.20"
    implementation "com.google.guava:guava:31.1-jre"
}
      `.trim();
      const filePath = path.join(tmpDir, "build.gradle");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("org.springframework:spring-core");
      expect(deps[0]?.currentVersion).toBe("5.3.20");
    });

    it("marks testImplementation as isDev", async () => {
      const content = `
dependencies {
    testImplementation "junit:junit:4.13.2"
}
      `.trim();
      const filePath = path.join(tmpDir, "build.gradle");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.isDev).toBe(true);
    });

    it("handles dependencies without version", async () => {
      const content = `
dependencies {
    implementation "org.springframework:spring-core"
}
      `.trim();
      const filePath = path.join(tmpDir, "build.gradle");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.currentVersion).toBe("*");
    });
  });

  describe("parseDependencies - build.gradle.kts", () => {
    it("parses Kotlin DSL dependencies", async () => {
      const content = `
dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.0")
}
      `.trim();
      const filePath = path.join(tmpDir, "build.gradle.kts");
      await writeFile(filePath, content);

      const deps = await javaParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("org.jetbrains.kotlin:kotlin-stdlib");
      expect(deps[0]?.currentVersion).toBe("1.9.0");
    });
  });

  describe("getImportPatterns", () => {
    it("uses groupId for import patterns", () => {
      const deps = [
        {
          name: "org.springframework:spring-core",
          currentVersion: "5.3.20",
          ecosystem: "maven" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = javaParser.getImportPatterns(deps);
      const regex = patterns.get("org.springframework:spring-core")!;

      expect(regex.test("import org.springframework.core.App;")).toBe(true);
    });
  });
});
