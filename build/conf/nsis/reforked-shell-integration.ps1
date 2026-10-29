param(
  [Parameter(Mandatory)] [ValidateSet('Register', 'Unregister')] [string] $Action,
  [Parameter(Mandatory)] [string] $InstallDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
  $packageName = 'Reforked.Explorer'
  $packagePath = Join-Path $InstallDirectory 'bin/reforked-shell.msix'
  $packages = @(Get-AppxPackage -Name $packageName)
  if ($Action -eq 'Unregister') {
    $manager = [Windows.Management.Deployment.PackageManager, Windows.Management.Deployment, ContentType = WindowsRuntime]::new()
    foreach ($package in $packages) {
      $installedPackage = $manager.FindPackageForUser('', $package.PackageFullName)
      if ($installedPackage.EffectiveExternalLocation.Path.TrimEnd('\') -eq $InstallDirectory) {
        Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
      }
    }
    exit 0
  }

  $messages = ConvertFrom-StringData (Get-Content -LiteralPath (Join-Path $InstallDirectory 'bin/reforked-shell.properties') -Raw)
  if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'bin/reforked64.exe') -PathType Leaf)) {
    throw $messages['error.launcher']
  }
  try {
    Add-AppxPackage -Path $packagePath -ExternalLocation $InstallDirectory -ForceUpdateFromAnyVersion -ErrorAction Stop
  }
  catch {
    if ($_.Exception.HResult -ne -2147009285) { throw }
    $signer = (Get-AuthenticodeSignature -LiteralPath $packagePath).SignerCertificate
    if (-not $signer) { throw }
    $previousPackages = @($packages | Where-Object { $_.Publisher -eq $signer.Subject })
    if ($previousPackages.Count -eq 0) { throw }
    foreach ($package in $previousPackages) {
      Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
    }
    Add-AppxPackage -Path $packagePath -ExternalLocation $InstallDirectory -ForceUpdateFromAnyVersion -ErrorAction Stop
  }
}
catch {
  Write-Error -Message $_ -ErrorAction Continue
  exit 1
}
