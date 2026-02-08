Get-ChildItem 'E:\claudeProject\openclaw-desktop' -Recurse -File -Exclude 'ubuntu-rootfs.tar.gz' |
  Sort-Object FullName |
  Select-Object FullName, Length |
  Format-Table -AutoSize
