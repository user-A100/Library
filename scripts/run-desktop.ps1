param(
	[ValidateRange(1024, 65535)]
	[int]$ConnectorPort = 23119,
	[string]$ProfileDirectory = "",
	[string]$DataDirectory = ""
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $workspace "desktop\dist\Zotero_win-x64\Library.exe"
$profile = if ($ProfileDirectory) {
	[System.IO.Path]::GetFullPath($ProfileDirectory)
} else {
	Join-Path $workspace "desktop\profile"
}
$dataDir = if ($DataDirectory) {
	[System.IO.Path]::GetFullPath($DataDirectory)
} else {
	Join-Path $workspace "desktop\data"
}
$bundledXPI = Join-Path $workspace "desktop\dist\Zotero_win-x64\distribution\extensions\research-workspace@tencent-practice.local.xpi"
$translationLockPath = Join-Path $workspace "desktop\third-party\translate-for-zotero.lock.json"
$translationLock = Get-Content -Raw $translationLockPath | ConvertFrom-Json
$bundledTranslationXPI = Join-Path $workspace "desktop\dist\Zotero_win-x64\distribution\extensions\$($translationLock.addonId).xpi"
$notesLockPath = Join-Path $workspace "desktop\third-party\better-notes.lock.json"
$notesLock = Get-Content -Raw $notesLockPath | ConvertFrom-Json
$bundledNotesXPI = Join-Path $workspace "desktop\dist\Zotero_win-x64\distribution\extensions\$($notesLock.libraryAddonId).xpi"
$profileExtensions = Join-Path $profile "extensions"
$addonManifestPath = Join-Path $workspace "desktop\addons\research-workspace\manifest.json"

function Get-FileSha256([string]$Path) {
	$stream = [System.IO.File]::OpenRead($Path)
	$sha256 = [System.Security.Cryptography.SHA256]::Create()
	try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "") }
	finally { $sha256.Dispose(); $stream.Dispose() }
}

