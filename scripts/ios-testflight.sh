#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
WORKSPACE_PATH="$IOS_DIR/QiAlchemy.xcworkspace"
SCHEME_NAME="QiAlchemy"
CONFIGURATION="Release"
ARCHIVE_ROOT="$IOS_DIR/build/archive"
EXPORT_ROOT="$IOS_DIR/build/export"
DERIVED_DATA_PATH="$IOS_DIR/build/DerivedData"

ARCHIVE_PATH=""
EXPORT_PATH=""
REUSE_ARCHIVE_PATH=""
CLEAN_BUILD=0
SKIP_UPLOAD=0
INTERNAL_ONLY=0
APPLE_APP_ID=""
ASC_PUBLIC_ID=""
ASC_TEAM_ID=""
API_KEY_ID=""
API_ISSUER_ID=""
API_KEY_PATH=""
ASC_USERNAME=""
PASSWORD_ENV=""
PASSWORD_KEYCHAIN_ITEM=""

usage() {
  cat <<'EOF'
Usage: scripts/ios-testflight.sh [options]

Build a Release archive for TestFlight, export an App Store Connect IPA, and
optionally upload it to App Store Connect.

Options:
  --archive-path <path>            Custom .xcarchive output path.
  --reuse-archive <path>           Reuse an existing archive and skip rebuilding.
  --export-path <path>             Custom export directory.
  --derived-data <path>            Custom DerivedData path.
  --clean                          Remove previous derived data/export output first.
  --skip-upload                    Export IPA only, do not upload.
  --internal-only                  Mark the export as internal TestFlight only.
  --apple-app-id <id>              App Store Connect numeric Apple ID. Needed for modern upload.
  --asc-public-id <id>             Optional App Store Connect provider public id.
  --team-id <id>                   Optional team id for uploads with multiple providers.
  --api-key <id>                   App Store Connect API key id.
  --api-issuer <id>                App Store Connect API issuer id.
  --api-key-path <path>            Full path to AuthKey_<KEYID>.p8.
  --username <email>               Apple ID login for altool upload.
  --password-env <ENV_NAME>        Env var name containing app-specific password.
  --password-keychain <ITEM_NAME>  Keychain item name for altool password.
  -h, --help                       Show this help.

Auth:
  Prefer API key auth: --api-key/--api-issuer/--api-key-path
  Or use Apple ID auth: --username plus --password-env or --password-keychain
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

prepare_api_key_for_altool() {
  if [[ -z "$API_KEY_ID" || -z "$API_KEY_PATH" ]]; then
    return
  fi

  local target_dir="$HOME/.appstoreconnect/private_keys"
  local target_path="$target_dir/AuthKey_${API_KEY_ID}.p8"

  mkdir -p "$target_dir"
  cp "$API_KEY_PATH" "$target_path"
}

create_export_options_plist() {
  local output_path="$1"
  local team_id="$2"
  local internal_only="$3"

  cat >"$output_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>generateAppStoreInformation</key>
  <false/>
  <key>manageAppVersionAndBuildNumber</key>
  <true/>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>$team_id</string>
  <key>testFlightInternalTestingOnly</key>
  <$([[ "$internal_only" == "1" ]] && echo true || echo false)/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
}

resolve_auth_args() {
  if [[ -n "$API_KEY_ID" || -n "$API_ISSUER_ID" || -n "$API_KEY_PATH" ]]; then
    if [[ -z "$API_KEY_ID" || -z "$API_ISSUER_ID" || -z "$API_KEY_PATH" ]]; then
      echo "API key auth requires --api-key, --api-issuer, and --api-key-path together." >&2
      exit 1
    fi
    if [[ ! -f "$API_KEY_PATH" ]]; then
      echo "API key file not found: $API_KEY_PATH" >&2
      exit 1
    fi
    export API_PRIVATE_KEYS_DIR
    API_PRIVATE_KEYS_DIR="$(dirname "$API_KEY_PATH")"
    printf -- "--apiKey\t%s\n--apiIssuer\t%s\n" "$API_KEY_ID" "$API_ISSUER_ID"
    return
  fi

  if [[ -z "$ASC_USERNAME" ]]; then
    echo "Upload requires auth. Use API key auth or --username with password." >&2
    exit 1
  fi

  if [[ -n "$PASSWORD_ENV" ]]; then
    if [[ -z "${!PASSWORD_ENV:-}" ]]; then
      echo "Environment variable $PASSWORD_ENV is empty or unset." >&2
      exit 1
    fi
    printf -- "--username\t%s\n--password\t@env:%s\n" "$ASC_USERNAME" "$PASSWORD_ENV"
    return
  fi

  if [[ -n "$PASSWORD_KEYCHAIN_ITEM" ]]; then
    printf -- "--username\t%s\n--password\t@keychain:%s\n" "$ASC_USERNAME" "$PASSWORD_KEYCHAIN_ITEM"
    return
  fi

  echo "Apple ID auth requires --password-env or --password-keychain." >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive-path)
      ARCHIVE_PATH="${2:-}"
      shift 2
      ;;
    --reuse-archive)
      REUSE_ARCHIVE_PATH="${2:-}"
      shift 2
      ;;
    --export-path)
      EXPORT_PATH="${2:-}"
      shift 2
      ;;
    --derived-data)
      DERIVED_DATA_PATH="${2:-}"
      shift 2
      ;;
    --clean)
      CLEAN_BUILD=1
      shift
      ;;
    --skip-upload)
      SKIP_UPLOAD=1
      shift
      ;;
    --internal-only)
      INTERNAL_ONLY=1
      shift
      ;;
    --apple-app-id)
      APPLE_APP_ID="${2:-}"
      shift 2
      ;;
    --asc-public-id)
      ASC_PUBLIC_ID="${2:-}"
      shift 2
      ;;
    --team-id)
      ASC_TEAM_ID="${2:-}"
      shift 2
      ;;
    --api-key)
      API_KEY_ID="${2:-}"
      shift 2
      ;;
    --api-issuer)
      API_ISSUER_ID="${2:-}"
      shift 2
      ;;
    --api-key-path)
      API_KEY_PATH="${2:-}"
      shift 2
      ;;
    --username)
      ASC_USERNAME="${2:-}"
      shift 2
      ;;
    --password-env)
      PASSWORD_ENV="${2:-}"
      shift 2
      ;;
    --password-keychain)
      PASSWORD_KEYCHAIN_ITEM="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command xcodebuild
