import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { pythonParser } from "./python";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "dep-scanner-py-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("pythonParser", () => {
  it("has correct ecosystem", () => {
    expect(pythonParser.ecosystem).toBe("pypi");
  });

  describe("parseDependencies - requirements.txt", () => {
    it("parses pinned versions", async () => {
      const content = `
requests==2.28.0
flask>=2.0.0
numpy~=1.24.0
      `.trim();
      const filePath = path.join(tmpDir, "requirements.txt");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(3);

      expect(deps[0]?.name).toBe("requests");
      expect(deps[0]?.currentVersion).toBe("2.28.0");
      expect(deps[1]?.name).toBe("flask");
      expect(deps[1]?.currentVersion).toBe("2.0.0");
    });

    it("skips comments and blank lines", async () => {
      const content = `
# This is a comment
requests==2.28.0

# Another comment
flask==2.0.0
      `.trim();
      const filePath = path.join(tmpDir, "requirements.txt");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
    });

    it("skips -r includes and -- flags", async () => {
      const content = `
-r base.txt
--index-url https://pypi.org/simple
requests==2.28.0
      `.trim();
      const filePath = path.join(tmpDir, "requirements.txt");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(1);
      expect(deps[0]?.name).toBe("requests");
    });

    it("handles packages with extras", async () => {
      const content = "requests[security]==2.28.0";
      const filePath = path.join(tmpDir, "requirements.txt");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps[0]?.name).toBe("requests");
    });

    it("handles packages without version", async () => {
      const content = "requests";
      const filePath = path.join(tmpDir, "requirements.txt");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps[0]?.name).toBe("requests");
      expect(deps[0]?.currentVersion).toBe("*");
    });
  });

  describe("parseDependencies - pyproject.toml", () => {
    it("parses [project] dependencies", async () => {
      const content = `
[project]
name = "myapp"
dependencies = [
    "requests>=2.28.0",
    "flask==2.0.0",
]
      `.trim();
      const filePath = path.join(tmpDir, "pyproject.toml");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps.length).toBeGreaterThanOrEqual(2);
      expect(deps.some((d) => d.name === "requests")).toBe(true);
      expect(deps.some((d) => d.name === "flask")).toBe(true);
    });

    it("parses poetry dependencies", async () => {
      const content = `
[tool.poetry.dependencies]
python = "^3.9"
requests = "^2.28.0"
flask = {version = "^2.0.0", optional = true}

[tool.poetry.dev-dependencies]
pytest = "^7.0.0"
      `.trim();
      const filePath = path.join(tmpDir, "pyproject.toml");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      // Should skip python
      expect(deps.some((d) => d.name === "python")).toBe(false);
      expect(deps.some((d) => d.name === "requests")).toBe(true);
      const pytest = deps.find((d) => d.name === "pytest");
      expect(pytest?.isDev).toBe(true);
    });
  });

  describe("parseDependencies - Pipfile", () => {
    it("parses packages and dev-packages", async () => {
      const content = `
[packages]
requests = "==2.28.0"
flask = "*"

[dev-packages]
pytest = ">=7.0"
      `.trim();
      const filePath = path.join(tmpDir, "Pipfile");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps.length).toBeGreaterThanOrEqual(2);
      const pytest = deps.find((d) => d.name === "pytest");
      expect(pytest?.isDev).toBe(true);
    });
  });

  describe("parseDependencies - setup.cfg", () => {
    it("parses install_requires", async () => {
      const content = `
[options]
install_requires =
    requests>=2.28.0
    flask>=2.0.0
      `.trim();
      const filePath = path.join(tmpDir, "setup.cfg");
      await writeFile(filePath, content);

      const deps = await pythonParser.parseDependencies([filePath]);
      expect(deps).toHaveLength(2);
    });
  });

  describe("getImportPatterns", () => {
    it("normalizes hyphens to underscores in patterns", () => {
      const deps = [
        {
          name: "my-cool-pkg",
          currentVersion: "1.0",
          ecosystem: "pypi" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = pythonParser.getImportPatterns(deps);
      const regex = patterns.get("my-cool-pkg")!;

      // Python imports use underscores (PEP 503 normalization)
      expect(regex.test("import my_cool_pkg")).toBe(true);
      expect(regex.test("from my_cool_pkg import foo")).toBe(true);
    });

    it("maps Pillow to PIL via import name mapper", () => {
      const deps = [
        {
          name: "Pillow",
          currentVersion: "10.0",
          ecosystem: "pypi" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = pythonParser.getImportPatterns(deps);
      const regex = patterns.get("Pillow")!;

      expect(regex.test("import PIL")).toBe(true);
      expect(regex.test("from PIL import Image")).toBe(true);
      expect(regex.test("from PIL.Image import open")).toBe(true);
      // Should NOT match the package name directly
      expect(regex.test("import Pillow")).toBe(false);
    });

    it("maps beautifulsoup4 to bs4 via import name mapper", () => {
      const deps = [
        {
          name: "beautifulsoup4",
          currentVersion: "4.12",
          ecosystem: "pypi" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = pythonParser.getImportPatterns(deps);
      const regex = patterns.get("beautifulsoup4")!;

      expect(regex.test("import bs4")).toBe(true);
      expect(regex.test("from bs4 import BeautifulSoup")).toBe(true);
      expect(regex.test("import beautifulsoup4")).toBe(false);
    });

    it("maps opencv-python to cv2 via import name mapper", () => {
      const deps = [
        {
          name: "opencv-python",
          currentVersion: "4.8",
          ecosystem: "pypi" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = pythonParser.getImportPatterns(deps);
      const regex = patterns.get("opencv-python")!;

      expect(regex.test("import cv2")).toBe(true);
      expect(regex.test("from cv2 import imread")).toBe(true);
    });

    it("maps scikit-learn to sklearn via import name mapper", () => {
      const deps = [
        {
          name: "scikit-learn",
          currentVersion: "1.3",
          ecosystem: "pypi" as const,
          manifestPath: "",
          isDev: false,
          isOptional: false,
        },
      ];

      const patterns = pythonParser.getImportPatterns(deps);
      const regex = patterns.get("scikit-learn")!;

      expect(regex.test("import sklearn")).toBe(true);
      expect(
        regex.test("from sklearn.ensemble import RandomForestClassifier"),
      ).toBe(true);
    });
  });
});
