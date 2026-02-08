# Get WSL2 IP and set up port forwarding
$wslIp = (wsl -d OpenClaw -- bash -c "hostname -I").Trim().Split(' ')[0]
Write-Output "WSL2 IP: $wslIp"

# Remove old rule if exists
netsh interface portproxy delete v4tov4 listenport=18789 listenaddress=127.0.0.1 2>$null

# Add port forwarding: Windows 127.0.0.1:18789 -> WSL2 IP:18789
netsh interface portproxy add v4tov4 listenport=18789 listenaddress=127.0.0.1 connectport=18789 connectaddress=$wslIp

# Show result
netsh interface portproxy show v4tov4

# Test
Write-Output ""
Write-Output "Testing connection..."
$r = Invoke-WebRequest -Uri "http://127.0.0.1:18789/" -TimeoutSec 5 -UseBasicParsing
Write-Output "Result: HTTP $($r.StatusCode)"
