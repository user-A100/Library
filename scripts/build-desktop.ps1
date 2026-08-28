$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace "desktop\zotero"
$addon = Join-Path $workspace "desktop\addons\research-workspace"
$dist = Join-Path $workspace "desktop\dist\Zotero_win-x64"
$publish = Join-Path $workspace "desktop\dist\.Zotero_win-x64-publish"
$ciCache = Join-Path $workspace "desktop\.tools\zotero-ci"
$sevenZipArchive = Join-Path $workspace "desktop\.tools\7z2602-linux-x64.tar.xz"
$firefoxComponents = Join-Path $workspace "desktop\.tools\Firefox 140.12.0-x64 Components.zip"
$rcedit = Join-Path $workspace "desktop\.tools\rcedit-x64.exe"
$libraryIcon = Join-Path $source "app\win\zotero.ico"
$updatePolicySource = Join-Path $workspace "desktop\distribution\policies.json"
$expectedCommit = "7132587c2d6d56725debe64908733a8140bc6be3"
$distro = "Ubuntu-22.04"

if (!(Test-Path (Join-Path $source ".git"))) {
	throw "缺少 desktop/zotero。请先拉取 Zotero 9.0.6 完整源码。"
}

$actualCommit = (git -C $source rev-parse HEAD).Trim()
if ($actualCommit -ne $expectedCommit) {
	throw "Zotero 基线不匹配：期望 $expectedCommit，实际 $actualCommit。"
}

$wslUser = (& wsl -d $distro -- bash -lc 'printf %s "$USER"').Trim()
if (!$wslUser) { throw "无法确定 WSL 用户。" }
$wslHome = "/home/$wslUser"
$wslBuild = "$wslHome/tencent-fight-zotero-build"

