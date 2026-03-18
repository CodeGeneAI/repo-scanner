import { describe, expect, it } from "vitest";
import type { Dependency, Ecosystem } from "../types";
import { classifyExclusion } from "./exclusions";

const makeDep = (
  name: string,
  ecosystem: Ecosystem,
  isDev: boolean,
  isOptional = false,
): Dependency => ({
  name,
  currentVersion: "1.0.0",
  ecosystem,
  manifestPath: "package.json",
  isDev,
  isOptional,
});

describe("classifyExclusion", () => {
  describe("npm ecosystem", () => {
    it("excludes @types/* packages as types-package (always, even non-dev)", () => {
      for (const name of ["@types/node", "@types/react", "@types/express"]) {
        expect(
          classifyExclusion(makeDep(name, "npm", true), "npm", false),
        ).toEqual({
          excluded: true,
          reason: "types-package",
        });
        expect(
          classifyExclusion(makeDep(name, "npm", false), "npm", false),
        ).toEqual({
          excluded: true,
          reason: "types-package",
        });
      }
    });

    it.each([
      "eslint-plugin-react",
      "eslint-config-prettier",
      "@babel/plugin-transform-runtime",
      "@babel/preset-env",
      "@typescript-eslint/parser",
      "prettier-plugin-tailwindcss",
      "babel-plugin-module-resolver",
      "babel-preset-react-app",
      "postcss-nested",
      "stylelint-order",
      "webpack-plugin-serve",
      "webpack-loader-something",
    ])("excludes %s as plugin-preset when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "npm", true), "npm", false),
      ).toEqual({
        excluded: true,
        reason: "plugin-preset",
      });
    });

    it.each([
      "typescript",
      "vitest",
      "jest",
      "mocha",
      "prettier",
      "eslint",
      "biome",
      "tsx",
      "ts-node",
      "nodemon",
      "husky",
      "lint-staged",
      "turbo",
      "lerna",
      "np",
      "semantic-release",
      "commitlint",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "npm", true), "npm", false),
      ).toEqual({
        excluded: true,
        reason: "dev-tooling",
      });
    });

    it.each([
      "rimraf",
      "cross-env",
      "concurrently",
      "wait-on",
      "npm-run-all",
      "npm-run-all2",
      "shx",
    ])("excludes %s as bin-only when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "npm", true), "npm", false),
      ).toEqual({
        excluded: true,
        reason: "bin-only",
      });
    });

    it("does NOT exclude production deps even if name matches known tooling", () => {
      expect(
        classifyExclusion(makeDep("typescript", "npm", false), "npm", false),
      ).toEqual({ excluded: false });
      expect(
        classifyExclusion(
          makeDep("eslint-plugin-react", "npm", false),
          "npm",
          false,
        ),
      ).toEqual({ excluded: false });
      expect(
        classifyExclusion(makeDep("rimraf", "npm", false), "npm", false),
      ).toEqual({ excluded: false });
    });

    it("does NOT exclude unknown dev deps like lodash", () => {
      expect(
        classifyExclusion(makeDep("lodash", "npm", true), "npm", false),
      ).toEqual({ excluded: false });
    });

    it("does NOT exclude production deps like express", () => {
      expect(
        classifyExclusion(makeDep("express", "npm", false), "npm", false),
      ).toEqual({ excluded: false });
    });
  });

  describe("pypi ecosystem", () => {
    it.each([
      "pytest",
      "flake8",
      "mypy",
      "black",
      "isort",
      "pylint",
      "tox",
      "nox",
      "sphinx",
      "setuptools",
      "wheel",
      "twine",
      "build",
      "ruff",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "pypi", true), "pypi", false),
      ).toEqual({
        excluded: true,
        reason: "dev-tooling",
      });
    });

    it.each([
      "pytest-cov",
      "pytest-asyncio",
      "flake8-bugbear",
      "pylint-django",
      "sphinx-rtd-theme",
      "mypy-extensions",
    ])("excludes %s as plugin-preset when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "pypi", true), "pypi", false),
      ).toEqual({
        excluded: true,
        reason: "plugin-preset",
      });
    });

    it("does NOT exclude flask", () => {
      expect(
        classifyExclusion(makeDep("flask", "pypi", false), "pypi", false),
      ).toEqual({ excluded: false });
    });
  });

  describe("cargo ecosystem", () => {
    it.each([
      "clippy",
      "rustfmt",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "cargo", true), "cargo", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("does NOT exclude serde", () => {
      expect(
        classifyExclusion(makeDep("serde", "cargo", false), "cargo", false),
      ).toEqual({ excluded: false });
    });
  });

  describe("rubygems ecosystem", () => {
    it.each([
      "rspec",
      "rubocop",
      "bundler",
      "rake",
      "minitest",
      "simplecov",
      "yard",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "rubygems", true), "rubygems", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("excludes rubocop-* as plugin-preset when isDev", () => {
      expect(
        classifyExclusion(
          makeDep("rubocop-rails", "rubygems", true),
          "rubygems",
          false,
        ),
      ).toEqual({ excluded: true, reason: "plugin-preset" });
    });

    it("does NOT exclude rails", () => {
      expect(
        classifyExclusion(
          makeDep("rails", "rubygems", false),
          "rubygems",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("go ecosystem", () => {
    it.each([
      "golang.org/x/lint",
      "golang.org/x/tools",
      "honnef.co/go/tools",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(classifyExclusion(makeDep(name, "go", true), "go", false)).toEqual(
        { excluded: true, reason: "dev-tooling" },
      );
    });

    it("excludes golangci-lint prefix as plugin-preset when isDev", () => {
      expect(
        classifyExclusion(
          makeDep("github.com/golangci/golangci-lint", "go", true),
          "go",
          false,
        ),
      ).toEqual({ excluded: true, reason: "plugin-preset" });
    });

    it("excludes testify prefix as plugin-preset when isDev", () => {
      expect(
        classifyExclusion(
          makeDep("github.com/stretchr/testify/assert", "go", true),
          "go",
          false,
        ),
      ).toEqual({ excluded: true, reason: "plugin-preset" });
    });

    it("does NOT exclude gin-gonic production dep", () => {
      expect(
        classifyExclusion(
          makeDep("github.com/gin-gonic/gin", "go", false),
          "go",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("maven ecosystem", () => {
    it.each([
      "junit",
      "org.junit.jupiter",
      "org.testng",
      "org.mockito",
      "org.assertj",
      "org.hamcrest",
      "org.jacoco",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "maven", true), "maven", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("excludes maven plugin prefixes as plugin-preset when isDev", () => {
      expect(
        classifyExclusion(
          makeDep(
            "org.apache.maven.plugins:maven-surefire-plugin",
            "maven",
            true,
          ),
          "maven",
          false,
        ),
      ).toEqual({ excluded: true, reason: "plugin-preset" });
    });

    it("does NOT exclude spring-boot production dep", () => {
      expect(
        classifyExclusion(
          makeDep(
            "org.springframework.boot:spring-boot-starter",
            "maven",
            false,
          ),
          "maven",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("nuget ecosystem", () => {
    it.each([
      "xunit",
      "NUnit",
      "MSTest.TestFramework",
      "Moq",
      "FluentAssertions",
      "coverlet.collector",
      "Microsoft.NET.Test.Sdk",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "nuget", true), "nuget", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("does NOT exclude Newtonsoft.Json production dep", () => {
      expect(
        classifyExclusion(
          makeDep("Newtonsoft.Json", "nuget", false),
          "nuget",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("packagist ecosystem", () => {
    it.each([
      "phpunit/phpunit",
      "squizlabs/php_codesniffer",
      "friendsofphp/php-cs-fixer",
      "vimeo/psalm",
      "mockery/mockery",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "packagist", true), "packagist", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("excludes phpstan/phpstan as plugin-preset via prefix match when isDev", () => {
      expect(
        classifyExclusion(
          makeDep("phpstan/phpstan", "packagist", true),
          "packagist",
          false,
        ),
      ).toEqual({ excluded: true, reason: "plugin-preset" });
    });

    it("does NOT exclude laravel/framework production dep", () => {
      expect(
        classifyExclusion(
          makeDep("laravel/framework", "packagist", false),
          "packagist",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("cocoapods ecosystem", () => {
    it.each([
      "Quick",
      "Nimble",
      "OHHTTPStubs",
      "SwiftLint",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "cocoapods", true), "cocoapods", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("does NOT exclude Alamofire production dep", () => {
      expect(
        classifyExclusion(
          makeDep("Alamofire", "cocoapods", false),
          "cocoapods",
          false,
        ),
      ).toEqual({ excluded: false });
    });
  });

  describe("pub ecosystem", () => {
    it.each([
      "test",
      "flutter_test",
      "mockito",
      "build_runner",
      "flutter_lints",
      "lints",
      "very_good_analysis",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "pub", true), "pub", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("does NOT exclude http production dep", () => {
      expect(
        classifyExclusion(makeDep("http", "pub", false), "pub", false),
      ).toEqual({ excluded: false });
    });
  });

  describe("conan ecosystem", () => {
    it.each([
      "gtest",
      "catch2",
      "benchmark",
      "doctest",
    ])("excludes %s as dev-tooling when isDev", (name) => {
      expect(
        classifyExclusion(makeDep(name, "conan", true), "conan", false),
      ).toEqual({ excluded: true, reason: "dev-tooling" });
    });

    it("does NOT exclude boost production dep", () => {
      expect(
        classifyExclusion(makeDep("boost", "conan", false), "conan", false),
      ).toEqual({ excluded: false });
    });
  });

  describe("includeDevDeadDeps bypasses all exclusions", () => {
    it.each([
      ["@types/node", "npm"],
      ["eslint-plugin-react", "npm"],
      ["typescript", "npm"],
      ["rimraf", "npm"],
      ["pytest", "pypi"],
      ["clippy", "cargo"],
      ["rspec", "rubygems"],
      ["golang.org/x/lint", "go"],
      ["junit", "maven"],
      ["xunit", "nuget"],
      ["phpunit/phpunit", "packagist"],
      ["Quick", "cocoapods"],
      ["test", "pub"],
      ["gtest", "conan"],
    ] as const)("does NOT exclude %s (%s) when includeDevDeadDeps is true", (name, ecosystem) => {
      expect(
        classifyExclusion(makeDep(name, ecosystem, true), ecosystem, true),
      ).toEqual({ excluded: false });
    });
  });

  describe("non-dev deps are never excluded (except @types/*)", () => {
    it.each([
      ["typescript", "npm"],
      ["eslint-plugin-react", "npm"],
      ["rimraf", "npm"],
      ["pytest", "pypi"],
      ["clippy", "cargo"],
      ["rspec", "rubygems"],
      ["junit", "maven"],
      ["xunit", "nuget"],
      ["phpunit/phpunit", "packagist"],
      ["Quick", "cocoapods"],
      ["test", "pub"],
      ["gtest", "conan"],
    ] as const)("does NOT exclude non-dev %s (%s)", (name, ecosystem) => {
      expect(
        classifyExclusion(makeDep(name, ecosystem, false), ecosystem, false),
      ).toEqual({ excluded: false });
    });
  });
});
