import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { dotnetParser } from "./dotnet";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-dotnet-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("dotnetParser", () => {
  it("has correct ecosystem", () => {
    expect(dotnetParser.ecosystem).toBe("nuget");
  });

  describe("parseDependencies - csproj", () => {
    it("parses PackageReference elements", async () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Serilog" Version="3.1.1" />
  </ItemGroup>
</Project>
      `.trim();
      const filePath = path.join(tmpDir, "MyApp.csproj");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("Newtonsoft.Json");
      expect(deps[0]?.currentVersion).toBe("13.0.3");
      expect(deps[1]?.name).toBe("Serilog");
      expect(deps[1]?.currentVersion).toBe("3.1.1");
    });

    it("marks PrivateAssets=All as isDev", async () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="coverlet.collector" Version="6.0.0" PrivateAssets="All" />
  </ItemGroup>
</Project>
      `.trim();
      const filePath = path.join(tmpDir, "MyApp.csproj");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.isDev).toBe(true);
    });

    it("handles multi-line PackageReference", async () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Logging">
      <Version>8.0.0</Version>
    </PackageReference>
  </ItemGroup>
</Project>
      `.trim();
      const filePath = path.join(tmpDir, "MyApp.csproj");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("Microsoft.Extensions.Logging");
      expect(deps[0]?.currentVersion).toBe("8.0.0");
    });
  });

  describe("parseDependencies - packages.config", () => {
    it("parses package elements", async () => {
      const content = `
<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
  <package id="NUnit" version="3.14.0" targetFramework="net48" />
</packages>
      `.trim();
      const filePath = path.join(tmpDir, "packages.config");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("Newtonsoft.Json");
      expect(deps[0]?.currentVersion).toBe("13.0.3");
      expect(deps[1]?.name).toBe("NUnit");
    });

    it("marks developmentDependency as isDev", async () => {
      const content = `
<packages>
  <package id="StyleCop.Analyzers" version="1.2.0" developmentDependency="true" />
</packages>
      `.trim();
      const filePath = path.join(tmpDir, "packages.config");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.isDev).toBe(true);
    });
  });

  describe("parseDependencies - Directory.Packages.props", () => {
    it("parses PackageVersion elements", async () => {
      const content = `
<Project>
  <ItemGroup>
    <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageVersion Include="Serilog" Version="3.1.1" />
  </ItemGroup>
</Project>
      `.trim();
      const filePath = path.join(tmpDir, "Directory.Packages.props");
      await writeFile(filePath, content);

      const deps = await dotnetParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
      expect(deps[0]?.name).toBe("Newtonsoft.Json");
      expect(deps[0]?.currentVersion).toBe("13.0.3");
      expect(deps[0]?.ecosystem).toBe("nuget");
      expect(deps[1]?.name).toBe("Serilog");
      expect(deps[1]?.currentVersion).toBe("3.1.1");
    });
  });

  describe("detectFiles", () => {
    it("finds csproj files by extension pattern", async () => {
      await writeFile(path.join(tmpDir, "MyApp.csproj"), "<Project />");
      await writeFile(path.join(tmpDir, "Other.csproj"), "<Project />");

      const files = await dotnetParser.detectFiles(tmpDir);
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.some((f) => f.endsWith(".csproj"))).toBe(true);
    });
  });

  describe("getImportPatterns", () => {
    it("matches C# using statements", () => {
      const deps = [
        {
          name: "Newtonsoft.Json",
          currentVersion: "13.0.3",
          ecosystem: "nuget" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = dotnetParser.getImportPatterns(deps);
      const regex = patterns.get("Newtonsoft.Json")!;

      expect(regex.test("using Newtonsoft.Json;")).toBe(true);
      expect(regex.test("using Newtonsoft.Json.Linq;")).toBe(true);
    });
  });
});
