param(
	[string]$DistributionRoot = ""
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $workspace "desktop\third-party\better-notes.lock.json"
$noticePath = Join-Path $workspace "desktop\third-party\better-notes-NOTICE.md"
$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json
if (!$DistributionRoot) {
	$DistributionRoot = Join-Path $workspace "desktop\dist\Zotero_win-x64"
}
$DistributionRoot = [System.IO.Path]::GetFullPath($DistributionRoot)
$xpi = Join-Path $DistributionRoot "distribution\extensions\$($lock.libraryAddonId).xpi"
$licenseDirectory = Join-Path $DistributionRoot "distribution\licenses\library-notes"

if (!(Test-Path -LiteralPath $xpi)) { throw "未找到 Library Notes XPI：$xpi" }

function Get-Sha256([string]$Path) {
	$stream = [System.IO.File]::OpenRead($Path)
	$sha256 = [System.Security.Cryptography.SHA256]::Create()
	try { return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
	finally { $sha256.Dispose(); $stream.Dispose() }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($xpi)
try {
	function Read-Entry([string]$Name) {
		$entry = $archive.GetEntry($Name)
		if (!$entry) { return $null }
		$reader = [System.IO.StreamReader]::new($entry.Open())
		try { return $reader.ReadToEnd() }
		finally { $reader.Dispose() }
	}

	$manifest = (Read-Entry "manifest.json") | ConvertFrom-Json
	$bootstrap = Read-Entry "bootstrap.js"
	$runtime = Read-Entry "chrome/content/scripts/BetterNotes.js"
	$english = Read-Entry "locale/en-US/BetterNotes-addon.ftl"
	$englishExport = Read-Entry "locale/en-US/BetterNotes-exportNotes.ftl"
	$chinese = Read-Entry "locale/zh-CN/BetterNotes-addon.ftl"
	$chineseExport = Read-Entry "locale/zh-CN/BetterNotes-exportNotes.ftl"
	$embeddedNotice = Read-Entry "LIBRARY-NOTES-NOTICE.md"
	$embeddedLicense = Read-Entry "LICENSE"
}
finally {
	$archive.Dispose()
}

$checks = [ordered]@{}
$checks["Library manifest identity"] = $manifest.name -eq $lock.brandName `
	-and $manifest.version -eq $lock.libraryVersion `
	-and $manifest.applications.zotero.id -eq $lock.libraryAddonId `
	-and $manifest.applications.zotero.update_url -eq $lock.libraryUpdateUrl `
	-and $manifest.homepage_url -eq $lock.libraryHomepage
$checks["Library runtime identity"] = $runtime -match 'addonName:\s*"Library Notes"' `
	-and $runtime -match [regex]::Escape($lock.libraryAddonId) `
	-and $runtime -match 'extensions\.library\.LibraryNotes' `
	-and $bootstrap -match 'Zotero\.LibraryNotes = Zotero\.BetterNotes' `
	-and $bootstrap -match [regex]::Escape("$($lock.libraryVersion)-brand.$($lock.brandRevision)")
$checks["Library visible note branding"] = $english -notmatch 'Better Notes' `
	-and $chinese -notmatch 'Better Notes' `
	-and $englishExport -match 'Library Note' `
	-and $englishExport -notmatch 'Zotero Note' `
	-and $chineseExport -match 'Library 笔记' `
	-and $chineseExport -notmatch 'Zotero 笔记'
$checks["Host ABI preserved"] = $runtime -match 'Zotero\.Items' `
	-and $runtime -match 'zotero://note' `
	-and $runtime -match '\$libraryID' `
	-and $runtime -match '\$itemKey'
$checks["Embedded AGPL notice"] = $embeddedNotice -eq (Get-Content -Raw -LiteralPath $noticePath) `
	-and [bool]$embeddedLicense
$checks["Distributed AGPL notice"] = (Test-Path -LiteralPath (Join-Path $licenseDirectory "LICENSE")) `
	-and (Get-Sha256 (Join-Path $licenseDirectory "LICENSE")) -eq $lock.licenseSha256 `
	-and (Test-Path -LiteralPath (Join-Path $licenseDirectory "NOTICE.md")) `
	-and (Get-Content -Raw -LiteralPath (Join-Path $licenseDirectory "NOTICE.md")) -eq (Get-Content -Raw -LiteralPath $noticePath) `
	-and (Test-Path -LiteralPath (Join-Path $licenseDirectory "component-lock.json"))

$checks.GetEnumerator() | ForEach-Object {
	$color = if ($_.Value) { "Green" } else { "Red" }
	$mark = if ($_.Value) { "PASS" } else { "FAIL" }
	Write-Host "[$mark] $($_.Key)" -ForegroundColor $color
}
if ($checks.Values -contains $false) { throw "Library Notes 验收未全部通过。" }

Write-Host "Library Notes 品牌、兼容 ABI 与开源分发验收通过。" -ForegroundColor Green
