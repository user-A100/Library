param(
	[string]$DistributionRoot = ""
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $workspace "desktop\third-party\better-notes.lock.json"
$noticePath = Join-Path $workspace "desktop\third-party\better-notes-NOTICE.md"
$cacheDirectory = Join-Path $workspace "desktop\.tools\better-notes"
$libraryIcon = Join-Path $workspace "desktop\assets\library-icon-preview.png"
$librarySmallIcon = Join-Path $workspace "desktop\assets\library-l-icon-preview.png"

foreach ($required in @($lockPath, $noticePath, $libraryIcon, $librarySmallIcon)) {
	if (!(Test-Path -LiteralPath $required)) { throw "Library Notes 构建缺少文件：$required" }
}
$sevenZipCommand = Get-Command 7z.exe -ErrorAction SilentlyContinue
if (!$sevenZipCommand) { throw "Library Notes 构建需要 7-Zip（7z.exe）。" }

$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json
if (!$DistributionRoot) {
	$DistributionRoot = Join-Path $workspace "desktop\dist\Zotero_win-x64"
}
$DistributionRoot = [System.IO.Path]::GetFullPath($DistributionRoot)
$extensionsDirectory = Join-Path $DistributionRoot "distribution\extensions"
$licenseDirectory = Join-Path $DistributionRoot "distribution\licenses\library-notes"
$cachedXpi = Join-Path $cacheDirectory "better-notes-for-zotero-$($lock.version).xpi"
$cachedLicense = Join-Path $cacheDirectory "LICENSE-$($lock.version)"
$destinationXpi = Join-Path $extensionsDirectory "$($lock.libraryAddonId).xpi"
$upstreamDestinationXpi = Join-Path $extensionsDirectory "$($lock.upstreamAddonId).xpi"

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
	if ((Test-Path -LiteralPath $Destination) -and (Get-Sha256 $Destination) -eq $ExpectedSha256) {
		return
	}

	New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
	$download = "$Destination.download"
	if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download -Force }
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

function Replace-Text(
	[string]$Path,
	[System.Collections.Specialized.OrderedDictionary]$Replacements
) {
	$content = [System.IO.File]::ReadAllText($Path)
	foreach ($entry in $Replacements.GetEnumerator()) {
		$content = $content.Replace([string]$entry.Key, [string]$entry.Value)
	}
	[System.IO.File]::WriteAllText($Path, $content, [System.Text.UTF8Encoding]::new($false))
}

Get-VerifiedDownload $lock.assetUrl $lock.assetSha256 $cachedXpi "Better Notes $($lock.version) XPI"
Get-VerifiedDownload $lock.licenseUrl $lock.licenseSha256 $cachedLicense "Better Notes $($lock.version) 许可证"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($cachedXpi)
try {
	$manifestEntry = $archive.GetEntry("manifest.json")
	if (!$manifestEntry) { throw "Better Notes XPI 缺少 manifest.json" }
	$reader = [System.IO.StreamReader]::new($manifestEntry.Open())
	try { $upstreamManifest = $reader.ReadToEnd() | ConvertFrom-Json }
	finally { $reader.Dispose() }
}
finally {
	$archive.Dispose()
}

$upstreamHost = $upstreamManifest.applications.zotero
if ($upstreamHost.id -ne $lock.upstreamAddonId) {
	throw "Better Notes XPI ID 不匹配：期望 $($lock.upstreamAddonId)，实际 $($upstreamHost.id)"
}
if ($upstreamManifest.version -ne $lock.version) {
	throw "Better Notes XPI 版本不匹配：期望 $($lock.version)，实际 $($upstreamManifest.version)"
}
if ($upstreamHost.strict_min_version -ne $lock.zoteroMinVersion -or
	$upstreamHost.strict_max_version -ne $lock.zoteroMaxVersion) {
	throw "Better Notes XPI 的宿主兼容范围与版本锁不一致。"
}
$libraryKernelVersion = [version]"9.0.6"
$minimumVersion = [version](($upstreamHost.strict_min_version -replace '-.*$', ''))
$maximumVersion = [version](($upstreamHost.strict_max_version -replace '\.99\.99$', '.0.0'))
if ($minimumVersion -gt $libraryKernelVersion -or $maximumVersion.Major -lt $libraryKernelVersion.Major) {
	throw "Better Notes $($lock.version) 不兼容 Library 9.0.6 内核。"
}

