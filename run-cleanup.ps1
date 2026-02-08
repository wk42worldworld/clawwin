# Launch cleanup-network.ps1 as Administrator and wait for it to finish
$scriptPath = Join-Path $PSScriptRoot "cleanup-network.ps1"
$proc = Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs -Wait -PassThru
Write-Host "Admin process exited with code: $($proc.ExitCode)"

# Read and display the log
$logPath = Join-Path $PSScriptRoot "cleanup-network.log"
if (Test-Path $logPath) {
    Write-Host ""
    Get-Content $logPath
}
