wsl --terminate OpenClaw
Write-Host "OpenClaw distro terminated. Starting export..."

wsl --export OpenClaw "E:\claudeProject\openclaw-desktop\openclaw-clean.tar"
Write-Host "Export complete."

$file = Get-Item "E:\claudeProject\openclaw-desktop\openclaw-clean.tar"
$sizeMB = [math]::Round($file.Length / 1MB, 2)
$sizeGB = [math]::Round($file.Length / 1GB, 2)
Write-Host "File: $($file.FullName)"
Write-Host "Size: $($file.Length) bytes ($sizeMB MB / $sizeGB GB)"
