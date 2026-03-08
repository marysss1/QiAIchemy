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

DEVICE_QUERY=""
LIST_DEVICES=0
SKIP_INSTALL=0
SKIP_EXPORT=0
SKIP_LAUNCH=0
CLEAN_BUILD=0
ARCHIVE_PATH=""
EXPORT_PATH=""
REUSE_ARCHIVE_PATH=""

usage() {
  cat <<'EOF'
Usage: scripts/ios-release-device.sh [options]

Build a signed iPhone Release app without Metro, optionally install it on a
connected iPhone, launch it, and export an .ipa.

Options:
  --device <name|udid|identifier>  Target device. Defaults to the first connected iPhone.
  --list-devices                   Print connected/paired iPhone devices and exit.
  --archive-path <path>            Custom .xcarchive output path.
  --reuse-archive <path>           Reuse an existing .xcarchive and skip the build step.
  --export-path <path>             Custom export directory for the .ipa.
  --derived-data <path>            Custom DerivedData path.
  --skip-install                   Build/archive/export only. Do not install on device.
  --skip-export                    Build/archive/install only. Do not export .ipa.
  --no-launch                      Do not auto-launch the app after install.
  --clean                          Remove previous archive/export/DerivedData before building.
  -h, --help                       Show this help.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

list_devices() {
  local tmp_json
  tmp_json="$(mktemp /tmp/qialchemy-devices.XXXXXX.json)"
  xcrun devicectl list devices --json-output "$tmp_json" >/dev/null

  node - "$tmp_json" <<'NODE'
const fs = require('fs');
const jsonPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const devices = (data.result?.devices ?? [])
  .filter((device) => device.hardwareProperties?.platform === 'iOS')
  .filter((device) => device.hardwareProperties?.deviceType === 'iPhone')
  .map((device) => {
    const cp = device.connectionProperties ?? {};
    const dp = device.deviceProperties ?? {};
    const hp = device.hardwareProperties ?? {};
    const connected = dp.bootState === 'booted' || cp.transportType === 'wired' || cp.transportType === 'localNetwork';
    return {
      name: dp.name ?? 'Unknown',
      model: hp.marketingName ?? hp.productType ?? 'Unknown',
      udid: hp.udid ?? '-',
      identifier: device.identifier ?? '-',
      osVersion: dp.osVersionNumber ?? '-',
      connected,
      pairingState: cp.pairingState ?? 'unknown',
    };
  })
  .sort((left, right) => {
    if (left.connected !== right.connected) {
      return left.connected ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

for (const device of devices) {
  const state = device.connected ? 'connected' : 'offline';
  console.log(`${state}\t${device.name}\t${device.model}\tiOS ${device.osVersion}\t${device.udid}\t${device.identifier}\t${device.pairingState}`);
}
NODE

  rm -f "$tmp_json"
}

resolve_device() {
  local tmp_json
  tmp_json="$(mktemp /tmp/qialchemy-device.XXXXXX.json)"
  xcrun devicectl list devices --json-output "$tmp_json" >/dev/null

  node - "$tmp_json" "$DEVICE_QUERY" <<'NODE'
const fs = require('fs');
const jsonPath = process.argv[2];
const query = (process.argv[3] ?? '').trim().toLowerCase();
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const devices = (data.result?.devices ?? [])
  .filter((device) => device.hardwareProperties?.platform === 'iOS')
  .filter((device) => device.hardwareProperties?.deviceType === 'iPhone')
  .map((device) => {
    const cp = device.connectionProperties ?? {};
    const dp = device.deviceProperties ?? {};
    const hp = device.hardwareProperties ?? {};
    return {
      name: dp.name ?? 'Unknown',
      model: hp.marketingName ?? hp.productType ?? 'Unknown',
      udid: hp.udid ?? '',
      identifier: device.identifier ?? '',
      pairingState: cp.pairingState ?? '',
      connected: dp.bootState === 'booted' || cp.transportType === 'wired' || cp.transportType === 'localNetwork',
    };
  });

const connected = devices.filter((device) => device.connected && device.pairingState === 'paired');
const pool = query
  ? devices.filter((device) => {
      const haystacks = [device.name, device.udid, device.identifier, device.model]
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      return haystacks.some((value) => value.includes(query));
    })
  : connected;

const target = (query ? pool.filter((device) => device.connected && device.pairingState === 'paired') : pool)[0];

if (!target) {
  if (query) {
    console.error(`No connected paired iPhone matched "${query}".`);
  } else {
    console.error('No connected paired iPhone found.');
  }
  process.exit(1);
}

console.log(`${target.name}\t${target.udid}\t${target.identifier}\t${target.model}`);
NODE

  rm -f "$tmp_json"
}

create_export_options_plist() {
  local output_path="$1"
  local team_id="$2"

  cat >"$output_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>compileBitcode</key>
  <false/>
  <key>destination</key>
  <string>export</string>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>$team_id</string>
  <key>thinning</key>
  <string>&lt;none&gt;</string>
</dict>
</plist>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE_QUERY="${2:-}"
      shift 2
      ;;
    --list-devices)
      LIST_DEVICES=1
      shift
      ;;
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
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-export)
      SKIP_EXPORT=1
      shift
      ;;
    --no-launch)
      SKIP_LAUNCH=1
      shift
      ;;
    --clean)
      CLEAN_BUILD=1
      shift
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

if [[ "$LIST_DEVICES" -eq 1 ]]; then
  list_devices
  exit 0
fi

if [[ ! -d "$WORKSPACE_PATH" ]]; then
  echo "Workspace not found: $WORKSPACE_PATH" >&2
  exit 1
fi

DEVICE_INFO="$(resolve_device)"
DEVICE_NAME="$(printf '%s' "$DEVICE_INFO" | cut -f1)"
DEVICE_UDID="$(printf '%s' "$DEVICE_INFO" | cut -f2)"
DEVICE_IDENTIFIER="$(printf '%s' "$DEVICE_INFO" | cut -f3)"
DEVICE_MODEL="$(printf '%s' "$DEVICE_INFO" | cut -f4)"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="${ARCHIVE_PATH:-$ARCHIVE_ROOT/QiAlchemy-$TIMESTAMP.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$EXPORT_ROOT/QiAlchemy-$TIMESTAMP}"

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

echo "Target device: $DEVICE_NAME ($DEVICE_MODEL, $DEVICE_UDID)"
echo "Archive path: $ARCHIVE_PATH"
if [[ "$SKIP_EXPORT" -eq 0 ]]; then
  echo "Export path: $EXPORT_PATH"
fi

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

IPA_PATH=""
if [[ "$SKIP_EXPORT" -eq 0 ]]; then
  mkdir -p "$EXPORT_PATH"
  EXPORT_OPTIONS_PLIST="$(mktemp /tmp/qialchemy-export-options.XXXXXX.plist)"
  create_export_options_plist "$EXPORT_OPTIONS_PLIST" "$TEAM_ID"

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
fi

INSTALL_STATUS=0
if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  set +e
  set -x
  xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH"
  INSTALL_STATUS=$?
  set +x
  set -e

  if [[ "$INSTALL_STATUS" -eq 0 && "$SKIP_LAUNCH" -eq 0 ]]; then
    set -x
    xcrun devicectl device process launch --device "$DEVICE_UDID" --terminate-existing "$BUNDLE_ID"
    set +x
  fi
fi

echo
echo "Release build completed."
echo "Device: $DEVICE_NAME ($DEVICE_UDID)"
echo "Bundle ID: $BUNDLE_ID"
echo "Archive: $ARCHIVE_PATH"
if [[ -n "$IPA_PATH" ]]; then
  echo "IPA: $IPA_PATH"
fi
if [[ "$INSTALL_STATUS" -ne 0 ]]; then
  echo "Install: failed"
  echo "Hint: unlock the iPhone and rerun the same command, or use --skip-install if you only need the .ipa."
fi
