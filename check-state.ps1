Write-Host "=== WSL Distros ==="
$raw = wsl --list --verbose 2>&1
$clean = $raw -replace "`0", ""
$clean | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "=== Project Files ==="
Get-ChildItem "E:\claudeProject\openclaw-desktop" -Name

Write-Host ""
Write-Host "=== Rootfs Check ==="
if (Test-Path "E:\claudeProject\openclaw-desktop\ubuntu-rootfs.tar.gz") {
    $size = (Get-Item "E:\claudeProject\openclaw-desktop\ubuntu-rootfs.tar.gz").Length / 1MB
    Write-Host "EXISTS - Size: $([math]::Round($size,1)) MB"
} else {
    Write-Host "NOT FOUND"
}

Write-Host ""
Write-Host "=== WSL Dir Check ==="
if (Test-Path "E:\claudeProject\openclaw-desktop\wsl") {
    Write-Host "WSL dir exists"
    Get-ChildItem "E:\claudeProject\openclaw-desktop\wsl" -Name
} else {
    Write-Host "WSL dir does not exist"
}
