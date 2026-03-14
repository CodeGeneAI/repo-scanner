import type { Ecosystem } from "../types";
import { getImportName } from "./mapper";

/** File extensions to scan per ecosystem. */
export const ECOSYSTEM_EXTENSIONS: Record<Ecosystem, readonly string[]> = {
  npm: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  pypi: [".py"],
  go: [".go"],
  cargo: [".rs"],
  rubygems: [".rb"],
  maven: [".java", ".kt", ".kts"],
  nuget: [".cs", ".fs", ".vb"],
  packagist: [".php"],
  cocoapods: [".swift"],
  pub: [".dart"],
  conan: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx"],
};

/**
 * Escape special regex characters in a string.
 */
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build an import-matching regex for a given package in a given ecosystem.
 */
export const buildImportRegex = (
  ecosystem: Ecosystem,
  packageName: string,
): RegExp => {
  const importName = getImportName(ecosystem, packageName);
  const escaped = escapeRegex(importName);

  switch (ecosystem) {
    case "npm":
      // import ... from "pkg", require("pkg"), import("pkg")
      // Also handle subpath: "pkg/foo"
      return new RegExp(
        `(?:import\\s+.*?from\\s+|require\\s*\\(\\s*|import\\s*\\(\\s*)['"]${escaped}(?:\\/[^'"]*)?['"]`,
      );

    case "pypi":
      // Python: import pkg, from pkg import ..., from pkg.sub import ...
      // Name normalization (hyphens→underscores, known mappings) handled by getImportName
      return new RegExp(
        `(?:^import\\s+|^from\\s+)${escaped}(?:\\.|\\s|$)`,
        "m",
      );

    case "go":
      // Go: "module/path" in import block
      return new RegExp(`"${escaped}(?:\\/[^"]*)?"`);

    case "cargo":
      // Rust: use crate_name::, extern crate crate_name
      // Hyphen→underscore normalization handled by getImportName
      return new RegExp(
        `(?:^use\\s+|^extern\\s+crate\\s+)${escaped}(?:::|\\s|;)`,
        "m",
      );

    case "rubygems":
      // Ruby: require "gem", require 'gem', gem "name"
      return new RegExp(
        `(?:require\\s+|gem\\s+)['"]${escaped}(?:\\/[^'"]*)?['"]`,
      );

    case "maven":
      // Java: import group.artifact.ClassName
      return new RegExp(`^import\\s+(?:static\\s+)?${escaped}\\.`, "m");

    case "nuget":
      // C#: using Namespace;
      return new RegExp(`^using\\s+${escaped}(?:\\.|;)`, "m");

    case "packagist":
      // PHP: use Namespace\Class
      return new RegExp(
        `(?:^use\\s+|^namespace\\s+)${escaped.replace(/\\\\/g, "\\\\\\\\")}`,
        "m",
      );

    case "cocoapods":
      // Swift: import Module
      return new RegExp(`^import\\s+${escaped}`, "m");

    case "pub":
      // Dart: import 'package:pkg/...'
      return new RegExp(`import\\s+['"]package:${escaped}\\/`);

    case "conan":
      // C/C++: #include <header> or #include "header"
      // Match package name as part of the include path (case-insensitive)
      return new RegExp(`#include\\s+[<"]${escaped}(?:\\/[^>"]*)?[>"]`, "i");
  }
};
