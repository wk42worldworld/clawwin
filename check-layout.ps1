Get-ChildItem 'E:\claudeProject\openclaw-desktop\release\win-unpacked\resources' -Recurse -File | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    $rel = $_.FullName.Replace('E:\claudeProject\openclaw-desktop\release\win-unpacked\resources\', '')
    Write-Output "  $rel  ($sizeMB MB)"
}
