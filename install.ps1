# Installs the Paste to Replace scripts on Windows.
#   - Illustrator: every installed "Adobe Illustrator*" in Program Files, every language
#   - InDesign:    every InDesign version/language in your user Scripts Panel folder
#
# Usage: right-click install.ps1 > "Run with PowerShell", or from PowerShell in this folder:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
# Quit Illustrator first (InDesign picks the script up without a restart).

$ErrorActionPreference = 'Stop'

$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$aiFile   = Join-Path $here 'PasteToReplace_Illustrator.jsx'
$idFile   = Join-Path $here 'PasteToReplace_InDesign.jsx'
$progDir  = if ($env:PTR_PROGRAM_FILES) { $env:PTR_PROGRAM_FILES } else { $env:ProgramFiles }  # override only for testing
$appData  = if ($env:PTR_APPDATA) { $env:PTR_APPDATA } else { $env:APPDATA }

foreach ($f in @($aiFile, $idFile)) {
    if (-not (Test-Path -LiteralPath $f)) {
        Write-Host "Missing $(Split-Path -Leaf $f). Run this script from the folder that contains both .jsx files." -ForegroundColor Red
        exit 1
    }
}

$installed  = 0
$needsAdmin = $false

function Copy-To([string]$file, [string]$dir) {
    try {
        Copy-Item -LiteralPath $file -Destination $dir -Force
        Write-Host "  OK  $(Join-Path $dir (Split-Path -Leaf $file))" -ForegroundColor Green
        $script:installed++
    } catch [System.UnauthorizedAccessException] {
        Write-Host "  Needs admin rights: $dir" -ForegroundColor Yellow
        $script:needsAdmin = $true
    } catch {
        Write-Host "  Could not copy to ${dir}: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host 'Illustrator:'
$aiDirs = @(Get-ChildItem -Path (Join-Path $progDir 'Adobe') -Directory -Filter 'Adobe Illustrator*' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem -Path (Join-Path $_.FullName 'Presets') -Directory -ErrorAction SilentlyContinue } |
    ForEach-Object { Join-Path $_.FullName 'Scripts' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container })
if ($aiDirs.Count -eq 0) { Write-Host "  - No Illustrator Scripts folder found in $progDir\Adobe" }
foreach ($d in $aiDirs) { Copy-To $aiFile $d }

Write-Host 'InDesign:'
$idDirs = @(Get-ChildItem -Path (Join-Path $appData 'Adobe\InDesign') -Directory -Filter 'Version*' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue } |
    ForEach-Object { Join-Path $_.FullName 'Scripts\Scripts Panel' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container })
if ($idDirs.Count -eq 0) { Write-Host '  - No InDesign Scripts Panel folder found (launch InDesign once, then run this again)' }
foreach ($d in $idDirs) { Copy-To $idFile $d }

Write-Host ''
if ($needsAdmin) {
    Write-Host 'Some folders need admin rights. Re-run PowerShell as Administrator and run this script again.' -ForegroundColor Yellow
}
if ($installed -gt 0) {
    Write-Host "Done: $installed file(s) installed."
    Write-Host 'Illustrator: restart it, then File > Scripts > PasteToReplace_Illustrator'
    Write-Host 'InDesign:    Window > Utilities > Scripts > User > PasteToReplace_InDesign.jsx'
    Write-Host 'Keyboard shortcut setup: see README.md'
} else {
    Write-Host 'Nothing was installed.' -ForegroundColor Red
    exit 1
}
