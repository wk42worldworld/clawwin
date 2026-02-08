$url = "https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz"
$outPath = "E:\claudeProject\openclaw-desktop\ubuntu-rootfs.tar.gz"

Write-Host "Downloading Ubuntu 24.04 WSL rootfs..."
Write-Host "URL: $url"

try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing -TimeoutSec 600
    $size = (Get-Item $outPath).Length
    Write-Host "Download complete! Size: $([math]::Round($size / 1MB, 2)) MB"
} catch {
    Write-Host "Primary download failed: $_"
    Write-Host "Trying Ubuntu base image..."
    try {
        $altUrl = "https://cloud-images.ubuntu.com/wsl/releases/22.04/current/ubuntu-jammy-wsl-amd64-wsl.rootfs.tar.gz"
        Invoke-WebRequest -Uri $altUrl -OutFile $outPath -UseBasicParsing -TimeoutSec 600
        $size = (Get-Item $outPath).Length
        Write-Host "Alt download complete! Size: $([math]::Round($size / 1MB, 2)) MB"
    } catch {
        Write-Host "All downloads failed: $_"
        exit 1
    }
}
