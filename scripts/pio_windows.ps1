param(
    [ValidateSet('build','upload')][string]$Action = 'build',
    [string]$Port
)
$ErrorActionPreference = 'Stop'
function Read-Sha256([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-','') }
    finally { $algorithm.Dispose() }
}
function Copy-Changed([string]$Source, [string]$Destination) {
    if (!(Test-Path -LiteralPath $Destination) -or (Read-Sha256 $Source) -ne (Read-Sha256 $Destination)) {
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }
}
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$projectRoot = Join-Path $workspaceRoot 'reader'
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'SOURCE_MANIFEST.json'))) { throw 'Canonical reader project is missing.' }
$pioPython = Join-Path $env:USERPROFILE '.platformio\penv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pioPython)) { throw 'Install PlatformIO Core/VS Code extension first.' }
& $pioPython (Join-Path $workspaceRoot 'scripts\sync_reader_web.py') --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Action -eq 'upload') {
    if ($Port -notmatch '^COM[0-9]+$') { throw 'Explicit target required: flash.bat COM9' }
    & $pioPython (Join-Path $workspaceRoot 'pc\check_port.py') $Port
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
# ESP-IDF/PlatformIO canonicalize subst paths inconsistently. Copy only build
# inputs into a project-specific cache without spaces; never move the workspace.
$hashAlgo = [System.Security.Cryptography.SHA256]::Create()
$projectHash = ([BitConverter]::ToString($hashAlgo.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot)))).Replace('-','').Substring(0,12)
$hashAlgo.Dispose()
$stage = Join-Path $env:USERPROFILE ('.platformio\reader-builds\current-reader-' + $projectHash)
if ($stage.Contains(' ')) { throw 'Build cache must have a path without spaces.' }
New-Item -ItemType Directory -Force -Path $stage,(Join-Path $stage 'src') | Out-Null
foreach ($file in @('platformio.ini','CMakeLists.txt','sdkconfig.defaults','partitions.csv')) {
    Copy-Changed (Join-Path $projectRoot $file) (Join-Path $stage $file)
}
foreach ($folder in @('src','web')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $stage $folder) | Out-Null
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File) {
        Copy-Changed $file.FullName (Join-Path (Join-Path $stage $folder) $file.Name)
    }
}
$defaultsHash = Read-Sha256 (Join-Path $stage 'sdkconfig.defaults')
$stamp = Join-Path $stage 'defaults.sha256'
if (!(Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $defaultsHash) {
    $generatedConfig = Join-Path $stage 'sdkconfig.esp32c3'
    if (Test-Path -LiteralPath $generatedConfig) { Remove-Item -LiteralPath $generatedConfig }
    Set-Content -LiteralPath $stamp -Value $defaultsHash
}
Write-Host "Build cache: $stage"
$pioArgs = @('-m','platformio','run','-d',$stage)
if ($Action -eq 'upload') { $pioArgs += @('-t','upload','--upload-port',$Port) }
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & $pioPython @pioArgs 2>&1 | Tee-Object -FilePath (Join-Path $projectRoot ($Action + '.log'))
    $result = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
if ($result -eq 0) {
    $artifacts = Join-Path $projectRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    foreach ($name in @('firmware.bin','firmware.elf','bootloader.bin','partitions.bin')) {
        Copy-Item -LiteralPath (Join-Path $stage ('.pio\build\esp32c3\' + $name)) -Destination $artifacts -Force
    }
    Copy-Item -LiteralPath (Join-Path $stage 'sdkconfig.esp32c3') -Destination $artifacts -Force
    $hashLines = foreach ($item in Get-ChildItem -LiteralPath $artifacts -Filter '*.bin') {
        (Read-Sha256 $item.FullName) + '  ' + $item.Name
    }
    Set-Content -LiteralPath (Join-Path $artifacts 'sha256.txt') -Value $hashLines
}
exit $result
