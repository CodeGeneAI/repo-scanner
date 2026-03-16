function validateEmail(input) {
  if (!input || input.length === 0) {
    return false;
  }
  const parts = input.split("@");
  if (parts.length !== 2) {
    return false;
  }
  const domain = parts[1];
  if (!domain || domain.length === 0) {
    return false;
  }
  if (domain.indexOf(".") === -1) {
    return false;
  }
  return true;
}
