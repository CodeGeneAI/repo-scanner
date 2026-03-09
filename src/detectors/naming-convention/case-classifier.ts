import type { CaseStyle } from "./types";

/**
 * Classify a name into a case style.
 * Returns undefined for names that are too short or ambiguous to classify.
 */
export const classifyCase = (name: string): CaseStyle | undefined => {
  // Strip file extension if present
  const dotIdx = name.lastIndexOf(".");
  let clean = dotIdx > 0 ? name.slice(0, dotIdx) : name;

  // Strip leading underscores (e.g., _private, __dirname) before classifying
  clean = clean.replace(/^_+/, "");

  // Skip names that are too short or purely numeric
  if (clean.length < 2) return undefined;
  if (/^\d+$/.test(clean)) return undefined;

  // SCREAMING_SNAKE_CASE: all uppercase — require underscore OR 4+ chars
  // Short all-caps words (2-3 chars like "FS", "DB", "API") are ambiguous
  // (could be PascalCase abbreviation in Go, or a constant)
  if (/^[A-Z][A-Z0-9_]*$/.test(clean)) {
    if (clean.includes("_") || clean.length >= 4) {
      return "SCREAMING_SNAKE_CASE";
    }
    // Short all-caps without underscore — too ambiguous to classify
    return undefined;
  }

  // Contains hyphen with lowercase letters → kebab-case
  if (clean.includes("-") && /[a-z]/.test(clean)) {
    return "kebab-case";
  }

  // Contains underscore with lowercase letters → snake_case
  if (clean.includes("_") && /[a-z]/.test(clean)) {
    return "snake_case";
  }

  // PascalCase: starts with uppercase, contains at least one lowercase
  if (/^[A-Z]/.test(clean) && /[a-z]/.test(clean)) {
    // Distinguish PascalCase from just a capitalized word
    // PascalCase has a lowercase→uppercase boundary OR starts upper and has lowercase
    return "PascalCase";
  }

  // camelCase: starts with lowercase, contains at least one uppercase
  if (/^[a-z]/.test(clean) && /[A-Z]/.test(clean)) {
    return "camelCase";
  }

  // flatcase: all lowercase, no separators
  if (/^[a-z][a-z0-9]*$/.test(clean)) {
    return "flatcase";
  }

  return "mixed";
};
