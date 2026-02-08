<#
.SYNOPSIS
    Check the system environment for OpenClaw Desktop prerequisites.

.DESCRIPTION
    Inspects the running system for:
      - Windows version (build number, edition, architecture)
      - CPU virtualization support (firmware + hypervisor)
      - Available disk space on the target drive
      - WSL installation status, version, and kernel info
      - Existing OpenClaw WSL distribution
    Outputs a single JSON object to stdout so the Electron front-end can
    parse it easily with JSON.parse().

.PARAMETER TargetDrive
    Drive letter (e.g. "C") to check for available disk space.
    Defaults to the system drive.

.PARAMETER DistroName
    Name of the WSL distribution to look for (default: OpenClaw).

.PARAMETER MinBuild
    Minimum required Windows build number (default: 19041 = Win10 2004).

.PARAMETER MinFreeGB
    Minimum required free disk space in GB (default: 3.0).

.OUTPUTS
    A JSON string written to stdout.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File check-env.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File check-env.ps1 -TargetDrive D
    powershell -NoProfile -ExecutionPolicy Bypass -File check-env.ps1 -DistroName MyDistro -MinFreeGB 5

.NOTES
    Does NOT require administrator privileges for most checks.
    Some queries (Get-WindowsOptionalFeature) may fail without admin;
    those failures are captured in the "errors" array rather than
    crashing the script.
    Designed to be called from the Electron main process.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$TargetDrive = '',

    [Parameter()]
    [string]$DistroName = 'OpenClaw',

    [Parameter()]
    [int]$MinBuild = 19041,

    [Parameter()]
    [double]$MinFreeGB = 3.0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Result object - structured for easy JSON serialisation
# ---------------------------------------------------------------------------
$result = [ordered]@{
    timestamp      = (Get-Date -Format 'o')
    overall        = [ordered]@{
        ready   = $false          # true only when ALL checks pass
        summary = ''              # human-readable one-liner
    }
    windows        = [ordered]@{
        version      = ''
        build        = 0
        edition      = ''
        architecture = ''
        meetsMinimum = $false
    }
    virtualization = [ordered]@{
        firmwareEnabled = $false
        hypervisorPresent = $false
        vmPlatformEnabled = $null  # null = could not determine (no admin)
    }
    disk           = [ordered]@{
        drive              = ''
        totalGB            = 0.0
        freeGB             = 0.0
        hasSufficientSpace = $false
    }
    wsl            = [ordered]@{
        installed         = $false
        featureEnabled    = $null  # null = could not determine
        vmPlatformEnabled = $null  # null = could not determine
        defaultVersion    = 0
        kernelVersion     = ''
    }
    distro         = [ordered]@{
        name       = $DistroName
        exists     = $false
        wslVersion = 0
        state      = ''
    }
    errors         = @()
}

# ---------------------------------------------------------------------------
# 1. Windows version information
# ---------------------------------------------------------------------------
try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop

    $result.windows.version      = $os.Version
    $result.windows.build        = [int]$os.BuildNumber
    $result.windows.edition      = $os.Caption
    $result.windows.architecture = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $result.windows.meetsMinimum = (
        ($result.windows.build -ge $MinBuild) -and
        ($result.windows.architecture -eq 'x64')
    )
}
catch {
    $result.errors += "Failed to query Windows version: $_"
}

# ---------------------------------------------------------------------------
# 2. Virtualization / Hyper-V support
# ---------------------------------------------------------------------------
try {
    # Firmware-level virtualisation (VT-x / AMD-V)
    $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop |
           Select-Object -First 1
    $result.virtualization.firmwareEnabled = [bool]$cpu.VirtualizationFirmwareEnabled
}
catch {
    $result.errors += "Failed to query CPU virtualisation: $_"
}

try {
    # Check if a hypervisor is currently active
    $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $result.virtualization.hypervisorPresent = [bool]$cs.HypervisorPresent
}
catch {
    $result.errors += "Failed to query hypervisor status: $_"
}

# Feature state queries require admin on older Windows builds
try {
    $vmFeature = Get-WindowsOptionalFeature -Online -FeatureName 'VirtualMachinePlatform' -ErrorAction Stop
    $result.virtualization.vmPlatformEnabled = ($vmFeature.State -eq 'Enabled')
    $result.wsl.vmPlatformEnabled            = ($vmFeature.State -eq 'Enabled')
}
catch {
    # Non-admin or feature not found - record but do not fail
    $result.errors += "Could not query VirtualMachinePlatform feature (may need admin): $_"
}

# ---------------------------------------------------------------------------
# 3. Disk space
# ---------------------------------------------------------------------------
try {
    if ([string]::IsNullOrWhiteSpace($TargetDrive)) {
        $TargetDrive = $env:SystemDrive.TrimEnd(':')
    }

    $driveLetter = $TargetDrive.TrimEnd(':').ToUpper()

    $disk = Get-CimInstance -ClassName Win32_LogicalDisk `
                -Filter "DeviceID='${driveLetter}:'" `
                -ErrorAction Stop

    if ($disk) {
        $result.disk.drive              = "${driveLetter}:"
        $result.disk.totalGB            = [math]::Round($disk.Size / 1GB, 2)
        $result.disk.freeGB             = [math]::Round($disk.FreeSpace / 1GB, 2)
        $result.disk.hasSufficientSpace = ($result.disk.freeGB -ge $MinFreeGB)
    }
    else {
        $result.errors += "Drive ${driveLetter}: not found."
    }
}
catch {
    $result.errors += "Failed to query disk space: $_"
}

