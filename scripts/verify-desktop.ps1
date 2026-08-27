param(
	[ValidateRange(1024, 65535)]
	[int]$ConnectorPort = 23119
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "desktop\zotero"
$dist = Join-Path $workspace "desktop\dist\Zotero_win-x64"
$exe = Join-Path $dist "Library.exe"
$xpi = Join-Path $dist "distribution\extensions\research-workspace@tencent-practice.local.xpi"
$expectedCommit = "7132587c2d6d56725debe64908733a8140bc6be3"

$checks = [ordered]@{}
$checks["Zotero 9.0.6 commit"] = (git -C $source rev-parse HEAD).Trim() -eq $expectedCommit
$checks["Windows executable"] = Test-Path $exe
$checks["Bundled native XPI"] = Test-Path $xpi
$addonManifest = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\manifest.json") | ConvertFrom-Json
$extensionsRegistry = Join-Path $workspace "desktop\profile\extensions.json"
$registeredAddon = if (Test-Path $extensionsRegistry) {
	(Get-Content -Raw $extensionsRegistry | ConvertFrom-Json).addons |
		Where-Object id -eq "research-workspace@tencent-practice.local"
} else { $null }
$checks["Built-in Library module enabled"] = [bool]$registeredAddon `
	-and $registeredAddon.active `
	-and !$registeredAddon.userDisabled `
	-and !$registeredAddon.appDisabled `
	-and $registeredAddon.version -eq $addonManifest.version
$checks["Plugin manifest"] = Test-Path (Join-Path $workspace "desktop\addons\research-workspace\manifest.json")
$bootstrap = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\bootstrap.js")
$checks["Plugin lifecycle"] = $bootstrap -match "startup" -and $bootstrap -match "shutdown"
$profilePrefs = Join-Path $workspace "desktop\profile\prefs.js"
$profilePrefsText = if (Test-Path $profilePrefs) { Get-Content -Raw $profilePrefs } else { "" }
$checks["Bundled XPI executed"] = $profilePrefsText -match 'researchWorkspace\.startedVersion'
$checks["Native plugin surfaces initialized"] = $profilePrefsText -match 'researchWorkspace\.lastReadyVersion'
$preferencesSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences.js")
$preferencesMarkup = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences.xhtml")
$appearanceSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\research-workspace.js")
$aiViewSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-view.js")
$aiProviderSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-provider.js")
$aiRepositorySource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-conversation.js")
$aiContextSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-context.js")
$checks["Zen-style custom theme editor"] = $preferencesSource -match 'themeConfig' `
	-and $preferencesSource -match 'draggingPointID' `
	-and $preferencesMarkup -match 'theme-opacity' `
	-and $preferencesMarkup -match 'theme-texture' `
	-and $appearanceSource -match 'buildGradient'
$checks["Persistent Library AI view"] = $aiViewSource -match 'class LibraryAIViewHost' `
	-and $aiViewSource -match 'zotero-context-pane' `
	-and $aiViewSource -match 'library-ai-composer' `
	-and $aiViewSource -match 'aiViewWidth' `
	-and $appearanceSource -notmatch 'registerSection' `
	-and $appearanceSource -notmatch 'installAIButtonBridge' `
	-and $appearanceSource -notmatch 'toggleAIOverlay'
$checks["AI conversation and provider boundaries"] = $aiRepositorySource -match 'conversations.json' `
	-and $aiRepositorySource -match 'IOUtils.move' `
	-and $aiProviderSource -match 'chat/completions' `
	-and $aiProviderSource -match 'getReader' `
	-and $aiContextSource -match 'mineru.json' `
	-and $aiContextSource -match 'getItemCacheFile'
$checks["AI settings live in sidebar"] = $aiViewSource -match 'save-settings' `
	-and $aiProviderSource -match 'library-ai://model' `
	-and $preferencesMarkup -notmatch 'ai-api-key'
$checks["AI credential storage API"] = $aiProviderSource -match 'Components\.interfaces\.nsILoginInfo' `
	-and $aiProviderSource -match 'addLoginAsync' `
	-and $aiProviderSource -notmatch 'Components\.Constructor\([^\r\n]+,\s*"nsILoginInfo"'
$checks["AI source picker"] = $aiViewSource -match 'selectItemsDialog\.xhtml' `
	-and $aiViewSource -match 'onlyRegularItems:\s*true' `
	-and $aiViewSource -match 'multiSelect:\s*true' `
	-and $aiViewSource -match 'conversation\.sources\.push'
$checks["Native annotations preserved (sidenotes removed)"] = $appearanceSource -notmatch 'renderSidenoteSidebar' `
	-and $appearanceSource -notmatch 'annotationDisplayMode' `
	-and $appearanceSource -notmatch 'library-sidenotes' `
	-and $appearanceSource -notmatch 'renderToolbar'
$checks["Reader AI selection hooks"] = $appearanceSource -match 'renderTextSelectionPopup' `
	-and $appearanceSource -match 'addReaderSelection' `
	-and $appearanceSource -match 'addAreaReference'
$checks["AI reference chips + clipboard monitor"] = $aiViewSource -match 'data-role="references"' `
	-and $aiViewSource -match 'startClipboardMonitor' `
	-and $aiViewSource -match 'nsIClipboard' `
	-and $aiRepositorySource -match 'references'
$aiCommandsSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-commands.js")
$aiStyleSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\style.css")
$checks["AI slash commands (Claudian-style)"] = $bootstrap -match 'ai-commands\.js' `
	-and $aiCommandsSource -match 'class LibraryAISlashCommands' `
	-and $aiCommandsSource -match 'matchTrigger' `
	-and $aiCommandsSource -match '\$ARGUMENTS' `
	-and $aiCommandsSource -match 'loadUserCommands' `
	-and $aiViewSource -match 'updateSlashDropdown' `
	-and $aiViewSource -match 'handleSlashKeydown' `
	-and $aiViewSource -match 'data-role="slash"' `
	-and $aiStyleSource -match 'library-ai-slash-item'
$sectionSource = Get-Content -Raw (Join-Path $source "chrome\content\zotero\elements\itemPaneSection.js")
$checks["ItemPane compatibility fix"] = $sectionSource -match "if \(!this\.initialized\)"

try {
	$status = & curl.exe --silent --max-time 2 --output NUL --write-out "%{http_code}" "http://127.0.0.1:$ConnectorPort/connector/ping"
	$listener = Get-NetTCPConnection -LocalPort $ConnectorPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
	$owner = if ($listener) { Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue } else { $null }
	$checks["Connector Server (this product)"] = $LASTEXITCODE -eq 0 -and $status -eq "200" -and $owner -and $owner.Path -eq $exe
}
catch {
	$checks["Connector Server (this product)"] = $false
}

$checks.GetEnumerator() | ForEach-Object {
	$color = if ($_.Value) { "Green" } else { "Red" }
	$mark = if ($_.Value) { "PASS" } else { "FAIL" }
	Write-Host "[$mark] $($_.Key)" -ForegroundColor $color
}

if ($checks.Values -contains $false) {
	throw "桌面兼容验收未全部通过。若仅 Connector Server 失败，请先运行 npm run desktop:run。"
}

Write-Host "桌面内核、XPI 与 Connector 验收通过。" -ForegroundColor Green
