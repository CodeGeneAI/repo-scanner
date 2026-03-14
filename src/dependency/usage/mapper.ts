/**
 * Known package name to import name mappings for ecosystems where they differ.
 * Key: "ecosystem:package-name", Value: import name.
 */
const KNOWN_MAPPINGS: Record<string, string> = {
  // Python - common mismatches
  "pypi:Pillow": "PIL",
  "pypi:pillow": "PIL",
  "pypi:scikit-learn": "sklearn",
  "pypi:beautifulsoup4": "bs4",
  "pypi:PyYAML": "yaml",
  "pypi:pyyaml": "yaml",
  "pypi:python-dateutil": "dateutil",
  "pypi:python-dotenv": "dotenv",
  "pypi:opencv-python": "cv2",
  "pypi:opencv-python-headless": "cv2",
  "pypi:attrs": "attr",

  // npm - less common but exists
  "npm:lodash.merge": "lodash.merge",
};

/**
 * Get the import name for a package. Falls back to normalized package name.
 */
export const getImportName = (
  ecosystem: string,
  packageName: string,
): string => {
  const key = `${ecosystem}:${packageName}`;
  const mapped = KNOWN_MAPPINGS[key];
  if (mapped) return mapped;

  // Ecosystem-specific normalization
  switch (ecosystem) {
    case "pypi":
      // PEP 503: normalize hyphens to underscores, lowercase
      return packageName.toLowerCase().replace(/-/g, "_");
    case "cargo":
      // Rust crate names: hyphens become underscores
      return packageName.replace(/-/g, "_");
    default:
      return packageName;
  }
};
