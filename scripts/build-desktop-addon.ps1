$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$addon = Join-Path $workspace "desktop\addons\research-workspace"
$extensionDirectory = Join-Path $workspace "desktop\dist\Zotero_win-x64\distribution\extensions"
$xpi = Join-Path $extensionDirectory "research-workspace@tencent-practice.local.xpi"

if (!(Test-Path (Join-Path $addon "manifest.json"))) {
	throw "缺少原生插件 manifest：$addon"
}

New-Item -ItemType Directory -Force -Path $extensionDirectory | Out-Null
if (Test-Path $xpi) {
	Remove-Item -LiteralPath $xpi -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# 手工打包：CreateFromDirectory 在 Windows 上会用「\」作为 zip 条目分隔符，
# 导致插件内 locale/FTL 等路径无法被 Zotero 解析（菜单标签空白等问题），
# 这里强制使用「/」作为条目名分隔符。
$archive = [System.IO.Compression.ZipFile]::Open($xpi, [System.IO.Compression.ZipArchiveMode]::Create)
try {
	Push-Location $addon
	try {
		Get-ChildItem -LiteralPath $addon -Recurse -File | ForEach-Object {
			$relative = (Resolve-Path -LiteralPath $_.FullName -Relative).Replace(".\", "").Replace("\", "/")
			[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
				$archive,
				$_.FullName,
				$relative,
				[System.IO.Compression.CompressionLevel]::Optimal
			) | Out-Null
		}
	}
	finally {
		Pop-Location
	}
}
finally {
	$archive.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($xpi)
try {
	$requiredEntries = @("manifest.json", "bootstrap.js", "ai-artifacts.js", "ai-view.js")
	$entryNames = @($archive.Entries | ForEach-Object FullName)
	$missing = @($requiredEntries | Where-Object { $_ -notin $entryNames })
	if ($missing.Count) {
		throw "XPI 缺少必要文件：$($missing -join ', ')"
	}
}
finally {
	$archive.Dispose()
}

$stream = [System.IO.File]::OpenRead($xpi)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
	$hash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
}
finally {
	$sha256.Dispose()
	$stream.Dispose()
}
Write-Host "原生插件已打包：$xpi" -ForegroundColor Green
Write-Host "SHA-256：$hash" -ForegroundColor DarkGreen

& (Join-Path $PSScriptRoot "build-translation-addon.ps1")