require_command xcrun
require_command node
require_command /usr/libexec/PlistBuddy
prepare_api_key_for_altool

if [[ ! -d "$WORKSPACE_PATH" ]]; then
  echo "Workspace not found: $WORKSPACE_PATH" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="${ARCHIVE_PATH:-$ARCHIVE_ROOT/QiAlchemy-testflight-$TIMESTAMP.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$EXPORT_ROOT/QiAlchemy-testflight-$TIMESTAMP}"

if [[ -n "$REUSE_ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH="$REUSE_ARCHIVE_PATH"
fi

TEAM_ID="$(
  xcodebuild -workspace "$WORKSPACE_PATH" -scheme "$SCHEME_NAME" -configuration "$CONFIGURATION" -showBuildSettings |
    awk -F' = ' '/DEVELOPMENT_TEAM = / { print $2; exit }'
)"

if [[ -z "$TEAM_ID" ]]; then
  echo "Unable to determine DEVELOPMENT_TEAM from Xcode build settings." >&2
  exit 1
fi

if [[ "$CLEAN_BUILD" -eq 1 ]]; then
  rm -rf "$DERIVED_DATA_PATH" "$EXPORT_PATH"
  if [[ -z "$REUSE_ARCHIVE_PATH" ]]; then
    rm -rf "$ARCHIVE_PATH"
  fi
fi

mkdir -p "$ARCHIVE_ROOT" "$EXPORT_ROOT" "$DERIVED_DATA_PATH"

echo "Archive path: $ARCHIVE_PATH"
echo "Export path: $EXPORT_PATH"

if [[ -z "$REUSE_ARCHIVE_PATH" ]]; then
  set -x
  xcodebuild \
    -workspace "$WORKSPACE_PATH" \
    -scheme "$SCHEME_NAME" \
    -configuration "$CONFIGURATION" \
    -destination "generic/platform=iOS" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    -archivePath "$ARCHIVE_PATH" \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    archive
  set +x
fi

APP_PATH="$ARCHIVE_PATH/Products/Applications/$SCHEME_NAME.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app bundle not found: $APP_PATH" >&2
  exit 1
fi

BUNDLE_ID="$(
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist"
)"
BUNDLE_VERSION="$(
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Info.plist"
)"
SHORT_VERSION="$(
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Info.plist"
)"

mkdir -p "$EXPORT_PATH"
EXPORT_OPTIONS_PLIST="$(mktemp /tmp/qialchemy-testflight-export.XXXXXX.plist)"
create_export_options_plist "$EXPORT_OPTIONS_PLIST" "$TEAM_ID" "$INTERNAL_ONLY"

set -x
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  -allowProvisioningUpdates
set +x

rm -f "$EXPORT_OPTIONS_PLIST"

IPA_PATH="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' -print | head -n 1)"
if [[ -z "$IPA_PATH" ]]; then
  echo "No IPA found in export directory: $EXPORT_PATH" >&2
  exit 1
fi

if [[ "$SKIP_UPLOAD" -eq 0 ]]; then
  AUTH_ARGS=()
  while IFS=$'\t' read -r auth_flag auth_value; do
    AUTH_ARGS+=("$auth_flag" "$auth_value")
  done < <(resolve_auth_args)

  UPLOAD_CMD=(xcrun altool --output-format json)
  if [[ -n "$APPLE_APP_ID" ]]; then
    UPLOAD_CMD+=(
      --upload-package "$IPA_PATH"
      --type ios
      --apple-id "$APPLE_APP_ID"
      --bundle-id "$BUNDLE_ID"
      --bundle-version "$BUNDLE_VERSION"
      --bundle-short-version-string "$SHORT_VERSION"
    )
  else
    UPLOAD_CMD+=(
      --upload-app
      -f "$IPA_PATH"
      -t ios
    )
  fi

  if [[ -n "$ASC_PUBLIC_ID" ]]; then
    UPLOAD_CMD+=(--asc-public-id "$ASC_PUBLIC_ID")
  fi
  if [[ -n "$ASC_TEAM_ID" ]]; then
    UPLOAD_CMD+=(--team-id "$ASC_TEAM_ID")
  fi

  for ((i = 0; i < ${#AUTH_ARGS[@]}; i += 2)); do
    UPLOAD_CMD+=("${AUTH_ARGS[i]}" "${AUTH_ARGS[i + 1]}")
  done

  set -x
  "${UPLOAD_CMD[@]}"
  set +x
fi

echo
echo "TestFlight export completed."
echo "Bundle ID: $BUNDLE_ID"
echo "Version: $SHORT_VERSION ($BUNDLE_VERSION)"
echo "Archive: $ARCHIVE_PATH"
echo "IPA: $IPA_PATH"
if [[ "$SKIP_UPLOAD" -eq 0 ]]; then
  echo "Upload: submitted to App Store Connect"
else
  echo "Upload: skipped"
fi
