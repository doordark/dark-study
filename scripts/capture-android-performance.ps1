param(
  [ValidateSet('cold-start', 'farm-town', 'long-chat')][string]$Scenario = 'farm-town',
  [ValidateSet('before', 'after')][string]$Phase = 'after',
  [ValidateSet('smooth', 'standard', 'beautiful')][string]$Quality = 'standard',
  [ValidateRange(5, 60)][int]$Seconds = 30,
  [string]$Serial,
  [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$OutputDirectory = '.tmp-performance'
)
$ErrorActionPreference = 'Stop'
$packageName = 'com.darkstudy.app'
if (!(Test-Path -LiteralPath $Adb)) { throw "找不到 adb：$Adb" }
$devices = & $Adb devices
$readyDevices = @($devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if (!$Serial) {
  if ($readyDevices.Count -ne 1) { throw '请连接并授权一台设备，或通过 -Serial 指定设备。' }
  $Serial = $readyDevices[0]
}
if ($Serial -notin $readyDevices) { throw '指定设备未连接或尚未授权。' }
$captureName = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$Scenario-$Phase-$Quality"
$captureDirectory = Join-Path $OutputDirectory $captureName
New-Item -ItemType Directory -Path $captureDirectory -Force | Out-Null
function Read-Adb([string[]]$Arguments) {
  $result = & $Adb -s $Serial @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
  return $result
}
$packageInfo = Read-Adb @('shell', 'dumpsys', 'package', $packageName)
if (!(($packageInfo -join "`n") -match 'versionName=')) { throw '设备没有安装 Dark Study。' }
$metadata = @{
  scenario = $Scenario; phase = $Phase; quality = $Quality; seconds = $Seconds
  serial = $Serial; capturedAt = (Get-Date).ToString('o')
  model = (Read-Adb @('shell', 'getprop', 'ro.product.model')) -join ''
  android = (Read-Adb @('shell', 'getprop', 'ro.build.version.release')) -join ''
  build = @($packageInfo | Select-String 'versionName=|versionCode=|DEBUGGABLE|PROFILEABLE' | ForEach-Object { $_.Line.Trim() })
}
$metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $captureDirectory 'metadata.json') -Encoding utf8
if ($Scenario -eq 'cold-start') {
  $component = (Read-Adb @('shell', 'cmd', 'package', 'resolve-activity', '--brief', $packageName) | Select-Object -Last 1).Trim()
  if ($component -notmatch '^com\.darkstudy\.app/') { throw '无法解析启动页面。' }
  Read-Adb @('shell', 'am', 'force-stop', $packageName) | Out-Null
  Read-Adb @('shell', 'am', 'start', '-W', '-n', $component) | Set-Content -LiteralPath (Join-Path $captureDirectory 'startup.txt') -Encoding utf8
}
if (!((Read-Adb @('shell', 'pidof', $packageName)) -join '').Trim()) { throw '请先打开应用并进入要测量的页面。' }
Read-Adb @('shell', 'dumpsys', 'meminfo', $packageName) | Set-Content -LiteralPath (Join-Path $captureDirectory 'meminfo-before.txt') -Encoding utf8
Read-Adb @('shell', 'dumpsys', 'gfxinfo', $packageName, 'reset') | Out-Null
Write-Host "采集 $Seconds 秒：请执行 $Scenario 场景。画质需在应用里手动设为 $Quality。"
for ($remaining = $Seconds; $remaining -gt 0; $remaining--) {
  Write-Progress -Activity '采集 Dark Study 性能' -Status "还剩 $remaining 秒" -PercentComplete (($Seconds - $remaining) * 100 / $Seconds)
  Start-Sleep -Seconds 1
}
Write-Progress -Activity '采集 Dark Study 性能' -Completed
Read-Adb @('shell', 'dumpsys', 'gfxinfo', $packageName) | Set-Content -LiteralPath (Join-Path $captureDirectory 'gfxinfo.txt') -Encoding utf8
Read-Adb @('shell', 'dumpsys', 'gfxinfo', $packageName, 'framestats') | Set-Content -LiteralPath (Join-Path $captureDirectory 'framestats.txt') -Encoding utf8
Read-Adb @('shell', 'dumpsys', 'meminfo', $packageName) | Set-Content -LiteralPath (Join-Path $captureDirectory 'meminfo-after.txt') -Encoding utf8
Read-Adb @('shell', 'dumpsys', 'window', 'windows') | Set-Content -LiteralPath (Join-Path $captureDirectory 'window.txt') -Encoding utf8
& node (Join-Path $PSScriptRoot 'summarize-android-performance.cjs') $captureDirectory
if ($LASTEXITCODE -ne 0) { throw '性能摘要生成失败，原始记录已保留。' }
Write-Host "采集完成：$captureDirectory"
