$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeCommand = if (Test-Path $bundledNode) { $bundledNode } else { "node" }

Write-Host "Starting Smart Mandi at http://127.0.0.1:3000"
& $nodeCommand backend\server.js
