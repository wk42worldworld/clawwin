try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:18789" -TimeoutSec 5 -UseBasicParsing
    Write-Output "Status: $($r.StatusCode)"
    Write-Output "Content: $($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}
