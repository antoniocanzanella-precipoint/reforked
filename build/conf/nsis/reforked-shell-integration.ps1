param(
  [Parameter(Mandatory)] [ValidateSet('Register', 'Unregister')] [string] $Action,
  [Parameter(Mandatory)] [string] $InstallDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ReforkedPackageIdentity([string] $Path) {
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $package = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $package.GetEntry('AppxManifest.xml')
    if (-not $entry) { throw 'The Explorer package manifest is missing.' }
    $stream = $entry.Open()
    try {
      $settings = [Xml.XmlReaderSettings]::new()
      $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
      $settings.XmlResolver = $null
      $reader = [Xml.XmlReader]::Create($stream, $settings)
      try {
        $manifest = [Xml.XmlDocument]::new()
        $manifest.Load($reader)
      }
      finally { $reader.Dispose() }
    }
    finally { $stream.Dispose() }
  }
  finally { $package.Dispose() }

  $namespaces = [Xml.XmlNamespaceManager]::new($manifest.NameTable)
  $namespaces.AddNamespace('m', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
  $identity = $manifest.SelectSingleNode('/m:Package/m:Identity', $namespaces)
  if (-not $identity -or $identity.GetAttribute('Name') -cne 'Reforked.Explorer') {
    throw 'The Explorer package identity is invalid.'
  }
  $publisher = $identity.GetAttribute('Publisher')
  if (-not $publisher) { throw 'The Explorer package publisher is missing.' }
  $testPublisher = 'CN=Reforked Local Test, OID.2.25.311729368913984317654407730594956997722=1'
  $allowUnsigned = $publisher -ceq $testPublisher
  if (-not $allowUnsigned -and $publisher.Contains('OID.2.25.311729368913984317654407730594956997722')) {
    throw 'The Explorer package has an unknown unsigned publisher.'
  }
  return [pscustomobject]@{ Publisher = $publisher; AllowUnsigned = $allowUnsigned }
}

function Test-ReforkedExternalLocation([string] $Location, [string] $InstallDirectory) {
  return $Location -and [IO.Path]::GetFullPath($Location).TrimEnd('\').Equals(
    [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

try {
  $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
  $packageName = 'Reforked.Explorer'
  $packagePath = Join-Path $InstallDirectory 'bin/reforked-shell.msix'
  $packages = @(Get-AppxPackage -Name $packageName)
  if ($Action -eq 'Unregister') {
    $manager = [Windows.Management.Deployment.PackageManager, Windows.Management.Deployment, ContentType = WindowsRuntime]::new()
    foreach ($package in $packages) {
      $installedPackage = $manager.FindPackageForUser('', $package.PackageFullName)
      if ($installedPackage.EffectiveExternalLocation -and
          (Test-ReforkedExternalLocation $installedPackage.EffectiveExternalLocation.Path $InstallDirectory)) {
        Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
      }
    }
    exit 0
  }

  $messages = ConvertFrom-StringData (Get-Content -LiteralPath (Join-Path $InstallDirectory 'bin/reforked-shell.properties') -Raw)
  if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'bin/reforked64.exe') -PathType Leaf)) {
    throw $messages['error.launcher']
  }
  $identity = Get-ReforkedPackageIdentity $packagePath
  if ($identity.AllowUnsigned) {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
      $principal = [Security.Principal.WindowsPrincipal]::new($currentUser)
      if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'The unsigned Explorer test package requires administrator installation.'
      }
    }
    finally { $currentUser.Dispose() }
  }
  try {
    Add-AppxPackage -Path $packagePath -ExternalLocation $InstallDirectory -ForceUpdateFromAnyVersion `
      -AllowUnsigned:$identity.AllowUnsigned -ErrorAction Stop
  }
  catch {
    if ($_.Exception.HResult -ne -2147009285) { throw }
    if (-not $identity.AllowUnsigned) {
      $signer = (Get-AuthenticodeSignature -LiteralPath $packagePath).SignerCertificate
      if (-not $signer -or $signer.Subject -cne $identity.Publisher) { throw }
    }
    $manager = [Windows.Management.Deployment.PackageManager, Windows.Management.Deployment, ContentType = WindowsRuntime]::new()
    $previousPackages = @($packages | Where-Object {
      if ($_.Publisher -cne $identity.Publisher) { return $false }
      $installedPackage = $manager.FindPackageForUser('', $_.PackageFullName)
      $installedPackage.EffectiveExternalLocation -and
        (Test-ReforkedExternalLocation $installedPackage.EffectiveExternalLocation.Path $InstallDirectory)
    })
    if ($previousPackages.Count -eq 0) { throw }
    foreach ($package in $previousPackages) {
      Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
    }
    Add-AppxPackage -Path $packagePath -ExternalLocation $InstallDirectory -ForceUpdateFromAnyVersion `
      -AllowUnsigned:$identity.AllowUnsigned -ErrorAction Stop
  }
}
catch {
  Write-Error -Message $_ -ErrorAction Continue
  exit 1
}
