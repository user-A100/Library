$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DistRoot = Join-Path $ProjectRoot "dist\library-connector"
$ManifestPath = Join-Path $DistRoot "manifest.json"
if (-not (Test-Path $ManifestPath)) { throw "Library Connector manifest is missing" }

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.name -ne "Library Connector") { throw "Unexpected connector name: $($Manifest.name)" }
if ($Manifest.manifest_version -ne 3) { throw "Manifest V3 build expected" }
if ($Manifest.host_permissions -notcontains "http://127.0.0.1/*") { throw "Local Library permission is missing" }
if ($Manifest.host_permissions -contains "https://api.zotero.org/*") { throw "Cloud API permission must not be present" }
if (($Manifest.content_scripts | ConvertTo-Json -Depth 20) -match "googleDocs|zotero-google-docs") { throw "Google Docs integration must not be bundled" }
if (-not (Test-Path (Join-Path $DistRoot "Icon-128.png"))) { throw "Library icon is missing" }

$VisibleFiles = @($ManifestPath) + @(Get-ChildItem (Join-Path $DistRoot "_locales") -Filter messages.json -Recurse | Select-Object -ExpandProperty FullName)
foreach ($File in $VisibleFiles) {
  $Text = Get-Content -LiteralPath $File -Raw
  if ($Text -match '"message"\s*:\s*"[^"]*Zotero') { throw "Visible Zotero branding remains in $File" }
}
Write-Host "Library Connector verified: local capture, Library branding, no cloud fallback UI."
