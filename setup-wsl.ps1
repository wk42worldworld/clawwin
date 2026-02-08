# Stop Docker service to avoid conflicts
Write-Host "Stopping Docker service..."
Stop-Service com.docker.service -Force -ErrorAction SilentlyContinue
Write-Host "Docker service stopped."

# Create WSL directory
$wslDir = "E:\claudeProject\openclaw-desktop\wsl"
if (-not (Test-Path $wslDir)) {
    New-Item -ItemType Directory -Path $wslDir -Force | Out-Null
    Write-Host "Created WSL directory: $wslDir"
} else {
    Write-Host "WSL directory already exists"
}

# Import Ubuntu into WSL2
Write-Host ""
Write-Host "Importing Ubuntu as OpenClaw distro..."
wsl --import OpenClaw $wslDir "E:\claudeProject\openclaw-desktop\ubuntu-rootfs.tar.gz" --version 2 2>&1
Write-Host ""
Write-Host "Import exit code: $LASTEXITCODE"

# Verify
Write-Host ""
Write-Host "=== Verifying ==="
$raw = wsl --list --verbose 2>&1
$clean = $raw -replace "`0", ""
$clean | ForEach-Object { Write-Host $_ }
