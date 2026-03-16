// These have different operators and keywords in key positions
// Even after normalization they should differ structurally

export function validateAge(input: unknown): boolean {
  if (typeof input !== "number") {
    return false;
  }
  if (input < 0 || input > 150) {
    return false;
  }
  return Number.isInteger(input);
}

export function validateName(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("Name must be a string");
  }
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    throw new Error("Name too short");
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
