$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

git config --local --unset-all credential.helper 2>$null
if ($LASTEXITCODE -gt 1) { throw "Kunne ikke rydde credential.helper" }
git config --local credential.helper "store --file=.git/credentials"

$username = Read-Host "GitHub-brukernavn"
$secureToken = Read-Host "GitHub token" -AsSecureString
$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
}

$payload = @"
protocol=https
host=github.com
username=$username
password=$token
"@

$payload | git credential-store --file=.git/credentials store
if ($LASTEXITCODE -ne 0) { throw "Klarte ikke lagre legitimasjon" }

Write-Host "Tester GitHub-tilgang..."
git -c credential.helper="store --file=.git/credentials" ls-remote origin HEAD
if ($LASTEXITCODE -ne 0) { throw "GitHub-tilgang feilet. Sjekk brukernavn/token/repo-rettigheter." }

Write-Host "GitHub-legitimasjon er lagret for dette repoet."
Write-Host "Du kan nå kjore: git -c credential.helper='store --file=.git/credentials' push -u origin main"