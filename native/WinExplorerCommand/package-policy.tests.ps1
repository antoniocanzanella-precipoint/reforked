# Copyright 2026 Reforked contributors. Use of this source code is governed by the Apache 2.0 license.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TestFunction([string] $Path, [string] $Name) {
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($Path, [ref] $tokens, [ref] $errors)
  if ($errors.Count) { throw ($errors | Out-String) }
  $definition = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
  }, $true)
  if (-not $definition) { throw "Missing function: $Name" }
  return [scriptblock]::Create($definition.Extent.Text)
}

function Assert-Equal($Expected, $Actual) {
  if ($Expected -cne $Actual) { throw "Expected '$Expected', got '$Actual'." }
}

function Assert-Throws([scriptblock] $Action) {
  $thrown = $false
  try { & $Action | Out-Null }
  catch { $thrown = $true }
  if (-not $thrown) { throw 'Expected the operation to fail.' }
}

$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$buildScript = Join-Path $PSScriptRoot 'build.ps1'
$integrationScript = Join-Path $repository 'build/conf/nsis/reforked-shell-integration.ps1'
foreach ($name in @('Get-ReforkedPackageVersion', 'Get-ReforkedPackagePublisher')) {
  . (Get-TestFunction $buildScript $name)
}
foreach ($name in @('Get-ReforkedPackageIdentity', 'Test-ReforkedExternalLocation')) {
  . (Get-TestFunction $integrationScript $name)
}

Assert-Equal '1.2.0.0' (Get-ReforkedPackageVersion ([version] '1.2'))
Assert-Equal '1.2.1.0' (Get-ReforkedPackageVersion ([version] '1.2.1'))
Assert-Equal '1.2.1.7' (Get-ReforkedPackageVersion ([version] '1.2.1.7'))
Assert-Equal '0.0.0.0' (Get-ReforkedPackageVersion ([version] '0.0'))
Assert-Equal '65535.65535.65535.65535' (Get-ReforkedPackageVersion ([version] '65535.65535.65535.65535'))
foreach ($value in @('65536.0', '1.65536', '1.2.65536', '1.2.3.65536')) {
  Assert-Throws { Get-ReforkedPackageVersion ([version] $value) }
}

$testPublisher = 'CN=Reforked Local Test, OID.2.25.311729368913984317654407730594956997722=1'
Assert-Equal 'CN=Signed Publisher' (Get-ReforkedPackagePublisher 'CN=Signed Publisher' $false 'certificate')
Assert-Equal $testPublisher (Get-ReforkedPackagePublisher 'CN=Ignored' $true '')
Assert-Throws { Get-ReforkedPackagePublisher 'CN=Reforked' $true 'certificate' }
Assert-Throws { Get-ReforkedPackagePublisher $testPublisher $false '' }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$tempDirectory = Join-Path $tempParent ('reforked-shell-policy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDirectory | Out-Null

function New-TestPackage([string] $Name, [string] $Publisher) {
  $path = Join-Path $tempDirectory ([guid]::NewGuid().ToString('N') + '.zip')
  $package = [IO.Compression.ZipFile]::Open($path, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $package.CreateEntry('AppxManifest.xml')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try {
      $escapedName = [Security.SecurityElement]::Escape($Name)
      $escapedPublisher = [Security.SecurityElement]::Escape($Publisher)
      $writer.Write('<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">' +
        '<Identity Name="' + $escapedName + '" Publisher="' + $escapedPublisher + '" Version="1.2.1.0" /></Package>')
    }
    finally { $writer.Dispose() }
  }
  finally { $package.Dispose() }
  return $path
}

try {
  $testPackage = New-TestPackage 'Reforked.Explorer' $testPublisher
  $identity = Get-ReforkedPackageIdentity $testPackage
  Assert-Equal $true $identity.AllowUnsigned
  Assert-Equal $testPublisher $identity.Publisher

  $signedPackage = New-TestPackage 'Reforked.Explorer' 'CN=Signed Publisher'
  Assert-Equal $false (Get-ReforkedPackageIdentity $signedPackage).AllowUnsigned

  $wrongName = New-TestPackage 'Different.Explorer' $testPublisher
  Assert-Throws { Get-ReforkedPackageIdentity $wrongName }
  $wrongPublisher = New-TestPackage 'Reforked.Explorer' $testPublisher.Replace('Reforked Local Test', 'Other Test')
  Assert-Throws { Get-ReforkedPackageIdentity $wrongPublisher }
  $extraPublisherField = New-TestPackage 'Reforked.Explorer' ($testPublisher + ', O=Other')
  Assert-Throws { Get-ReforkedPackageIdentity $extraPublisherField }
  $missingPublisher = New-TestPackage 'Reforked.Explorer' ''
  Assert-Throws { Get-ReforkedPackageIdentity $missingPublisher }

  Assert-Equal $true (Test-ReforkedExternalLocation ($tempDirectory.ToUpperInvariant() + '\') $tempDirectory)
  Assert-Equal $false (Test-ReforkedExternalLocation ($tempDirectory + '-other') $tempDirectory)
  Assert-Equal $false (Test-ReforkedExternalLocation '' $tempDirectory)
}
finally {
  $resolved = [IO.Path]::GetFullPath($tempDirectory)
  if ([IO.Path]::GetDirectoryName($resolved) -ne $tempParent -or
      -not [IO.Path]::GetFileName($resolved).StartsWith('reforked-shell-policy-')) {
    throw 'The test cleanup path is invalid.'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

Write-Output 'Package policy checks passed.'
