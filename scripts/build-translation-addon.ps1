param(
	[string]$DistributionRoot = ""
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $workspace "desktop\third-party\translate-for-zotero.lock.json"
$noticePath = Join-Path $workspace "desktop\third-party\translate-for-zotero-NOTICE.md"
$cacheDirectory = Join-Path $workspace "desktop\.tools\translate-for-zotero"

if (!(Test-Path $lockPath)) { throw "缺少翻译组件版本锁：$lockPath" }
if (!(Test-Path $noticePath)) { throw "缺少翻译组件开源说明：$noticePath" }

$lock = Get-Content -Raw $lockPath | ConvertFrom-Json
if (!$DistributionRoot) {
	$DistributionRoot = Join-Path $workspace "desktop\dist\Zotero_win-x64"
}
$DistributionRoot = [System.IO.Path]::GetFullPath($DistributionRoot)
$extensionsDirectory = Join-Path $DistributionRoot "distribution\extensions"
$licenseDirectory = Join-Path $DistributionRoot "distribution\licenses\translate-for-zotero"
$cachedXpi = Join-Path $cacheDirectory "translate-for-zotero-$($lock.version).xpi"
$cachedLicense = Join-Path $cacheDirectory "LICENSE-$($lock.version)"
$destinationXpi = Join-Path $extensionsDirectory "$($lock.addonId).xpi"

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

function Get-VerifiedDownload(
	[string]$Url,
	[string]$ExpectedSha256,
	[string]$Destination,
	[string]$Label
) {
	if ((Test-Path $Destination) -and (Get-Sha256 $Destination) -eq $ExpectedSha256) {
		return
	}

	New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
	$download = "$Destination.download"
	if (Test-Path $download) { Remove-Item -LiteralPath $download -Force }
	Write-Host "下载固定版本：$Label" -ForegroundColor DarkCyan
	& curl.exe -fL --retry 3 --connect-timeout 15 -o $download $Url
	if ($LASTEXITCODE -ne 0) {
		Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
		throw "$Label 下载失败：$Url"
	}
	$actualSha256 = Get-Sha256 $download
	if ($actualSha256 -ne $ExpectedSha256) {
		Remove-Item -LiteralPath $download -Force
		throw "$Label SHA-256 不匹配：期望 $ExpectedSha256，实际 $actualSha256"
	}
	Move-Item -LiteralPath $download -Destination $Destination -Force
}

Get-VerifiedDownload $lock.assetUrl $lock.assetSha256 $cachedXpi "Translate for Zotero $($lock.version) XPI"
Get-VerifiedDownload $lock.licenseUrl $lock.licenseSha256 $cachedLicense "Translate for Zotero 许可证"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($cachedXpi)
try {
	$manifestEntry = $archive.GetEntry("manifest.json")
	if (!$manifestEntry) { throw "翻译 XPI 缺少 manifest.json" }
	$reader = [System.IO.StreamReader]::new($manifestEntry.Open())
	try {
		$manifest = $reader.ReadToEnd() | ConvertFrom-Json
	}
	finally {
		$reader.Dispose()
	}
}
finally {
	$archive.Dispose()
}

$zotero = $manifest.applications.zotero
if ($zotero.id -ne $lock.addonId) {
	throw "翻译 XPI ID 不匹配：期望 $($lock.addonId)，实际 $($zotero.id)"
}
if ($manifest.version -ne $lock.version) {
	throw "翻译 XPI 版本不匹配：期望 $($lock.version)，实际 $($manifest.version)"
}
if ($zotero.strict_min_version -ne $lock.zoteroMinVersion -or
	$zotero.strict_max_version -ne $lock.zoteroMaxVersion) {
	throw "翻译 XPI 的 Zotero 兼容范围与版本锁不一致。"
}
$libraryZoteroVersion = [version]"9.0.6"
if ([version]$zotero.strict_min_version -gt $libraryZoteroVersion -or
	[version]$zotero.strict_max_version -lt $libraryZoteroVersion) {
	throw "Translate for Zotero $($manifest.version) 不兼容 Library 的 Zotero 9.0.6 内核。"
}

New-Item -ItemType Directory -Force -Path $extensionsDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $licenseDirectory | Out-Null
Copy-Item -LiteralPath $cachedXpi -Destination $destinationXpi -Force
Copy-Item -LiteralPath $cachedLicense -Destination (Join-Path $licenseDirectory "LICENSE") -Force
Copy-Item -LiteralPath $noticePath -Destination (Join-Path $licenseDirectory "NOTICE.md") -Force
Copy-Item -LiteralPath $lockPath -Destination (Join-Path $licenseDirectory "component-lock.json") -Force

Write-Host "内置翻译组件已就绪：$destinationXpi" -ForegroundColor Green
Write-Host "版本 $($manifest.version)，Zotero $($zotero.strict_min_version)–$($zotero.strict_max_version)，SHA-256 $($lock.assetSha256)" -ForegroundColor DarkGreen
