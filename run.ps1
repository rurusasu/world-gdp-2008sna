param([ValidateSet('setup','fetch','build','refresh','test','serve')][string]$Command = 'build')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    $taskBase = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $taskBase) {
        $taskBase = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    }
    if (-not (Test-Path -LiteralPath $taskBase)) { throw 'Python 3.12以降をインストールしてください。' }
    & $taskBase -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw '仮想環境の作成に失敗しました。' }
    $CommandNeedsSetup = $true
}
if ($Command -eq 'setup' -or $CommandNeedsSetup) {
    & $taskPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw '依存関係のインストールに失敗しました。' }
}
$taskPriorPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = Join-Path $PSScriptRoot 'src'
    switch ($Command) {
        'setup' { exit 0 }
        'test' { & $taskPython -m unittest discover -s tests -v }
        'serve' { & $taskPython -m http.server 8000 --bind 127.0.0.1 --directory site }
        default { & $taskPython -m gdp_report $Command }
    }
    if ($LASTEXITCODE -ne 0) { throw "処理が失敗しました: $Command" }
} finally { $env:PYTHONPATH = $taskPriorPath }
