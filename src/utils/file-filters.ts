import { isSecondaryPath } from "./file-index";

/** Returns true if the filename looks like a test/spec file. */
export const isTestFile = (name: string, relativePath?: string): boolean => {
  if (
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name.endsWith("_test.go") ||
    name.startsWith("test_") ||
    name.endsWith("_test.py") ||
    name.endsWith("_test.exs") ||
    name.endsWith("_test.rs")
  )
    return true;
  // Directory-based check (tests/, __tests__, fixtures, etc.)
  if (relativePath && isSecondaryPath(relativePath)) return true;
  return false;
};

/** Returns true if the file appears to be auto-generated code. */
export const isGeneratedFile = (
  name: string,
  relativePath: string,
): boolean => {
  // Common generated file markers in name
  if (
    name.includes(".gen.") ||
    name.includes(".generated.") ||
    name.includes(".Designer.")
  )
    return true;
  // Protobuf generated files
  if (name.endsWith(".pb.go") || name.endsWith(".pb.ts")) return true;
  // Source generator outputs (.NET, Dart)
  if (name.endsWith(".g.cs") || name.endsWith(".g.dart")) return true;
  // Database migration directories
  if (
    relativePath.includes("/Migrations/") ||
    relativePath.includes("/migrations/")
  )
    return true;
  return false;
};