function Convert-ToWslPath([string]$path) {
	$full = [System.IO.Path]::GetFullPath($path)
	$drive = $full.Substring(0, 1).ToLowerInvariant()
	$tail = $full.Substring(2).Replace('\', '/')
	return "/mnt/$drive$tail"
}

$sourceWsl = Convert-ToWslPath $source
$addonWsl = Convert-ToWslPath $addon
$publishWsl = Convert-ToWslPath $publish
$ciCacheWsl = Convert-ToWslPath $ciCache
$sevenZipArchiveWsl = Convert-ToWslPath $sevenZipArchive
$firefoxComponentsWsl = Convert-ToWslPath $firefoxComponents

$ciArtifacts = @(
	@{ Folder = "document-worker"; File = "fd642b38287f1e59aaf8e02c3132da6d3daa39c1.zip" },
	@{ Folder = "reader"; File = "9643fac7a4e86c8d7ff9548af0191e9df63aa998.zip" },
	@{ Folder = "note-editor"; File = "107ab75c3247c6584bda2303ecbddf4b317fdd2d.zip" }
)
New-Item -ItemType Directory -Force -Path $ciCache | Out-Null
foreach ($artifact in $ciArtifacts) {
	$target = Join-Path $ciCache $artifact.File
	if (!(Test-Path $target)) {
		$url = "https://zotero-download.s3.amazonaws.com/ci/$($artifact.Folder)/$($artifact.File)"
		Write-Host "下载官方构建资源：$($artifact.Folder)" -ForegroundColor DarkCyan
		& curl.exe -fL --retry 3 --connect-timeout 15 -o $target $url
		if ($LASTEXITCODE -ne 0) { throw "下载失败：$url" }
	}
}
if (!(Test-Path $sevenZipArchive)) {
	Write-Host "下载 7-Zip 26.02 Linux x64 构建工具" -ForegroundColor DarkCyan
	& curl.exe -fL --retry 3 --connect-timeout 15 -o $sevenZipArchive "https://www.7-zip.org/a/7z2602-linux-x64.tar.xz"
	if ($LASTEXITCODE -ne 0) { throw "7-Zip 构建工具下载失败。" }
}
if (!(Test-Path $firefoxComponents)) {
	Write-Host "下载 Zotero Firefox 定制组件" -ForegroundColor DarkCyan
	& curl.exe -fL --retry 3 --connect-timeout 15 -o $firefoxComponents "https://download.zotero.org/dev/firefox-components/win/140.12.0-x64-de075a96b3fba226382d9625ff0ad755b1baa41fff1c3307cc4c9d0d98720c87.zip"
	if ($LASTEXITCODE -ne 0) { throw "Zotero Firefox 定制组件下载失败。" }
}
if (!(Test-Path $rcedit)) {
	Write-Host "下载 Windows 图标写入工具" -ForegroundColor DarkCyan
	& curl.exe -fL --retry 3 --connect-timeout 15 -o $rcedit "https://github.com/electron/rcedit/releases/download/v1.1.1/rcedit-x64.exe"
	if ($LASTEXITCODE -ne 0) { throw "Windows 图标写入工具下载失败。" }
}

$command = @"
set -euo pipefail
export PATH='$wslHome/.local/node22/bin:$wslHome/.local/bin':`$PATH
test -x '$wslHome/.local/node22/bin/node'
test -d '$wslBuild/.git'
test "`$(git -C '$wslBuild' rev-parse HEAD)" = '$expectedCommit'
if ! command -v unzip >/dev/null 2>&1; then
	ln -sf /usr/bin/busybox '$wslHome/.local/bin/unzip'
fi
mkdir -p '$wslHome/.local/7zip2602'
tar -xf '$sevenZipArchiveWsl' -C '$wslHome/.local/7zip2602'
ln -sf '$wslHome/.local/7zip2602/7zz' '$wslHome/.local/bin/7z'
7z i >/dev/null
if ! command -v zip >/dev/null 2>&1; then
	mkdir -p '$wslHome/.local/zip' /tmp/zip-download
	rm -f /tmp/zip-download/*.deb
	(cd /tmp/zip-download && apt-get download zip)
	dpkg-deb -x /tmp/zip-download/zip_*.deb '$wslHome/.local/zip'
	ln -sf '$wslHome/.local/zip/usr/bin/zip' '$wslHome/.local/bin/zip'
fi

rsync -a --delete \
	--exclude=.git \
	--exclude=node_modules \
	--exclude=build \
	--exclude=app/xulrunner \
	--exclude=app/staging \
	--exclude=app/dist \
	'$sourceWsl/' '$wslBuild/'

cd '$wslBuild'
git lfs pull
npm ci
mkdir -p tmp/builds/pdf-worker tmp/builds/reader tmp/builds/note-editor
cp '$ciCacheWsl/fd642b38287f1e59aaf8e02c3132da6d3daa39c1.zip' tmp/builds/pdf-worker/
cp '$ciCacheWsl/9643fac7a4e86c8d7ff9548af0191e9df63aa998.zip' tmp/builds/reader/
cp '$ciCacheWsl/107ab75c3247c6584bda2303ecbddf4b317fdd2d.zip' tmp/builds/note-editor/
npm run build
mkdir -p app/xulrunner
cp '$firefoxComponentsWsl' 'app/xulrunner/Firefox 140.12.0esr-win-x64 Components.zip'
app/scripts/dir_build -p w -a x64

rm -rf /tmp/research-workspace-addon
mkdir -p /tmp/research-workspace-addon
rsync -a --delete '$addonWsl/' /tmp/research-workspace-addon/
cd /tmp/research-workspace-addon
python3 -m zipfile -c /tmp/research-workspace.xpi .

mkdir -p '$wslBuild/app/staging/Zotero_win-x64/distribution/extensions'
cp /tmp/research-workspace.xpi \
	'$wslBuild/app/staging/Zotero_win-x64/distribution/extensions/research-workspace@tencent-practice.local.xpi'

rm -rf '$publishWsl'
mkdir -p '$publishWsl'
rsync -a --delete '$wslBuild/app/staging/Zotero_win-x64/' '$publishWsl/'
"@

Write-Host "构建 Zotero 9.0.6 Windows x64 内核…" -ForegroundColor Cyan
$commandPath = Join-Path $env:TEMP "research-workspace-build.sh"
[System.IO.File]::WriteAllText($commandPath, $command, [System.Text.UTF8Encoding]::new($false))
$commandWsl = Convert-ToWslPath $commandPath
try {
	& wsl -d $distro -- bash $commandWsl
	if ($LASTEXITCODE -ne 0) { throw "桌面端构建失败（退出码 $LASTEXITCODE）。" }
}
finally {
	Remove-Item -LiteralPath $commandPath -Force -ErrorAction SilentlyContinue
}

# Always finish and validate in a fresh publish directory. The currently running
# Library may still hold its old binaries, but can no longer corrupt a new build.
$exe = Join-Path $publish "zotero.exe"
$xpi = Join-Path $publish "distribution\extensions\research-workspace@tencent-practice.local.xpi"
if (!(Test-Path $exe)) { throw "构建完成但未找到 $exe" }
if (!(Test-Path $xpi)) { throw "构建完成但未找到内置 XPI。" }
if (!(Test-Path $libraryIcon)) { throw "缺少 Library 图标：$libraryIcon" }
if (!(Test-Path $updatePolicySource)) { throw "缺少 Library 更新策略：$updatePolicySource" }

# Zotero 的 Windows 构建从预制 EXE 解包，源码中的 ICO 不会自动写回 EXE。
# 每次构建后显式覆盖，确保系统窗口、任务栏和安装包统一显示 Library 的 L。
& $rcedit $exe --set-icon $libraryIcon
if ($LASTEXITCODE -ne 0) { throw "写入 Library L 图标失败（退出码 $LASTEXITCODE）。" }
$libraryExe = Join-Path $publish "Library.exe"
Copy-Item -LiteralPath $exe -Destination $libraryExe -Force

# Library 必须由自己的发布流程升级。若保留 Zotero 的应用更新通道，上游 MAR 包会在
# 首次启动后覆盖 Library.exe、品牌资源和 distribution/extensions。
$distributionDirectory = Join-Path $publish "distribution"
New-Item -ItemType Directory -Force -Path $distributionDirectory | Out-Null
Copy-Item -LiteralPath $updatePolicySource -Destination (Join-Path $distributionDirectory "policies.json") -Force

# Translate for Zotero 作为独立上游组件随 Library 分发。独立 XPI 边界便于审计和升级，
# 构建脚本会固定校验官方资产、Zotero 兼容范围、许可证和对应源码版本。
& (Join-Path $PSScriptRoot "build-translation-addon.ps1") -DistributionRoot $publish

$translationLock = Get-Content -Raw (Join-Path $workspace "desktop\third-party\translate-for-zotero.lock.json") | ConvertFrom-Json
$translationXpi = Join-Path $publish "distribution\extensions\$($translationLock.addonId).xpi"
if (!(Test-Path $translationXpi)) { throw "构建完成但未找到内置翻译 XPI。" }

# Better Notes 以 Library Notes 品牌作为独立内置 XPI 分发。保留独立边界可以固定上游
# 版本、审计品牌补丁，并随产物提供 AGPL 许可证和对应源码入口。
& (Join-Path $PSScriptRoot "build-library-notes-addon.ps1") -DistributionRoot $publish

$notesLock = Get-Content -Raw (Join-Path $workspace "desktop\third-party\better-notes.lock.json") | ConvertFrom-Json
$notesXpi = Join-Path $publish "distribution\extensions\$($notesLock.libraryAddonId).xpi"
if (!(Test-Path $notesXpi)) { throw "构建完成但未找到 Library Notes XPI。" }
& (Join-Path $PSScriptRoot "verify-library-notes-addon.ps1") -DistributionRoot $publish

$buildInfo = [ordered]@{
	product = "Library"
	zoteroVersion = "9.0.6"
	zoteroCommit = $expectedCommit
	platform = "win-x64"
	builtAt = (Get-Date).ToString("o")
	executable = $libraryExe
	addon = $xpi
	translationAddon = $translationXpi
	translationVersion = $translationLock.version
	notesAddon = $notesXpi
	notesVersion = $notesLock.libraryVersion
	notesUpstreamVersion = $notesLock.version
	notesBrandRevision = $notesLock.brandRevision
	updateStrategy = "Library-managed; upstream Zotero application updates disabled"
}
$buildInfo | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $publish "research-workspace-build.json")

# Publish is the only step that needs the old app to be fully stopped. Retry for
# a short bounded period because Windows may keep Gecko child processes alive
# briefly after the main window closes.
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$dist\*" } |
	ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$published = $false
for ($attempt = 1; $attempt -le 8; $attempt++) {
	try {
		if (Test-Path -LiteralPath $dist) {
			Remove-Item -LiteralPath $dist -Recurse -Force
		}
		Move-Item -LiteralPath $publish -Destination $dist
		$published = $true
		break
	}
	catch {
		if ($attempt -eq 8) { throw }
		Start-Sleep -Seconds 1
	}
}
if (!$published) { throw "Library 构建已完成，但无法发布到 $dist。" }
$libraryExe = Join-Path $dist "Library.exe"
Write-Host "构建完成：$libraryExe" -ForegroundColor Green
