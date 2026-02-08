#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Enable WSL2 required Windows features if not already enabled.

.DESCRIPTION
    Checks the current state of "Microsoft-Windows-Subsystem-Linux" and
    "VirtualMachinePlatform" optional features. Enables any that are not
    already active. Returns both a structured echo string and an exit code
    so the caller (NSIS or another automation tool) can determine whether
    a restart is needed.

    Output markers (written to stdout):
        RESTART_REQUIRED - One or more features were enabled and a reboot
                           is needed before WSL2 will function.
        NO_RESTART       - All features are already enabled; no reboot.

    Exit codes:
        0 - All features already enabled; no reboot needed.
        1 - Features were enabled (or enable-pending); reboot required.
        2 - An error occurred.

.NOTES
    Must be run with administrator privileges.
    Designed for Windows 10 2004 (Build 19041) and later.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
$requiredFeatures = @(
    'Microsoft-Windows-Subsystem-Linux'
    'VirtualMachinePlatform'
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Status {
    param([string]$Message)
    Write-Host "[OpenClaw Installer] $Message"
}

function Get-FeatureState {
    <#
    .SYNOPSIS
        Returns the state of a Windows optional feature as a string.
    .OUTPUTS
        'Enabled', 'Disabled', 'EnablePending', 'DisablePending', or 'Unknown'.
    #>
    param(
        [Parameter(Mandatory)]
        [string]$FeatureName
    )

    try {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName $FeatureName -ErrorAction Stop
        return $feature.State.ToString()
    }
    catch {
        Write-Warning "Could not query feature '$FeatureName': $_"
        return 'Unknown'
    }
}

# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------
try {
    Write-Status 'Checking WSL2 prerequisite features...'

    $rebootNeeded = $false
    $allAlreadyEnabled = $true

    foreach ($featureName in $requiredFeatures) {
        $state = Get-FeatureState -FeatureName $featureName
        Write-Status "  Feature: $featureName  State: $state"

        switch ($state) {
            'Enabled' {
                # Already good - nothing to do
                Write-Status "  -> Already enabled."
            }

            'EnablePending' {
                # Was enabled in a prior attempt but reboot is still pending
                Write-Status "  -> Enable is pending a reboot."
                $rebootNeeded = $true
                $allAlreadyEnabled = $false
            }

            default {
                # Disabled, DisablePending, or Unknown - need to enable
                $allAlreadyEnabled = $false
                Write-Status "  -> Enabling $featureName ..."

                $result = Enable-WindowsOptionalFeature `
                    -Online `
                    -FeatureName $featureName `
                    -All `
                    -NoRestart `
                    -WarningAction SilentlyContinue `
                    -ErrorAction Stop

                if ($result.RestartNeeded) {
                    $rebootNeeded = $true
                    Write-Status "  -> $featureName enabled successfully (reboot required)."
                }
                else {
                    Write-Status "  -> $featureName enabled successfully (no reboot required)."
                }
            }
        }
    }

    # --- Output the result marker and exit code ---
    if ($allAlreadyEnabled -and (-not $rebootNeeded)) {
        Write-Status 'All WSL2 features are already enabled. No reboot needed.'
        Write-Output 'NO_RESTART'
        exit 0
    }

    if ($rebootNeeded) {
        Write-Status 'One or more features require a system restart to take effect.'
        Write-Output 'RESTART_REQUIRED'
        exit 1
    }

    # Features were just enabled and no reboot flag was set (rare but possible
    # on some Windows builds where the feature activates immediately).
    Write-Status 'Features enabled successfully. No reboot needed.'
    Write-Output 'NO_RESTART'
    exit 0
}
catch {
    Write-Error "Failed to enable WSL2 features: $_"
    Write-Status "ERROR: $_"
    Write-Output 'ERROR'
    exit 2
}
