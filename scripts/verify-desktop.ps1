param(
	[ValidateRange(1024, 65535)]
	[int]$ConnectorPort = 23119,
	[string]$ProfileDirectory = ""
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "desktop\zotero"
$dist = Join-Path $workspace "desktop\dist\Zotero_win-x64"
$profile = if ($ProfileDirectory) {
	[System.IO.Path]::GetFullPath($ProfileDirectory)
} else {
	Join-Path $workspace "desktop\profile"
}
$exe = Join-Path $dist "Library.exe"
$xpi = Join-Path $dist "distribution\extensions\research-workspace@tencent-practice.local.xpi"
$translationLockPath = Join-Path $workspace "desktop\third-party\translate-for-zotero.lock.json"
$translationNoticePath = Join-Path $workspace "desktop\third-party\translate-for-zotero-NOTICE.md"
$translationLock = Get-Content -Raw $translationLockPath | ConvertFrom-Json
$translationXpi = Join-Path $dist "distribution\extensions\$($translationLock.addonId).xpi"
$translationLicenseDirectory = Join-Path $dist "distribution\licenses\translate-for-zotero"
$notesLockPath = Join-Path $workspace "desktop\third-party\better-notes.lock.json"
$notesLock = Get-Content -Raw $notesLockPath | ConvertFrom-Json
$updatePolicyPath = Join-Path $dist "distribution\policies.json"
$expectedCommit = "7132587c2d6d56725debe64908733a8140bc6be3"

& (Join-Path $PSScriptRoot "verify-library-notes-addon.ps1") -DistributionRoot $dist

function Get-Sha256([string]$Path) {
	$stream = [System.IO.File]::OpenRead($Path)
	$sha256 = [System.Security.Cryptography.SHA256]::Create()
	try {
		return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
	}
	finally {
		$sha256.Dispose()
		$stream.Dispose()
	}
}

$checks = [ordered]@{}
$checks["Zotero 9.0.6 commit"] = (git -C $source rev-parse HEAD).Trim() -eq $expectedCommit
$checks["Windows executable"] = Test-Path $exe
$aboutSource = Get-Content -Raw (Join-Path $source "chrome\content\zotero\about.xhtml")
$aboutStyle = Get-Content -Raw (Join-Path $source "scss\about.scss")
$checks["Library About dialog source branding"] = $aboutSource -match 'id="library-brand"' `
	-and $aboutSource -match 'Library \$\{coreVersion\}' `
	-and $aboutSource -match 'github\.com/user-A100/Library' `
	-and $aboutSource -notmatch 'chrome://zotero/skin/zotero\.svg' `
	-and $aboutSource -notmatch 'ZOTERO_CONFIG\.PRODUCER' `
	-and $aboutStyle -match '#library-wordmark'
$appOmniPath = Join-Path $dist "app\omni.ja"
$bundledAboutSource = ""
$bundledAboutStyle = ""
if (Test-Path $appOmniPath) {
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	$archive = [System.IO.Compression.ZipFile]::OpenRead($appOmniPath)
	try {
		foreach ($resource in @(
			@{ Path = "chrome/content/zotero/about.xhtml"; Target = "Source" },
			@{ Path = "chrome/skin/default/zotero/about.css"; Target = "Style" }
		)) {
			$entry = $archive.GetEntry($resource.Path)
			if (!$entry) { continue }
			$reader = [System.IO.StreamReader]::new($entry.Open())
			try {
				if ($resource.Target -eq "Source") { $bundledAboutSource = $reader.ReadToEnd() }
				else { $bundledAboutStyle = $reader.ReadToEnd() }
			}
			finally { $reader.Dispose() }
		}
	}
	finally { $archive.Dispose() }
}
$checks["Bundled Library About dialog branding"] = $bundledAboutSource -match 'id="library-brand"' `
	-and $bundledAboutSource -match 'Library \$\{coreVersion\}' `
	-and $bundledAboutSource -notmatch 'chrome://zotero/skin/zotero\.svg' `
	-and $bundledAboutSource -notmatch 'ZOTERO_CONFIG\.PRODUCER' `
	-and $bundledAboutStyle -match '#library-wordmark'
$updatePolicy = if (Test-Path $updatePolicyPath) {
	Get-Content -Raw $updatePolicyPath | ConvertFrom-Json
} else { $null }
$checks["Upstream application updates disabled"] = [bool]$updatePolicy `
	-and $updatePolicy.policies.DisableAppUpdate -eq $true `
	-and !([System.IO.File]::ReadAllBytes($updatePolicyPath)[0..2] -join ',' -eq '239,187,191')
$checks["Bundled native XPI"] = Test-Path $xpi
$bundledAddonMatchesSource = $false
if (Test-Path $xpi) {
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	$archive = [System.IO.Compression.ZipFile]::OpenRead($xpi)
	try {
		$artifactEntry = $archive.GetEntry("ai-artifacts.js")
		$viewEntry = $archive.GetEntry("ai-view.js")
		if ($artifactEntry -and $viewEntry) {
			$artifactReader = [System.IO.StreamReader]::new($artifactEntry.Open())
			$viewReader = [System.IO.StreamReader]::new($viewEntry.Open())
			try {
				$bundledAddonMatchesSource = $artifactReader.ReadToEnd() -eq (Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-artifacts.js")) `
					-and $viewReader.ReadToEnd() -eq (Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-view.js"))
			}
			finally {
				$artifactReader.Dispose()
				$viewReader.Dispose()
			}
		}
	}
	finally {
		$archive.Dispose()
	}
}
$checks["Bundled XPI matches addon source"] = $bundledAddonMatchesSource
$translationManifest = $null
$translationDefaults = ""
$translationRuntime = ""
if (Test-Path $translationXpi) {
	$archive = [System.IO.Compression.ZipFile]::OpenRead($translationXpi)
	try {
		$manifestEntry = $archive.GetEntry("manifest.json")
		$defaultsEntry = $archive.GetEntry("prefs.js")
		$runtimeEntry = $archive.GetEntry("chrome/content/scripts/zoteropdftranslate.js")
		if ($manifestEntry) {
			$reader = [System.IO.StreamReader]::new($manifestEntry.Open())
			try { $translationManifest = $reader.ReadToEnd() | ConvertFrom-Json }
			finally { $reader.Dispose() }
		}
		if ($defaultsEntry) {
			$reader = [System.IO.StreamReader]::new($defaultsEntry.Open())
			try { $translationDefaults = $reader.ReadToEnd() }
			finally { $reader.Dispose() }
		}
		if ($runtimeEntry) {
			$reader = [System.IO.StreamReader]::new($runtimeEntry.Open())
			try { $translationRuntime = $reader.ReadToEnd() }
			finally { $reader.Dispose() }
		}
	}
	finally {
		$archive.Dispose()
	}
}
$translationZotero = $translationManifest.applications.zotero
$checks["Pinned built-in translation XPI"] = [bool]$translationManifest `
	-and $translationManifest.version -eq $translationLock.version `
	-and $translationZotero.id -eq $translationLock.addonId `
	-and $translationZotero.strict_min_version -eq $translationLock.zoteroMinVersion `
	-and $translationZotero.strict_max_version -eq $translationLock.zoteroMaxVersion `
	-and (Get-Sha256 $translationXpi) -eq $translationLock.assetSha256
$checks["Pinned translator exposes manual selection control"] = $translationDefaults -match 'ZoteroPDFTranslate\.enablePopup", true' `
	-and $translationRuntime -match 'renderTextSelectionPopup' `
	-and $translationRuntime -match 'readerpopup-translate-label'
$translationLicense = Join-Path $translationLicenseDirectory "LICENSE"
$translationNotice = Join-Path $translationLicenseDirectory "NOTICE.md"
$checks["Translation license and source notice"] = (Test-Path $translationLicense) `
	-and (Get-Sha256 $translationLicense) -eq $translationLock.licenseSha256 `
	-and (Test-Path $translationNotice) `
	-and (Get-Content -Raw $translationNotice) -eq (Get-Content -Raw $translationNoticePath)
