Get-ChildItem 'E:\claudeProject\openclaw-desktop\release' -File | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Output "$($_.Name)  $sizeMB MB"
}
