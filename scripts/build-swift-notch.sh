#!/usr/bin/env bash

set -euo pipefail

configuration="${1:-debug}"
if [[ "$configuration" != "debug" && "$configuration" != "release" ]]; then
  echo "Usage: $0 [debug|release]" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Swift notch builds are only supported on macOS." >&2
  exit 1
fi

case "${TAURI_ENV_ARCH:-$(uname -m)}" in
  arm64|aarch64)
    swift_arch="arm64"
    target_triple="aarch64-apple-darwin"
    ;;
  x86_64|x64)
    swift_arch="x86_64"
    target_triple="x86_64-apple-darwin"
    ;;
  *)
    echo "Unsupported Swift notch architecture: ${TAURI_ENV_ARCH:-$(uname -m)}" >&2
    exit 1
    ;;
esac

project_root="$(cd "$(dirname "$0")/.." && pwd)"
package_path="$project_root/native/notch-prototype"
output_dir="$project_root/src-tauri/bin"
output_path="$output_dir/tinybu-notch-$target_triple"
scratch_path="$project_root/src-tauri/swift-build/$configuration-$target_triple"
module_cache="$scratch_path/module-cache"

mkdir -p "$module_cache"
export CLANG_MODULE_CACHE_PATH="$module_cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$module_cache"
swift build --package-path "$package_path" --scratch-path "$scratch_path" --configuration "$configuration" --arch "$swift_arch"
binary_dir="$(swift build --package-path "$package_path" --scratch-path "$scratch_path" --configuration "$configuration" --arch "$swift_arch" --show-bin-path)"

mkdir -p "$output_dir"
install -m 755 "$binary_dir/TinyBuNotchPrototype" "$output_path"
echo "Swift notch sidecar ready: $output_path"