$addonManifest = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\manifest.json") | ConvertFrom-Json
$extensionsRegistry = Join-Path $profile "extensions.json"
$registeredAddon = if (Test-Path $extensionsRegistry) {
	(Get-Content -Raw $extensionsRegistry | ConvertFrom-Json).addons |
		Where-Object id -eq "research-workspace@tencent-practice.local"
} else { $null }
$checks["Built-in Library module enabled"] = [bool]$registeredAddon `
	-and $registeredAddon.active `
	-and !$registeredAddon.userDisabled `
	-and !$registeredAddon.appDisabled `
	-and $registeredAddon.version -eq $addonManifest.version
$registeredTranslationAddon = if (Test-Path $extensionsRegistry) {
	(Get-Content -Raw $extensionsRegistry | ConvertFrom-Json).addons |
		Where-Object id -eq $translationLock.addonId
} else { $null }
$checks["Built-in translation module enabled"] = [bool]$registeredTranslationAddon `
	-and $registeredTranslationAddon.active `
	-and !$registeredTranslationAddon.userDisabled `
	-and !$registeredTranslationAddon.appDisabled `
	-and $registeredTranslationAddon.version -eq $translationLock.version
$checks["Plugin manifest"] = Test-Path (Join-Path $workspace "desktop\addons\research-workspace\manifest.json")
$bootstrap = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\bootstrap.js")
$checks["Plugin lifecycle"] = $bootstrap -match "startup" -and $bootstrap -match "shutdown"
$profilePrefs = Join-Path $profile "prefs.js"
$profilePrefsText = if (Test-Path $profilePrefs) { Get-Content -Raw $profilePrefs } else { "" }
$checks["Bundled XPI executed"] = $profilePrefsText -match 'researchWorkspace\.startedVersion'
$checks["Built-in Library Notes executed"] = $profilePrefsText.Contains(
	"extensions.library.LibraryNotes.startedVersion`", `"$($notesLock.libraryVersion)-brand.$($notesLock.brandRevision)"
)
$checks["Native plugin surfaces initialized"] = $profilePrefsText -match 'researchWorkspace\.lastReadyVersion'
$preferencesSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences.js")
$preferencesMarkup = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences.xhtml")
$appearanceSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\research-workspace.js")
$aiViewSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-view.js")
$aiProviderSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-provider.js")
$aiRepositorySource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-conversation.js")
$aiContextSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-context.js")
$aiArtifactsPath = Join-Path $workspace "desktop\addons\research-workspace\ai-artifacts.js"
$aiArtifactsSource = Get-Content -Raw $aiArtifactsPath
$aiArtifactSchemaPath = Join-Path $workspace "schemas\library-ai-artifact.schema.json"
$checks["Zen-style custom theme editor"] = $preferencesSource -match 'themeConfig' `
	-and $preferencesSource -match 'draggingPointID' `
	-and $preferencesMarkup -match 'theme-opacity' `
	-and $preferencesMarkup -match 'theme-texture' `
	-and $appearanceSource -match 'buildGradient'
$checks["Persistent Library AI view"] = $aiViewSource -match 'class LibraryAIViewHost' `
	-and $aiViewSource -match 'zotero-context-pane' `
	-and $aiViewSource -match 'library-ai-composer' `
	-and $aiViewSource -match 'aiViewWidth' `
	-and $appearanceSource -notmatch '(?<!un)registerSection' `
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
	-and $aiProviderSource -match 'addLogin' `
	-and $aiProviderSource -notmatch 'Components\.Constructor\([^\r\n]+,\s*"nsILoginInfo"'
$checks["AI source picker"] = $aiViewSource -match 'selectItemsDialog\.xhtml' `
	-and $aiViewSource -match 'onlyRegularItems:\s*true' `
	-and $aiViewSource -match 'multiSelect:\s*true' `
	-and $aiViewSource -match 'conversation\.sources\.push'
$checks["Native annotations preserved (sidenotes removed)"] = $appearanceSource -notmatch 'renderSidenoteSidebar' `
	-and $appearanceSource -notmatch 'annotationDisplayMode' `
	-and $appearanceSource -notmatch 'library-sidenotes'
$checks["Reader AI selection hooks"] = $appearanceSource -match 'renderTextSelectionPopup' `
	-and $appearanceSource -match 'addReaderSelection' `
	-and $appearanceSource -match 'addAreaReference'
$checks["Manual and full-document translation UX"] = $appearanceSource -match 'ZoteroPDFTranslate\.enableAuto", false' `
	-and $appearanceSource -match 'renderToolbar' `
	-and $appearanceSource -match '全文翻译' `
	-and $appearanceSource -match 'translateWholeDocument' `
	-and $appearanceSource -match 'PDFWorker\.getFullText' `
	-and $appearanceSource -match 'unregisterSection\?\.\("translate"\)'
$checks["AI reference chips + clipboard monitor"] = $aiViewSource -match 'data-role="references"' `
	-and $aiViewSource -match 'startClipboardMonitor' `
	-and $aiViewSource -match 'nsIClipboard' `
	-and $aiRepositorySource -match 'references'
# Library Crawl 浏览器扩展：自有品牌抓取入口，协议走 saveStandaloneAttachment（逆向自 connector server）
$crawlDir = Join-Path $workspace "browser-extension\library-crawl"
$crawlManifest = Get-Content -Raw (Join-Path $crawlDir "manifest.json") -ErrorAction SilentlyContinue
$crawlBackground = Get-Content -Raw (Join-Path $crawlDir "background.js") -ErrorAction SilentlyContinue
$crawlAll = Get-ChildItem $crawlDir -Recurse -File -Include *.json,*.js,*.html -ErrorAction SilentlyContinue | ForEach-Object { Get-Content -Raw $_.FullName } | Out-String
$checks["Library Crawl browser extension"] = $crawlManifest -match '"name":\s*"Library Crawl"' `
	-and $crawlBackground -match 'saveStandaloneAttachment' `
	-and $crawlBackground -match 'X-Metadata' `
	-and (Test-Path (Join-Path $crawlDir "icons\icon128.png")) `
	-and $crawlAll -notmatch 'Zotero Connector'
$checks["Tools menu Library Crawl entry"] = $appearanceSource -match 'customizeToolsMenu' `
	-and $appearanceSource -match 'showLibraryCrawlPanel' `
	-and $appearanceSource -match 'menu_addons' `
	-and $appearanceSource -match 'installConnector' `
	-and $appearanceSource -match 'libraryCrawlRepoURL'
$checks["Open Notebook context levels + Ask mode"] = $aiViewSource -match 'cycleSourceLevel' `
	-and $aiViewSource -match 'askStrategy' `
	-and $aiViewSource -match 'toggle-ask' `
	-and $aiContextSource -match 'collectSummary' `
	-and $aiRepositorySource -match 'askMode'
$checks["Open Notebook insights + context audit"] = $aiViewSource -match 'generateSourceInsight' `
	-and $aiViewSource -match 'library-ai-audit' `
	-and $aiViewSource -match 'data-preview-citation' `
	-and $aiContextSource -match 'annotationKey'
$checks["Hybrid semantic retrieval fallback"] = $aiProviderSource -match 'async embed' `
	-and $aiProviderSource -match '/embeddings' `
	-and $aiContextSource -match 'hybridRank' `
	-and $aiContextSource -match 'rrf-hybrid' `
	-and $aiContextSource -match 'semantic retrieval fallback'
$checks["Citation allow-list audit"] = $aiViewSource -match 'auditAnswerCitations' `
	-and $aiViewSource -match 'citationAudit' `
	-and $aiViewSource -match '非白名单引用'
$artifactLoaderIndex = $bootstrap.IndexOf('"ai-artifacts.js"')
$viewLoaderIndex = $bootstrap.IndexOf('"ai-view.js"')
$checks["AI research artifact contract"] = (Test-Path $aiArtifactsPath) `
	-and (Test-Path $aiArtifactSchemaPath) `
	-and $artifactLoaderIndex -ge 0 `
	-and $viewLoaderIndex -gt $artifactLoaderIndex `
	-and $aiArtifactsSource -match 'library\.trace/v1' `
	-and $aiArtifactsSource -match 'verifyBundle' `
	-and $aiArtifactsSource -match 'buildBundle' `
	-and $aiViewSource -match 'assistant\.artifact'
$checks["AI claim review decision loop"] = $aiArtifactsSource -match 'claimReviewState' `
	-and $aiArtifactsSource -match 'appendDecision' `
	-and $aiArtifactsSource -match 'invalid_decision_chain' `
	-and $aiViewSource -match 'claimReviewPanel' `
	-and $aiViewSource -match 'claimAction' `
	-and $aiViewSource -match 'reviewLocks' `
	-and $aiViewSource -match 'openCitation\(messageID, id, window = null, claimText = ""\)' `
	-and $aiViewSource -match 'throwOnError:\s*true' `
	-and $aiRepositorySource -match 'throwOnError'
$checks["TRACE review hidden from normal reading"] = $aiViewSource -match 'traceReviewUI' `
	-and $aiViewSource -match 'getBoolPref\("extensions\.zotero\.researchWorkspace\.traceReviewUI", false\)' `
	-and $aiViewSource -match 'traceReviewUI && message\.artifact'
$aiCommandsSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\ai-commands.js")
$aiStyleSource = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\style.css")
$checks["AI slash commands (Claudian-style)"] = $bootstrap -match 'ai-commands\.js' `
	-and $aiCommandsSource -match 'class LibraryAISlashCommands' `
	-and $aiCommandsSource -match 'matchTrigger' `
	-and $aiCommandsSource -match '\$ARGUMENTS' `
	-and $aiCommandsSource -match 'loadUserCommands' `
	-and $aiCommandsSource -match 'builtin:compact' `
	-and $aiCommandsSource -match 'builtin:model' `
	-and $aiViewSource -match 'updateSlashDropdown' `
	-and $aiViewSource -match 'handleSlashKeydown' `
	-and $aiViewSource -match 'compactConversation' `
	-and $aiViewSource -match 'switchModel' `
	-and $aiViewSource -match 'copyLastAnswer' `
	-and $aiViewSource -match 'data-role="slash"' `
	-and $aiStyleSource -match 'library-ai-slash-item'
$checks["AI model auto-discovery"] = $aiProviderSource -match 'listModels' `
	-and $aiProviderSource -match 'aiProfiles' `
	-and $aiProviderSource -match 'fetchModels' `
	-and $aiViewSource -match 'showModelPicker' `
	-and $aiViewSource -match 'fillModelDatalist' `
	-and $aiViewSource -match 'library-ai-slash-search' `
	-and $aiViewSource -match 'data-action="models"'
$aiPrefsPaneJs = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences-ai.js")
$aiPrefsPaneMarkup = Get-Content -Raw (Join-Path $workspace "desktop\addons\research-workspace\preferences-ai.xhtml")
$checks["AI multi-profile settings pane"] = $aiProviderSource -match 'upsertProfile' `
	-and $aiProviderSource -match 'setActiveProfile' `
	-and $aiProviderSource -match 'storeModels' `
	-and $aiPrefsPaneJs -match 'LibraryAISettings' `
	-and $aiPrefsPaneJs -match 'exportProfiles' `
	-and $aiPrefsPaneJs -match 'importProfiles' `
	-and $aiPrefsPaneMarkup -match 'ai-profile-list' `
	-and $appearanceSource -match 'research-workspace-ai' `
	-and $aiViewSource -match 'open-ai-prefs'
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