New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
$staging = Join-Path $cacheDirectory "staging-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $staging | Out-Null
try {
	[System.IO.Compression.ZipFile]::ExtractToDirectory($cachedXpi, $staging)

	$manifestPath = Join-Path $staging "manifest.json"
	$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
	$manifest.name = $lock.brandName
	$manifest.version = $lock.libraryVersion
	$manifest.description = "Library 内置的笔记链接、模板、Markdown 双向同步与多格式导出工具。"
	$manifest.author = "windingwind and contributors; Library modifications"
	$manifest.homepage_url = $lock.libraryHomepage
	$manifest.icons.'48' = "chrome/content/icons/favicon@0.5x.png"
	$manifest.icons.'96' = "chrome/content/icons/favicon.png"
	$manifest.applications.zotero.id = $lock.libraryAddonId
	$manifest.applications.zotero.update_url = $lock.libraryUpdateUrl
	[System.IO.File]::WriteAllText(
		$manifestPath,
		($manifest | ConvertTo-Json -Depth 20),
		[System.Text.UTF8Encoding]::new($false)
	)

	$runtimeReplacements = [ordered]@{
		([string]$lock.upstreamAddonId) = [string]$lock.libraryAddonId
		"extensions.zotero.Knowledge4Zotero" = "extensions.library.LibraryNotes"
		"Better Notes (BN) is a plugin for [Zotero](https://zotero.org)." = "Library Notes is Library's built-in note workspace."
		"Better Notes for Zotero" = "Library Notes"
		"Better Notes" = "Library Notes"
	}
	Get-ChildItem -LiteralPath $staging -Recurse -File -Include *.js,*.xhtml | ForEach-Object {
		Replace-Text $_.FullName $runtimeReplacements
	}

	$localeBrandReplacements = [ordered]@{
		"Better Notes for Zotero" = "Library Notes"
		"Better Notes" = "Library Notes"
		"Translate for Zotero插件" = "Library 内置翻译模块"
	}
	Get-ChildItem -LiteralPath (Join-Path $staging "locale") -Recurse -File -Filter *.ftl | ForEach-Object {
		Replace-Text $_.FullName $localeBrandReplacements
		if ($_.Name -like "*export*.ftl") {
			Replace-Text $_.FullName ([ordered]@{ "Zotero" = "Library" })
		}
	}

	$preferencesPath = Join-Path $staging "chrome\content\preferences.xhtml"
	Replace-Text $preferencesPath ([ordered]@{
		"https://github.com/windingwind/zotero-better-notes/discussions/categories/q-a" = "$($lock.libraryHomepage)/discussions"
		"https://github.com/windingwind/zotero-better-notes/issues" = "$($lock.libraryHomepage)/issues"
		"https://github.com/windingwind/zotero-better-notes" = [string]$lock.libraryHomepage
	})

	$bootstrapPath = Join-Path $staging "bootstrap.js"
	$bootstrap = [System.IO.File]::ReadAllText($bootstrapPath)
	$startupAnchor = "  await Zotero.BetterNotes.hooks.onStartup();"
	$startupReplacement = "$startupAnchor`r`n  Zotero.LibraryNotes = Zotero.BetterNotes;`r`n  Services.prefs.setStringPref(`"extensions.library.LibraryNotes.startedVersion`", `"$($lock.libraryVersion)-brand.$($lock.brandRevision)`");"
	if (!$bootstrap.Contains($startupAnchor)) { throw "Better Notes bootstrap 启动锚点已变化，拒绝生成未验证品牌包。" }
	$bootstrap = $bootstrap.Replace($startupAnchor, $startupReplacement)
	$shutdownAnchor = "  Zotero.BetterNotes.hooks.onShutdown();"
	$shutdownReplacement = "$shutdownAnchor`r`n  if (Zotero.LibraryNotes === Zotero.BetterNotes) {`r`n    delete Zotero.LibraryNotes;`r`n  }"
	if (!$bootstrap.Contains($shutdownAnchor)) { throw "Better Notes bootstrap 关闭锚点已变化，拒绝生成未验证品牌包。" }
	$bootstrap = $bootstrap.Replace($shutdownAnchor, $shutdownReplacement)
	[System.IO.File]::WriteAllText($bootstrapPath, $bootstrap, [System.Text.UTF8Encoding]::new($false))

	Copy-Item -LiteralPath $libraryIcon -Destination (Join-Path $staging "chrome\content\icons\favicon.png") -Force
	Copy-Item -LiteralPath $librarySmallIcon -Destination (Join-Path $staging "chrome\content\icons\favicon@0.5x.png") -Force
	Copy-Item -LiteralPath $noticePath -Destination (Join-Path $staging "LIBRARY-NOTES-NOTICE.md") -Force
	Copy-Item -LiteralPath $cachedLicense -Destination (Join-Path $staging "LICENSE") -Force

	New-Item -ItemType Directory -Force -Path $extensionsDirectory | Out-Null
	if ($lock.libraryAddonId -ne $lock.upstreamAddonId -and (Test-Path -LiteralPath $upstreamDestinationXpi)) {
		Remove-Item -LiteralPath $upstreamDestinationXpi -Force
	}
	Copy-Item -LiteralPath $cachedXpi -Destination $destinationXpi -Force
	Push-Location $staging
	try {
		& $sevenZipCommand.Source u -tzip "-mx=9" $destinationXpi "*" -r -y | Out-Null
		if ($LASTEXITCODE -ne 0) { throw "7-Zip 更新 Library Notes XPI 失败（退出码 $LASTEXITCODE）。" }
	}
	finally {
		Pop-Location
	}
}
finally {
	$resolvedCache = [System.IO.Path]::GetFullPath($cacheDirectory).TrimEnd('\') + '\'
	$resolvedStaging = [System.IO.Path]::GetFullPath($staging)
	if ($resolvedStaging.StartsWith($resolvedCache, [System.StringComparison]::OrdinalIgnoreCase)) {
		Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
	}
}

New-Item -ItemType Directory -Force -Path $licenseDirectory | Out-Null
Copy-Item -LiteralPath $cachedLicense -Destination (Join-Path $licenseDirectory "LICENSE") -Force
Copy-Item -LiteralPath $noticePath -Destination (Join-Path $licenseDirectory "NOTICE.md") -Force
Copy-Item -LiteralPath $lockPath -Destination (Join-Path $licenseDirectory "component-lock.json") -Force

Write-Host "Library Notes 已就绪：$destinationXpi" -ForegroundColor Green
Write-Host "基于 Better Notes $($lock.version)，上游 SHA-256 $($lock.assetSha256)" -ForegroundColor DarkGreen