# ---------------------------------------------------------------------------
# 4. WSL status
# ---------------------------------------------------------------------------

# 4a. WSL feature enabled?
try {
    $wslFeature = Get-WindowsOptionalFeature -Online `
                      -FeatureName 'Microsoft-Windows-Subsystem-Linux' `
                      -ErrorAction Stop
    $result.wsl.featureEnabled = ($wslFeature.State -eq 'Enabled')
}
catch {
    $result.errors += "Could not query WSL feature state (may need admin): $_"
}

# 4b. wsl.exe available + status
try {
    $wslCmd = Get-Command 'wsl.exe' -ErrorAction SilentlyContinue
    $result.wsl.installed = ($null -ne $wslCmd)

    if ($result.wsl.installed) {
        # Capture --status output (may be UTF-16 with null chars)
        $statusRaw = & wsl.exe --status 2>&1 | Out-String
        $statusText = $statusRaw -replace "`0", ''

        # Default version (English: "Default Version: 2", Chinese: "默认版本: 2")
        if ($statusText -match 'Default\s+Version[:\s]+(\d)') {
            $result.wsl.defaultVersion = [int]$Matches[1]
        }
        elseif ($statusText -match '默认版本[：:\s]+(\d)') {
            $result.wsl.defaultVersion = [int]$Matches[1]
        }

        # Kernel version
        if ($statusText -match 'Kernel\s+[Vv]ersion[:\s]+([\d\.\-]+)') {
            $result.wsl.kernelVersion = $Matches[1]
        }
        elseif ($statusText -match '内核版本[：:\s]+([\d\.\-]+)') {
            $result.wsl.kernelVersion = $Matches[1]
        }
    }
}
catch {
    $result.errors += "Failed to query WSL status: $_"
}

# ---------------------------------------------------------------------------
# 5. OpenClaw distro check
# ---------------------------------------------------------------------------
try {
    if ($result.wsl.installed) {
        $listRaw  = & wsl.exe --list --verbose 2>&1 | Out-String
        $listText = $listRaw -replace "`0", ''

        # Parse verbose list.  Each data line looks like:
        #   * Ubuntu       Running    2
        #     Debian       Stopped    2
        $lines = $listText -split "`r?`n" |
                 ForEach-Object { $_.Trim() } |
                 Where-Object  { $_ -ne '' }

        foreach ($line in $lines) {
            # Detailed match: name + state + version
            if ($line -match "^\*?\s*$([regex]::Escape($DistroName))\s+(Running|Stopped|Installing|Converting)\s+(\d+)\s*$") {
                $result.distro.exists     = $true
                $result.distro.state      = $Matches[1]
                $result.distro.wslVersion = [int]$Matches[2]
                break
            }
            # Fallback: just check if the distro name appears in the line
            elseif ($line -match "^\*?\s*$([regex]::Escape($DistroName))\b") {
                $result.distro.exists = $true
                $remainder = ($line -replace "^\*?\s*$([regex]::Escape($DistroName))\s*", '').Trim()
                $parts = $remainder -split '\s+' | Where-Object { $_ -ne '' }
                if ($parts.Count -ge 1) { $result.distro.state = $parts[0] }
                if ($parts.Count -ge 2) {
                    try { $result.distro.wslVersion = [int]$parts[1] } catch {}
                }
                break
            }
        }
    }
}
catch {
    $result.errors += "Failed to check for distro '$DistroName': $_"
}

# ---------------------------------------------------------------------------
# 6. Overall readiness assessment
# ---------------------------------------------------------------------------
$issues = @()

if (-not $result.windows.meetsMinimum) {
    $issues += "Windows version does not meet minimum (build $MinBuild, x64)"
}
if (-not $result.virtualization.firmwareEnabled) {
    $issues += 'CPU virtualization is not enabled in firmware (BIOS/UEFI)'
}
if (-not $result.disk.hasSufficientSpace) {
    $issues += "Insufficient disk space (need ${MinFreeGB} GB free)"
}
if ($result.wsl.featureEnabled -eq $false) {
    $issues += 'WSL feature is not enabled'
}
if ($result.wsl.vmPlatformEnabled -eq $false) {
    $issues += 'Virtual Machine Platform feature is not enabled'
}

if ($issues.Count -eq 0) {
    $result.overall.ready   = $true
    $result.overall.summary = 'System meets all requirements for OpenClaw Desktop.'
}
else {
    $result.overall.ready   = $false
    $result.overall.summary = "Issues found: $($issues -join '; ')"
}

# ---------------------------------------------------------------------------
# Output JSON
# ---------------------------------------------------------------------------
$json = $result | ConvertTo-Json -Depth 5 -Compress:$false
Write-Output $json

# Always exit 0; callers should inspect the JSON payload for details.
exit 0
