# cleanup-network.ps1 - Remove portproxy rules and firewall rules to restore clean state
# Must run as Administrator

Write-Host "=== Cleaning up netsh portproxy rules ===" -ForegroundColor Yellow

# Delete all known portproxy rules for port 18789
$addresses = @("127.0.0.1", "0.0.0.0", "*")
foreach ($addr in $addresses) {
    try {
        $result = netsh interface portproxy delete v4tov4 listenport=18789 listenaddress=$addr 2>&1
        Write-Host "  delete v4tov4 listenport=18789 listenaddress=${addr}: $result"
    } catch {
        Write-Host "  delete v4tov4 listenport=18789 listenaddress=${addr}: (not found or error)"
    }
}

Write-Host ""
Write-Host "=== Current portproxy rules (should be empty) ===" -ForegroundColor Yellow
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "=== Removing 'OpenClaw Gateway' firewall rule ===" -ForegroundColor Yellow
try {
    Remove-NetFirewallRule -DisplayName "OpenClaw Gateway" -ErrorAction Stop
    Write-Host "  Firewall rule 'OpenClaw Gateway' removed successfully." -ForegroundColor Green
} catch {
    Write-Host "  Firewall rule 'OpenClaw Gateway' not found (already clean)." -ForegroundColor Gray
}

# Also check for any other OpenClaw-related firewall rules
Write-Host ""
Write-Host "=== Checking for any remaining OpenClaw firewall rules ===" -ForegroundColor Yellow
$rules = Get-NetFirewallRule -DisplayName "*OpenClaw*" -ErrorAction SilentlyContinue
if ($rules) {
    foreach ($rule in $rules) {
        Write-Host "  Removing: $($rule.DisplayName)"
        Remove-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
    }
    Write-Host "  All OpenClaw firewall rules removed." -ForegroundColor Green
} else {
    Write-Host "  No OpenClaw firewall rules found (clean)." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Final verification ===" -ForegroundColor Yellow
Write-Host "Portproxy rules:"
$pp = netsh interface portproxy show v4tov4 2>&1
if ($pp -match "18789") {
    Write-Host "  WARNING: Port 18789 still has portproxy rules!" -ForegroundColor Red
} else {
    Write-Host "  CLEAN - No portproxy rules for port 18789." -ForegroundColor Green
}

Write-Host "Firewall rules:"
$fw = Get-NetFirewallRule -DisplayName "*OpenClaw*" -ErrorAction SilentlyContinue
if ($fw) {
    Write-Host "  WARNING: OpenClaw firewall rules still exist!" -ForegroundColor Red
} else {
    Write-Host "  CLEAN - No OpenClaw firewall rules." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Cleanup complete ===" -ForegroundColor Green
Write-Host "WSL2 native localhost forwarding should now work again."
Write-Host "Test: http://127.0.0.1:18789 from Windows browser."

# Write results to a log file so the non-admin caller can read them
$logPath = Join-Path $PSScriptRoot "cleanup-network.log"
$logContent = @"
=== Cleanup Results ===
Portproxy rules removed for port 18789.
Portproxy show v4tov4 output:
$pp

OpenClaw firewall rules: $(if ($fw) { 'STILL EXIST (warning)' } else { 'CLEAN' })
"@
$logContent | Out-File -FilePath $logPath -Encoding UTF8
