param([int]$Port=9224,[string]$TempDir)
$ErrorActionPreference='Stop'
$projectPath=[IO.Path]::GetFullPath($PSScriptRoot)
if ($projectPath.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase)) { throw '请先将项目放在 D 盘或其他数据盘，再启动。' }
if (-not $TempDir) {
    if ($env:CODEX_HOME -and -not $env:CODEX_HOME.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase)) { $TempDir=Join-Path $env:CODEX_HOME 'tmp\aoi-collector-runtime' }
    else { $TempDir=Join-Path $projectPath '.runtime' }
}
$TempDir=[IO.Path]::GetFullPath($TempDir)
if ($TempDir.StartsWith('C:\',[StringComparison]::OrdinalIgnoreCase)) { throw '请使用 -TempDir 指定 D 盘临时目录。' }
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$env:TEMP=$TempDir; $env:TMP=$TempDir; $env:AOI_TEMP_DIR=$TempDir
$env:PIP_CACHE_DIR=Join-Path $TempDir 'pip-cache'; $env:PIP_DISABLE_PIP_VERSION_CHECK='1'
$env:SE_CACHE_PATH=Join-Path $TempDir 'selenium-cache'; $env:SE_AVOID_STATS='true'
$env:PYTHONDONTWRITEBYTECODE='1'; $env:PYTHONIOENCODING='utf-8'; $env:AOI_PORT=[string]$Port
$pythonPath=Join-Path $projectPath '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & python -m venv (Join-Path $projectPath '.venv')
    if ($LASTEXITCODE -ne 0) { throw '创建 Python 环境失败，请先安装 Python 3.10 或以上版本。' }
}
$requirementsPath=Join-Path $projectPath 'requirements.txt'
$hash=(Get-FileHash -LiteralPath $requirementsPath -Algorithm SHA256).Hash
$marker=Join-Path $projectPath '.venv\requirements.sha256'
if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne $hash) {
    & $pythonPath -m pip install -r $requirementsPath
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
    Set-Content -LiteralPath $marker -Value $hash
}
Write-Host "打开浏览器访问 http://127.0.0.1:$Port/"
& $pythonPath (Join-Path $projectPath 'app.py')
