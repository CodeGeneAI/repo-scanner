#!/bin/sh
set -eu

print_usage() {
  cat <<'USAGE' >&2
Usage: install-repo-scanner.sh --bundle-url <url> --bundle-sha256 <sha256> [--bundle-version <version>]

Required:
  --bundle-url       HTTPS URL to scanner-tools-bundle.tar.gz
  --bundle-sha256    Expected SHA-256 digest of the bundle archive

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

[ -n "$bundle_url" ] || fail "--bundle-url is required"
[ -n "$bundle_sha256" ] || fail "--bundle-sha256 is required"

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
  curl -fsSL "$bundle_url" -o "$tmp_archive_path"
  mv "$tmp_archive_path" "$archive_path"
fi

actual_sha="$(compute_sha256 "$archive_path")"
if [ "$actual_sha" != "$normalized_sha" ]; then
  fail "scanner tools bundle checksum mismatch"
fi

if [ ! -x "$target_dir/bin/repo-scanner" ]; then
  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  tar -xzf "$archive_path" -C "$target_dir" --strip-components=1
fi

[ -x "$target_dir/bin/repo-scanner" ] || fail "repo-scanner binary missing after extraction"
ln -sf "$target_dir/bin/repo-scanner" "$bin_root/repo-scanner"
command -v repo-scanner >/dev/null 2>&1 || fail "repo-scanner symlink verification failed"
repo-scanner --help >/dev/null 2>&1 || fail "repo-scanner executable validation failed"
