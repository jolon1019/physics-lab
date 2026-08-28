$ErrorActionPreference = 'Continue'
$env:XDG_DATA_HOME = 'D:\project\physics-lab\.vercel-cli-data'
$env:DO_NOT_TRACK = '1'
Set-Location D:\project\physics-lab

$map = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') { $map[$Matches[1]] = $Matches[2] }
}

$secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

$vars = [ordered]@{
  AUTH_SECRET = @{ value = $secret; sensitive = $true }
  SMTP_HOST   = @{ value = $map['SMTP_HOST']; sensitive = $false }
  SMTP_PORT   = @{ value = $map['SMTP_PORT']; sensitive = $false }
  SMTP_SECURE = @{ value = $map['SMTP_SECURE']; sensitive = $false }
  SMTP_USER   = @{ value = $map['SMTP_USER']; sensitive = $false }
  SMTP_PASS   = @{ value = $map['SMTP_PASS']; sensitive = $true }
  SMTP_FROM   = @{ value = $map['SMTP_FROM']; sensitive = $false }
}

foreach ($k in $vars.Keys) {
  $v = [string]$vars[$k].value
  $type = if ($vars[$k].sensitive) { 'secret' } else { 'config' }
  foreach ($target in 'production', 'preview', 'development') {
    npx --yes vercel env add $k $target --type $type --value $v --force 2>&1 | Out-Null
  }
  $ls = (npx --yes vercel env ls $type production 2>&1 | Out-String) + (npx --yes vercel env ls config production 2>&1 | Out-String)
  $ok = $ls -match [regex]::Escape($k)
  Write-Output ("{0} => {1}" -f $k, ($(if ($ok) { 'OK' } else { 'FAIL' })))
}
