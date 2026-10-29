<#
.SYNOPSIS
Build the Reforked folder command and its package.
.DESCRIPTION
Use a trusted certificate for a release package. An unsigned package is for build checks only.
Pass the parent output directory to the installer build with -Dintellij.build.reforked.windows.shell.root=<directory>.
Build x64 and arm64 outputs before a build for both architectures.
#>
param(
  [ValidateSet('x64', 'arm64')] [string] $Architecture = 'x64',
  [version] $Version = '1.0.0.0',
  [string] $Publisher = 'CN=Reforked',
  [string] $CertificateThumbprint,
  [string] $TimestampUrl,
  [string] $OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$directoryName = if ($Architecture -eq 'x64') { 'amd64' } else { 'aarch64' }
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repository "out/reforked-shell/$directoryName"
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$buildDirectory = Join-Path $OutputDirectory 'build'
$layoutDirectory = Join-Path $buildDirectory 'package'
New-Item -ItemType Directory -Force -Path $layoutDirectory | Out-Null

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) { throw 'Visual Studio C++ tools are required.' }
$cmake = Join-Path $visualStudio 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
if (-not (Test-Path -LiteralPath $cmake)) { $cmake = (Get-Command cmake -ErrorAction Stop).Source }
$cmakeArchitecture = if ($Architecture -eq 'arm64') { 'ARM64' } else { 'x64' }
& $cmake -S $PSScriptRoot -B $buildDirectory -A $cmakeArchitecture
if ($LASTEXITCODE -ne 0) { throw 'CMake failed.' }
& $cmake --build $buildDirectory --config Release
if ($LASTEXITCODE -ne 0) { throw 'The native build failed.' }
Copy-Item -LiteralPath (Join-Path $buildDirectory 'Release/reforked-shell.dll') -Destination $OutputDirectory -Force

$kitsRoot = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -Name KitsRoot10).KitsRoot10
$sdkDirectory = Get-ChildItem -LiteralPath (Join-Path $kitsRoot 'bin') -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'x64/makeappx.exe') } |
  Sort-Object { [version] $_.Name } -Descending | Select-Object -First 1
if (-not $sdkDirectory) { throw 'The Windows SDK is required.' }
$sdkTools = Join-Path $sdkDirectory.FullName 'x64'

if ($CertificateThumbprint) {
  $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
  $Publisher = $certificate.Subject
  $signOptions = @('/sha1', $CertificateThumbprint, '/fd', 'SHA256')
  if ($TimestampUrl) { $signOptions += @('/tr', $TimestampUrl, '/td', 'SHA256') }
  & (Join-Path $sdkTools 'signtool.exe') sign @signOptions (Join-Path $OutputDirectory 'reforked-shell.dll')
  if ($LASTEXITCODE -ne 0) { throw 'The DLL signature failed.' }
}

$messages = ConvertFrom-StringData (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'shell.properties') -Raw)
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AppxManifest.xml.in') -Raw
$manifest = $manifest.Replace('@PUBLISHER@', [Security.SecurityElement]::Escape($Publisher)).
  Replace('@VERSION@', $Version.ToString(4)).Replace('@ARCHITECTURE@', $Architecture).
  Replace('@DESCRIPTION@', [Security.SecurityElement]::Escape($messages['package.description']))
[IO.File]::WriteAllText((Join-Path $layoutDirectory 'AppxManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))

Add-Type -AssemblyName System.Drawing
$icon = [Drawing.Icon]::new((Join-Path $repository 'build/idea-community-images/win/install.ico'), 256, 256)
$bitmap = $icon.ToBitmap()
try { $bitmap.Save((Join-Path $OutputDirectory 'reforked-shell.png'), [Drawing.Imaging.ImageFormat]::Png) }
finally { $bitmap.Dispose(); $icon.Dispose() }

$packagePath = Join-Path $OutputDirectory 'reforked-shell.msix'
& (Join-Path $sdkTools 'makeappx.exe') pack /o /d $layoutDirectory /nv /p $packagePath
if ($LASTEXITCODE -ne 0) { throw 'The package build failed.' }
if ($CertificateThumbprint) {
  & (Join-Path $sdkTools 'signtool.exe') sign @signOptions $packagePath
  if ($LASTEXITCODE -ne 0) { throw 'The package signature failed.' }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'shell.properties') -Destination (Join-Path $OutputDirectory 'reforked-shell.properties') -Force
