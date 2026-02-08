#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Import the OpenClaw WSL distribution from a tar.gz archive.

.DESCRIPTION
    Uses "wsl --import" to register a new WSL2 distribution from a pre-built
    filesystem image. If the distribution already exists the script defaults
    to keeping it (to avoid data loss in silent/automated contexts). Use the
    -Force switch to automatically unregister and replace an existing distro.

.PARAMETER InstallPath
    Directory where the WSL virtual disk (ext4.vhdx) will be stored.
    This is also used to derive the default image path if -ImagePath is
    not specified: "$InstallPath\..\image\openclaw.tar.gz".

.PARAMETER ImagePath
    Full path to the .tar.gz image file to import.
    Optional - defaults to "$InstallPath\..\image\openclaw.tar.gz".

.PARAMETER DistroName
    Name to register the distribution under (default: OpenClaw).

.PARAMETER Force
    If set, automatically replace an existing distribution without prompting.

.OUTPUTS
    Exit codes:
        0 - Import succeeded (or distro already exists and was kept).
        1 - Import failed.
        2 - User cancelled / aborted.

.NOTES
    Requires WSL2 to be enabled and the default version set to 2.
    Must be run with administrator privileges.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InstallPath,

    [Parameter()]
    [string]$ImagePath = '',

    [Parameter()]
    [string]$DistroName = 'OpenClaw',

    [Parameter()]
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Status {
    param([string]$Message)
    Write-Host "[OpenClaw Installer] $Message"
}

function Test-DistroExists {
    <#
    .SYNOPSIS
        Check whether a WSL distribution with the given name is registered.
    #>
    param([string]$Name)

    try {
        $rawOutput = & wsl.exe --list --quiet 2>&1
        # wsl --list may emit UTF-16 with embedded null characters on some
        # Windows builds. Normalise to plain text.
        $text = ($rawOutput | Out-String) -replace "`0", ''
        $distros = $text -split "`r?`n" |
                   ForEach-Object { $_.Trim() } |
                   Where-Object  { $_ -ne '' }

        return ($distros -contains $Name)
    }
    catch {
        Write-Warning "Could not enumerate WSL distributions: $_"
        return $false
    }
}

# ---------------------------------------------------------------------------
# Resolve the image path
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($ImagePath)) {
    # Derive from InstallPath: expect <root>\wsl  -> <root>\image\openclaw.tar.gz
    $parentDir = Split-Path -Path $InstallPath -Parent
    $ImagePath = Join-Path $parentDir 'image\openclaw.tar.gz'
    Write-Status "ImagePath not specified; derived: $ImagePath"
}

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
    Write-Error "Image file not found: $ImagePath"
    exit 1
}

$imageSizeMB = [math]::Round((Get-Item -LiteralPath $ImagePath).Length / 1MB, 1)
Write-Status "Image file: $ImagePath ($imageSizeMB MB)"

# Ensure the install directory exists
if (-not (Test-Path -LiteralPath $InstallPath -PathType Container)) {
    Write-Status "Creating install directory: $InstallPath"
    New-Item -Path $InstallPath -ItemType Directory -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Check for existing distribution
# ---------------------------------------------------------------------------
if (Test-DistroExists -Name $DistroName) {
    Write-Status "WSL distribution '$DistroName' already exists."

    if ($Force) {
        Write-Status '-Force specified. Unregistering existing distribution...'
        & wsl.exe --unregister $DistroName 2>&1 | ForEach-Object { Write-Status "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to unregister existing distribution '$DistroName' (exit code $LASTEXITCODE)."
            exit 1
        }
        Write-Status 'Existing distribution removed.'
    }
    else {
        # In silent / NSIS context we default to keeping the existing distro
        # to prevent data loss. Return success.
        Write-Status 'Keeping existing distribution. Import skipped.'
        exit 0
    }
}

# ---------------------------------------------------------------------------
# Import the distribution
# ---------------------------------------------------------------------------
Write-Status "Importing '$DistroName' into WSL2..."
Write-Status "  Image : $ImagePath"
Write-Status "  Target: $InstallPath"

$importArgs = @(
    '--import'
    $DistroName
    $InstallPath
    $ImagePath
    '--version'
    '2'
)

Write-Status "Running: wsl.exe $($importArgs -join ' ')"

# Use Start-Process so we can capture stdout/stderr separately and get the
# exit code reliably even when wsl.exe writes to both streams.
$stdoutLog = Join-Path $env:TEMP 'openclaw_import_stdout.log'
$stderrLog = Join-Path $env:TEMP 'openclaw_import_stderr.log'

$process = Start-Process -FilePath 'wsl.exe' `
    -ArgumentList $importArgs `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError  $stderrLog

# Read captured output
$stdOut = if (Test-Path $stdoutLog) {
    Get-Content $stdoutLog -Raw -ErrorAction SilentlyContinue
} else { '' }

$stdErr = if (Test-Path $stderrLog) {
    Get-Content $stderrLog -Raw -ErrorAction SilentlyContinue
} else { '' }

if ($stdOut) { Write-Status "  stdout: $($stdOut.Trim())" }
if ($stdErr) { Write-Status "  stderr: $($stdErr.Trim())" }

# Clean up temp logs
Remove-Item $stdoutLog -Force -ErrorAction SilentlyContinue
Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue

if ($process.ExitCode -ne 0) {
    Write-Error "wsl --import exited with code $($process.ExitCode)."
    exit 1
}

# ---------------------------------------------------------------------------
# Verify the import
# ---------------------------------------------------------------------------
Write-Status 'Verifying import...'

# Give WSL a moment to register the distro internally
Start-Sleep -Seconds 2

if (Test-DistroExists -Name $DistroName) {
    Write-Status "Distribution '$DistroName' imported and verified successfully."
    exit 0
}
else {
    Write-Error "Import command succeeded but distribution '$DistroName' is not visible in WSL. This may indicate a WSL internal error."
    exit 1
}
