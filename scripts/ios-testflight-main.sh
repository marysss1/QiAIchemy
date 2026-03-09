#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"

API_KEY_ID="${ASC_API_KEY_ID:-4VS7NZVCFA}"
API_ISSUER_ID="${ASC_API_ISSUER_ID:-590bec0d-08a1-4bce-a80d-86179b48f117}"
APPLE_APP_ID="${ASC_APPLE_APP_ID:-6760257404}"
API_KEY_PATH="${ASC_API_KEY_PATH:-$HOME/Downloads/AuthKey_${API_KEY_ID}.p8}"

BUILD_NUMBER=""
ALLOW_NON_MAIN=0
PASS_THROUGH=()

usage() {
  cat <<'EOF'
Usage: scripts/ios-testflight-main.sh [options] [-- extra ios-testflight.sh args]

Increment the iOS build number on main, then upload a new TestFlight build.

Options:
  --build-number <n>   Use an explicit build number instead of auto-incrementing.
  --allow-non-main     Allow running from a branch other than main.
  -h, --help           Show this help.

Environment:
  ASC_API_KEY_ID       App Store Connect API key id.
  ASC_API_ISSUER_ID    App Store Connect API issuer id.
  ASC_API_KEY_PATH     Full path to AuthKey_<KEYID>.p8.
  ASC_APPLE_APP_ID     Numeric Apple App ID.

Examples:
  npm run ios:testflight:main
  npm run ios:testflight:main -- --internal-only
  npm run ios:testflight:main -- --skip-upload
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-number)
      BUILD_NUMBER="${2:-}"
      shift 2
      ;;
    --allow-non-main)
      ALLOW_NON_MAIN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PASS_THROUGH+=("$@")
      break
      ;;
    *)
      PASS_THROUGH+=("$1")
      shift
      ;;
  esac
done

require_command git
require_command xcrun

CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current)"
if [[ "$ALLOW_NON_MAIN" -ne 1 && "$CURRENT_BRANCH" != "main" ]]; then
  echo "Refusing to run from branch '$CURRENT_BRANCH'. Switch to 'main' or use --allow-non-main." >&2
  exit 1
fi

if [[ ! -f "$API_KEY_PATH" ]]; then
  echo "API key file not found: $API_KEY_PATH" >&2
  echo "Set ASC_API_KEY_PATH or place AuthKey_${API_KEY_ID}.p8 in ~/Downloads." >&2
  exit 1
fi

CURRENT_BUILD="$(
  cd "$IOS_DIR" &&
    xcrun agvtool what-version -terse | tail -n 1 | tr -d '[:space:]'
)"

if [[ -z "$CURRENT_BUILD" || ! "$CURRENT_BUILD" =~ ^[0-9]+$ ]]; then
  echo "Unable to determine current build number. Got: '$CURRENT_BUILD'" >&2
  exit 1
fi

if [[ -z "$BUILD_NUMBER" ]]; then
  BUILD_NUMBER=$((CURRENT_BUILD + 1))
fi

if [[ ! "$BUILD_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Build number must be numeric. Got: '$BUILD_NUMBER'" >&2
  exit 1
fi

echo "Branch: $CURRENT_BRANCH"
echo "Current build: $CURRENT_BUILD"
echo "Next build: $BUILD_NUMBER"

(
  cd "$IOS_DIR"
  xcrun agvtool new-version -all "$BUILD_NUMBER" >/dev/null
)

echo "Updated project build number to $BUILD_NUMBER."

exec bash "$ROOT_DIR/scripts/ios-testflight.sh" \
  --clean \
  --api-key "$API_KEY_ID" \
  --api-issuer "$API_ISSUER_ID" \
  --api-key-path "$API_KEY_PATH" \
  --apple-app-id "$APPLE_APP_ID" \
  "${PASS_THROUGH[@]}"
