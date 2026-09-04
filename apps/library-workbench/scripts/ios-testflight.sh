set -euo pipefail

pnpm ios:release:check   # 发布前检查

# Resolve the installed App Store profile UUID. xcodebuild prefers the env
# value of PROVISIONING_PROFILE_SPECIFIER over the pbxproj setting, but the
# auto-generated ExportOptions.plist (from `tauri ios build --export-method
# app-store-connect`) does not include `provisioningProfiles`, so the export
# step's `IDEDistributionEmbedProfileStep` skips embedding the profile and
# altool rejects the IPA with error 90174. Workaround: run Tauri to produce
# the archive, then re-run `xcodebuild -exportArchive` with an ExportOptions
# that maps the bundle id to the profile UUID.
PROFILE_DIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
PROFILE_PATH="${PROFILE_DIR}/agentero-app-store.mobileprovision"
if [[ ! -f "$PROFILE_PATH" ]]; then
    echo "::error::Provisioning profile not found at ${PROFILE_PATH}" >&2
    echo "Install it from App Store Connect / Xcode first." >&2
    exit 1
fi
PROFILE_UUID=$(security cms -D -i "$PROFILE_PATH" | plutil -extract UUID raw -)
PROFILE_NAME=$(security cms -D -i "$PROFILE_PATH" | plutil -extract Name raw -)
echo "Using provisioning profile: ${PROFILE_NAME} (${PROFILE_UUID})"

APPLE_DEVELOPMENT_TEAM="$APPLE_DEVELOPMENT_TEAM" \
APPLE_API_KEY="$APPLE_API_KEY" \
APPLE_API_ISSUER="$APPLE_API_ISSUER" \
APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY}.p8}" \
PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
pnpm tauri ios build --config src-tauri/tauri.ios.conf.json \
    --target aarch64 --build-number "$(date +%y%m%d%H%M)" \
    --export-method app-store-connect

ARCHIVE="src-tauri/gen/apple/build/agentero_iOS.xcarchive"
EXPORT_PLIST="src-tauri/gen/apple/build/ExportOptions.fixed.plist"

# Tauri's auto-generated ExportOptions.plist omits `provisioningProfiles`,
# so re-run xcodebuild -exportArchive with the missing mapping so the
# distribution pipeline actually embeds the profile in the IPA.
cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>destination</key>
	<string>export</string>
	<key>method</key>
	<string>app-store-connect</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>signingCertificate</key>
	<string>Apple Distribution</string>
	<key>teamID</key>
	<string>${APPLE_DEVELOPMENT_TEAM}</string>
	<key>uploadSymbols</key>
	<true/>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>provisioningProfiles</key>
	<dict>
		<key>com.poco-ai.agentero</key>
		<string>${PROFILE_UUID}</string>
	</dict>
</dict>
</plist>
EOF

xcodebuild -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportPath "src-tauri/gen/apple/build/arm64" \
    -exportOptionsPlist "$EXPORT_PLIST" >/dev/null

IPA="src-tauri/gen/apple/build/arm64/Agentero.ipa"
if ! unzip -l "$IPA" 2>/dev/null | grep -q "embedded.mobileprovision"; then
    echo "::error::embedded.mobileprovision is missing from ${IPA}; refusing to upload." >&2
    exit 1
fi

xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
