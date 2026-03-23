#!/bin/sh
set -eu

print_usage() {
  cat <<'USAGE' >&2
Usage: install-repo-scanner.sh --version-url <url> [--bundle-version <version>]
   or: install-repo-scanner.sh --bundle-url <url> --bundle-sha256 <sha256> [--bundle-version <version>]

Modes:
  --version-url      HTTPS URL to version.json; platform is auto-detected.
                     Requires python3 to parse version.json.

  --bundle-url       HTTPS URL to scanner-tools-bundle-{platform}.tar.gz (explicit)
  --bundle-sha256    Expected SHA-256 digest of the bundle archive (explicit)

Optional:
  --bundle-version   Cache/install key; defaults to sha-<first16>
USAGE
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

bundle_url=""
bundle_sha256=""
bundle_version=""
version_url=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-url)
      shift
      [ "$#" -gt 0 ] || fail "Missing value for --bundle-url"
      bundle_url="$1"
      ;;
    --bundle-sha256)
      shift
      [ "$#" -gt 0 ] || fail "Missing value for --bundle-sha256"
      bundle_sha256="$1"
      ;;
    --bundle-version)
      shift
      [ "$#" -gt 0 ] || fail "Missing value for --bundle-version"
      bundle_version="$1"
      ;;
    --version-url)
      shift
      [ "$#" -gt 0 ] || fail "Missing value for --version-url"
      version_url="$1"
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

[ -n "$bundle_url" ] || [ -n "$version_url" ] || fail "--version-url or (--bundle-url and --bundle-sha256) is required"

# ---------------------------------------------------------------------------
# Platform detection (used when --version-url is provided)
# ---------------------------------------------------------------------------

detect_platform() {
  _os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  _arch="$(uname -m)"
  case "$_os" in
    linux)
      case "$_arch" in
        x86_64)
          if grep -qw 'avx2' /proc/cpuinfo 2>/dev/null; then
            printf 'bun-linux-x64'
          else
            printf 'bun-linux-x64-baseline'
          fi
          ;;
        aarch64|arm64)
          printf 'bun-linux-arm64'
          ;;
        *)
          fail "Unsupported architecture: $_arch"
          ;;
      esac
      ;;
    darwin)
      case "$_arch" in
        x86_64)
          if [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null)" = "1" ]; then
            printf 'bun-darwin-x64'
          else
            printf 'bun-darwin-x64-baseline'
          fi
          ;;
        arm64)
          printf 'bun-darwin-arm64'
          ;;
        *)
          fail "Unsupported architecture: $_arch"
          ;;
      esac
      ;;
    *)
      fail "Unsupported OS: $_os"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Resolve bundle URL + checksum from version.json (--version-url mode)
# ---------------------------------------------------------------------------

if [ -n "$version_url" ] && [ -z "$bundle_url" ]; then
  case "$version_url" in
    https://*) ;;
    *) fail "--version-url must use HTTPS" ;;
  esac

  command -v python3 >/dev/null 2>&1 || fail "python3 is required when using --version-url"
  command -v curl >/dev/null 2>&1 || fail "curl is required"

  platform="$(detect_platform)"

  # Whitelist-validate the platform string before interpolating into any
  # downstream context (defence-in-depth against unexpected detect_platform output).
  case "$platform" in
    bun-linux-x64|bun-linux-x64-baseline|bun-linux-arm64|\
    bun-darwin-x64|bun-darwin-x64-baseline|bun-darwin-arm64)
      ;;
    *)
      fail "Unexpected platform value from detect_platform: $platform"
      ;;
  esac

  version_json="$(curl -fsSL --max-time 30 "$version_url")" || fail "Failed to fetch version.json from $version_url"

  # Pass the platform string as a positional argument to the Python interpreter
  # rather than interpolating it into the script body, eliminating injection risk.
  # Single invocation extracts both bundleUrl and bundleChecksum (space-separated).
  resolved="$(printf '%s' "$version_json" | python3 -c '
import json
import sys

platform = sys.argv[1]
data = json.load(sys.stdin)
entry = data.get("platforms", {}).get(platform)
if not entry:
    raise SystemExit("No bundle available for platform: " + platform)
print(entry["bundleUrl"] + " " + entry["bundleChecksum"])
' "$platform")" || fail "Failed to extract bundle info for platform '$platform' from version.json"

  bundle_url="${resolved%% *}"
  bundle_sha256="${resolved#* }"
fi

# ---------------------------------------------------------------------------
# Validate resolved bundle URL + checksum
# ---------------------------------------------------------------------------

[ -n "$bundle_url" ] || fail "--bundle-url is required (or provide --version-url)"
[ -n "$bundle_sha256" ] || fail "--bundle-sha256 is required (or provide --version-url)"

case "$bundle_url" in
  https://*) ;;
  *) fail "--bundle-url must use HTTPS" ;;
esac

printf "%s" "$bundle_sha256" | grep -Eq "^[a-fA-F0-9]{64}$" ||
  fail "--bundle-sha256 must be a 64-character hex digest"

normalized_sha="$(printf '%s' "$bundle_sha256" | tr 'A-F' 'a-f')"

if [ -z "$bundle_version" ]; then
  bundle_version="sha-$(printf '%s' "$normalized_sha" | cut -c 1-16)"
fi

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

if command -v sha256sum >/dev/null 2>&1; then
  compute_sha256() {
    sha256sum "$1" | awk '{print $1}'
  }
elif command -v shasum >/dev/null 2>&1; then
  compute_sha256() {
    shasum -a 256 "$1" | awk '{print $1}'
  }
else
  fail "sha256sum or shasum is required"
fi

cache_root="${REPO_SCANNER_CACHE_ROOT:-$HOME/.cache/codegene/scanner-tools}"
install_root="${REPO_SCANNER_INSTALL_ROOT:-$HOME/.local/share/codegene/scanner-tools}"
bin_root="${REPO_SCANNER_BIN_ROOT:-$HOME/.local/bin}"
archive_path="$cache_root/${bundle_version}.tar.gz"
tmp_archive_path="${archive_path}.tmp"
target_dir="$install_root/$bundle_version"

mkdir -p "$cache_root" "$install_root" "$bin_root"

if [ -s "$archive_path" ]; then
  existing_sha="$(compute_sha256 "$archive_path")"
  if [ "$existing_sha" != "$normalized_sha" ]; then
    rm -f "$archive_path"
  fi
fi

if [ ! -s "$archive_path" ]; then
  rm -f "$tmp_archive_path"
  curl -fsSL --max-time 300 "$bundle_url" -o "$tmp_archive_path"
  mv "$tmp_archive_path" "$archive_path"
fi

actual_sha="$(compute_sha256 "$archive_path")"
if [ "$actual_sha" != "$normalized_sha" ]; then
  fail "scanner tools bundle checksum mismatch"
fi

# This POSIX shell installer only supports Linux and macOS; detect_platform()
# above rejects any other OS.  The bundle therefore always contains a POSIX
# binary at bin/repo-scanner (no .exe suffix needed).
if [ ! -x "$target_dir/bin/repo-scanner" ]; then
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  tar -xzf "$archive_path" -C "$target_dir" --strip-components=1
fi

[ -x "$target_dir/bin/repo-scanner" ] || fail "repo-scanner binary missing after extraction"
ln -sf "$target_dir/bin/repo-scanner" "$bin_root/repo-scanner"
[ -x "$bin_root/repo-scanner" ] || fail "repo-scanner symlink verification failed"
"$bin_root/repo-scanner" --help >/dev/null 2>&1 || fail "repo-scanner executable validation failed"
