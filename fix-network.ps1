# Add firewall rule to allow port 18789
New-NetFirewallRule -DisplayName "OpenClaw Gateway" -Direction Inbound -LocalPort 18789 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# Also try to delete and re-add the portproxy
netsh interface portproxy delete v4tov4 listenport=18789 listenaddress=127.0.0.1 2>$null
$wslIp = (wsl -d OpenClaw -- bash -c "hostname -I 2>/dev/null").Trim().Split(' ')[0]
Write-Output "WSL2 IP: $wslIp"
netsh interface portproxy add v4tov4 listenport=18789 listenaddress=127.0.0.1 connectport=18789 connectaddress=$wslIp
netsh interface portproxy show v4tov4

# Test
Start-Sleep -Seconds 1
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:18789/" -TimeoutSec 5 -UseBasicParsing
    Write-Output "SUCCESS: HTTP $($r.StatusCode)"
} catch {
    Write-Output "FAIL via 127.0.0.1: $($_.Exception.Message)"
    try {
        $r2 = Invoke-WebRequest -Uri "http://${wslIp}:18789/" -TimeoutSec 5 -UseBasicParsing
        Write-Output "SUCCESS via WSL IP: HTTP $($r2.StatusCode)"
    } catch {
        Write-Output "FAIL via WSL IP: $($_.Exception.Message)"
    }
}
