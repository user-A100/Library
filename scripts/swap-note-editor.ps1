# scripts/swap-note-editor.ps1 —— 开发快循环：重建 note-editor 并换装进 dist 的 omni.ja
$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$src = Join-Path $workspace "desktop\zotero\note-editor"
$dist = Join-Path $workspace "desktop\dist\Zotero_win-x64"
$omni = Join-Path $dist "app\omni.ja"
# webpack 输出目录为 build/<config-name>，zotero 目标即 build\zotero
$built = Join-Path $src "build\zotero"

Push-Location $src
npm run build:zotero
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "note-editor build failed" }
Pop-Location

# 停掉正在运行的 Library（沿用 run-desktop 的精确路径判定）
Get-CimInstance Win32_Process -Filter "Name='Library.exe'" |
	Where-Object { $_.ExecutablePath -eq (Join-Path $dist "Library.exe") } |
	ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($omni, "Update")
# 删旧条目（resource/note-editor/ 前缀），再按相对路径写入新文件
foreach ($entry in @($zip.Entries | Where-Object { $_.FullName -like "resource/note-editor/*" })) { $entry.Delete() }
Get-ChildItem $built -Recurse -File | ForEach-Object {
	$rel = "resource/note-editor/" + $_.FullName.Substring($built.Length + 1).Replace("\", "/")
	[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
}
$zip.Dispose()

Start-Process -FilePath (Join-Path $dist "Library.exe") `
	-ArgumentList @("-no-remote", "-profile", (Join-Path $workspace "desktop\profile"), "-ZoteroDebugText") `
	-RedirectStandardOutput (Join-Path $workspace "desktop\library-debug-live.log") `
	-RedirectStandardError (Join-Path $workspace "desktop\library-debug-live.err.log")
Write-Host "note-editor 已换装并重启 Library"
