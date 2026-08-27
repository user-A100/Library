$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $workspace "desktop\.tools\zotero-ci"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$cache = (Resolve-Path -LiteralPath $cache).Path
if (!$cache.StartsWith((Resolve-Path -LiteralPath $workspace).Path, [StringComparison]::OrdinalIgnoreCase)) {
	throw "缓存目录不在工作区内：$cache"
}

function Get-ParallelFile([string]$url, [string]$target, [int]$parts) {
	$headers = & curl.exe -sSI --connect-timeout 15 $url
	$lengthLine = $headers | Where-Object { $_ -match '^Content-Length:' } | Select-Object -Last 1
	if (!$lengthLine) { throw "无法获取文件大小：$url" }
	$length = [int64](($lengthLine -split ':', 2)[1].Trim())
	if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq $length) {
		Write-Host "已缓存：$(Split-Path $target -Leaf)" -ForegroundColor DarkGreen
		return
	}

	Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
	$jobs = @()
	$chunk = [math]::Ceiling($length / $parts)
	for ($index = 0; $index -lt $parts; $index++) {
		$start = [int64]($index * $chunk)
		$end = [math]::Min($length - 1, $start + $chunk - 1)
		if ($start -gt $end) { continue }
		$part = "$target.part$index"
		$expectedPartLength = $end - $start + 1
		if ((Test-Path -LiteralPath $part) -and (Get-Item -LiteralPath $part).Length -eq $expectedPartLength) {
			continue
		}
		Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
		$jobs += Start-Job -ScriptBlock {
			param($downloadURL, $output, $rangeStart, $rangeEnd)
			& curl.exe -sS -fL --retry 4 --connect-timeout 15 --max-time 180 -r "$rangeStart-$rangeEnd" -o $output $downloadURL
			if ($LASTEXITCODE -ne 0) { throw "curl 退出码 $LASTEXITCODE" }
		} -ArgumentList $url, $part, $start, $end
	}

	if ($jobs.Count) {
		$jobs | Wait-Job | Out-Null
		$failed = $jobs | Where-Object State -ne 'Completed'
		if ($failed) {
			$jobs | Receive-Job
			throw "并行下载失败：$url"
		}
	}

	$stream = [IO.File]::Open($target, [IO.FileMode]::Create, [IO.FileAccess]::Write)
	try {
		for ($index = 0; $index -lt $parts; $index++) {
			$part = "$target.part$index"
			$bytes = [IO.File]::ReadAllBytes($part)
			$stream.Write($bytes, 0, $bytes.Length)
		}
	}
	finally {
		$stream.Dispose()
	}

	if ($jobs.Count) { $jobs | Remove-Job -Force }
	for ($index = 0; $index -lt $parts; $index++) {
		Remove-Item -LiteralPath "$target.part$index" -Force -ErrorAction SilentlyContinue
	}
	$actual = (Get-Item -LiteralPath $target).Length
	if ($actual -ne $length) { throw "文件大小不匹配：$actual / $length" }
	Write-Host "下载完成：$(Split-Path $target -Leaf)（$actual 字节）" -ForegroundColor Green
}

Get-ParallelFile `
	"https://zotero-download.s3.amazonaws.com/ci/reader/9643fac7a4e86c8d7ff9548af0191e9df63aa998.zip" `
	(Join-Path $cache "9643fac7a4e86c8d7ff9548af0191e9df63aa998.zip") 8
Get-ParallelFile `
	"https://zotero-download.s3.amazonaws.com/ci/note-editor/107ab75c3247c6584bda2303ecbddf4b317fdd2d.zip" `
	(Join-Path $cache "107ab75c3247c6584bda2303ecbddf4b317fdd2d.zip") 4
