param(
	[ValidateRange(1024, 65535)]
	[int]$ConnectorPort = 23119
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $workspace "desktop\dist\Zotero_win-x64\Library.exe"
$profile = Join-Path $workspace "desktop\profile"
$dataDir = Join-Path $workspace "desktop\data"
$bundledXPI = Join-Path $workspace "desktop\dist\Zotero_win-x64\distribution\extensions\research-workspace@tencent-practice.local.xpi"
$profileExtensions = Join-Path $profile "extensions"
$addonManifestPath = Join-Path $workspace "desktop\addons\research-workspace\manifest.json"

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
	Copy-Item -LiteralPath $bundledXPI -Destination (Join-Path $profileExtensions "research-workspace@tencent-practice.local.xpi") -Force
	if ($installedVersion -ne $addonVersion) {
		Remove-Item -LiteralPath (Join-Path $profile "extensions.json") -Force -ErrorAction SilentlyContinue
		Remove-Item -LiteralPath (Join-Path $profile "addonStartup.json.lz4") -Force -ErrorAction SilentlyContinue
		Set-Content -LiteralPath $versionMarker -Value $addonVersion -Encoding ASCII
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
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
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
