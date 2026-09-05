$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPort = 4177
for ($taskAttempt = 0; $taskAttempt -lt 10; $taskAttempt++) {
    $taskUrl = "http://127.0.0.1:$taskPort"
    try {
        $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 2
        if ($taskResponse.Content -match '余烬中的誓言') { Start-Process $taskUrl; exit }
        $taskPort++
    } catch { break }
}
$taskNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $taskNode) { throw '需要安装 Node.js 20.19 或更新版本后启动。' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
    & npm.cmd install --no-audit --no-fund --registry=https://registry.npmjs.org
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重新启动。' }
}
$taskArgs = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', "$taskPort", '--strictPort')
Start-Process -FilePath $taskNode -ArgumentList $taskArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
for ($taskReady = 0; $taskReady -lt 30; $taskReady++) {
    try { $null = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 1; Start-Process $taskUrl; exit } catch { Start-Sleep -Milliseconds 300 }
}
throw '游戏服务没有成功启动，请在此目录运行 npm run dev 查看原因。'