function Copy-AddonIfChanged([string]$Source, [string]$Destination) {
	if (Test-Path -LiteralPath $Destination) {
		$sourceFile = Get-Item -LiteralPath $Source
		$destinationFile = Get-Item -LiteralPath $Destination
		if ($sourceFile.Length -eq $destinationFile.Length `
			-and (Get-FileSha256 $Source) -eq (Get-FileSha256 $Destination)) {
			return $false
		}
	}
	Copy-Item -LiteralPath $Source -Destination $Destination -Force
	return $true
}

if (!(Test-Path $exe)) {
	throw "尚未找到桌面构建。请先运行 npm run desktop:build。"
}

New-Item -ItemType Directory -Force -Path $profile | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $profileExtensions | Out-Null
if ((Test-Path $bundledXPI) -and (Test-Path $addonManifestPath)) {
	$addonVersion = (Get-Content -LiteralPath $addonManifestPath -Raw | ConvertFrom-Json).version
	$versionMarker = Join-Path $profileExtensions ".research-workspace-version"
	$installedVersion = if (Test-Path $versionMarker) { (Get-Content -LiteralPath $versionMarker -Raw).Trim() } else { "" }
	$addonChanged = Copy-AddonIfChanged $bundledXPI (Join-Path $profileExtensions "research-workspace@tencent-practice.local.xpi")
	if ($installedVersion -ne $addonVersion -or $addonChanged) {
		Remove-Item -LiteralPath (Join-Path $profile "extensions.json") -Force -ErrorAction SilentlyContinue
		Remove-Item -LiteralPath (Join-Path $profile "addonStartup.json.lz4") -Force -ErrorAction SilentlyContinue
		Set-Content -LiteralPath $versionMarker -Value $addonVersion -Encoding ASCII
	}
}
if (Test-Path $bundledTranslationXPI) {
	$translationVersionMarker = Join-Path $profileExtensions ".translate-for-zotero-version"
	$installedTranslationVersion = if (Test-Path $translationVersionMarker) {
		(Get-Content -LiteralPath $translationVersionMarker -Raw).Trim()
	} else { "" }
	$null = Copy-AddonIfChanged $bundledTranslationXPI (Join-Path $profileExtensions "$($translationLock.addonId).xpi")
	if ($installedTranslationVersion -ne $translationLock.version) {
		Remove-Item -LiteralPath (Join-Path $profile "extensions.json") -Force -ErrorAction SilentlyContinue
		Remove-Item -LiteralPath (Join-Path $profile "addonStartup.json.lz4") -Force -ErrorAction SilentlyContinue
		Set-Content -LiteralPath $translationVersionMarker -Value $translationLock.version -Encoding ASCII
	}
}
if (Test-Path $bundledNotesXPI) {
	$notesVersionMarker = Join-Path $profileExtensions ".library-notes-version"
	$notesBundleVersion = "$($notesLock.libraryVersion)-brand.$($notesLock.brandRevision)"
	$installedNotesVersion = if (Test-Path $notesVersionMarker) {
		(Get-Content -LiteralPath $notesVersionMarker -Raw).Trim()
	} else { "" }
	$notesChanged = Copy-AddonIfChanged $bundledNotesXPI (Join-Path $profileExtensions "$($notesLock.libraryAddonId).xpi")
	if ($installedNotesVersion -ne $notesBundleVersion -or $notesChanged) {
		Remove-Item -LiteralPath (Join-Path $profile "extensions.json") -Force -ErrorAction SilentlyContinue
		Remove-Item -LiteralPath (Join-Path $profile "addonStartup.json.lz4") -Force -ErrorAction SilentlyContinue
		Set-Content -LiteralPath $notesVersionMarker -Value $notesBundleVersion -Encoding ASCII
	}
}

# Keep development runs completely separate from an installed Zotero profile
# and library. Zotero reads user.js on startup and persists these values to
# prefs.js, while the real database and attachments live in desktop/data.
$escapedDataDir = $dataDir.Replace("\", "\\")
@"
user_pref("extensions.zotero.useDataDir", true);
user_pref("extensions.zotero.dataDir", "$escapedDataDir");
user_pref("extensions.zotero.httpServer.port", $ConnectorPort);
user_pref("app.update.auto", false);
user_pref("app.update.enabled", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("extensions.installedDistroAddon.$($notesLock.libraryAddonId)", false);
user_pref("extensions.zotero.ZoteroPDFTranslate.enableAuto", false);
user_pref("extensions.zotero.ZoteroPDFTranslate.enablePopup", true);
user_pref("extensions.zotero.researchWorkspace.traceReviewUI", false);
"@ | Set-Content -Encoding ASCII (Join-Path $profile "user.js")

Write-Host "启动 Library（独立开发配置）…" -ForegroundColor Cyan
Start-Process -FilePath $exe -ArgumentList @("-no-remote", "-profile", $profile, "-ZoteroDebugText")

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
	Start-Sleep -Milliseconds 500
	try {
		$status = & curl.exe --silent --max-time 1 --output NUL --write-out "%{http_code}" "http://127.0.0.1:$ConnectorPort/connector/ping"
		if ($LASTEXITCODE -eq 0 -and $status -eq "200") {
			$ready = $true
			break
		}
	}
	catch { }
}

if ($ready) {
	$listener = Get-NetTCPConnection -LocalPort $ConnectorPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
	$owner = if ($listener) { Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue } else { $null }
	if ($owner -and $owner.Path -eq $exe) {
		Write-Host "Connector Server 已就绪：http://127.0.0.1:$ConnectorPort" -ForegroundColor Green
	}
	else {
		Write-Warning "$ConnectorPort 已由其他 Zotero 进程占用。请退出占用进程后重启 Library。"
	}
}
else {
	Write-Warning "应用已启动，但 Connector Server 尚未在 15 秒内响应。"
}
