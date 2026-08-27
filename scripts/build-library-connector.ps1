$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConnectorRoot = Join-Path $ProjectRoot "connector\library-connector"
$BuildRoot = Join-Path $ConnectorRoot "build\manifestv3"
$DistRoot = Join-Path $ProjectRoot "dist\library-connector"

python (Join-Path $ProjectRoot "scripts\generate-library-icons.py")

$WslConnectorRoot = (wsl.exe wslpath -a ($ConnectorRoot -replace "\\", "/")).Trim()
if (-not $WslConnectorRoot) { throw "Unable to resolve connector path in WSL" }
$WslBuildScript = (wsl.exe wslpath -a ((Join-Path $ProjectRoot "scripts\build-library-connector.sh") -replace "\\", "/")).Trim()
wsl.exe bash $WslBuildScript $WslConnectorRoot
if ($LASTEXITCODE -ne 0) { throw "Library Connector build failed" }

node (Join-Path $ProjectRoot "scripts\brand-library-connector.mjs")
if ($LASTEXITCODE -ne 0) { throw "Library Connector branding failed" }

if (-not (Test-Path $BuildRoot)) { throw "Manifest V3 build output was not created" }
$ResolvedDistParent = (Resolve-Path (Join-Path $ProjectRoot "dist")).Path
if ($DistRoot -notlike "$ResolvedDistParent\*") { throw "Refusing to replace unexpected output path: $DistRoot" }
if (Test-Path $DistRoot) { Remove-Item -LiteralPath $DistRoot -Recurse -Force }
Copy-Item -LiteralPath $BuildRoot -Destination $DistRoot -Recurse

& (Join-Path $ProjectRoot "scripts\verify-library-connector.ps1")
