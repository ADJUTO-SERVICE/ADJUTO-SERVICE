#!/bin/bash
set -euo pipefail
DEVICE=$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["udid"] for values in d["devices"].values() for x in values if x.get("isAvailable") and x["name"].startswith("iPhone")))')
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" build/ios/Build/Products/Debug-iphonesimulator/ADJUTORecorder.app
xcrun simctl launch "$DEVICE" com.adjuto.recorder
sleep 3
xcrun simctl spawn "$DEVICE" launchctl list | awk 'index($0,"com.adjuto.recorder") && $1 ~ /^[0-9]+$/ {ok=1; print} END {exit !ok}'
