import contextlib
import importlib.util
import io
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
import zlib


VERIFIER_PATH = Path(__file__).with_name('verify-windows-shell.py')
SPEC = importlib.util.spec_from_file_location('verify_windows_shell', VERIFIER_PATH)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)

NS = {
    'appx': 'http://schemas.microsoft.com/appx/manifest/foundation/windows10',
    'com': 'http://schemas.microsoft.com/appx/manifest/com/windows10',
    'desktop4': 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/4',
    'desktop5': 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/5',
}
PAYLOAD_NAMES = (
    'reforked-shell.dll', 'reforked-shell.msix', 'reforked-shell.png',
    'reforked-shell-integration.ps1', 'reforked-shell.properties',
)
MANIFEST = r'''<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
         xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
         xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
         xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap uap10 com desktop4 desktop5 rescap">
  <Identity Name="Reforked.Explorer"
            Publisher="CN=Reforked Local Test, OID.2.25.311729368913984317654407730594956997722=1"
            Version="1.2.1.0" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>Reforked</DisplayName>
    <PublisherDisplayName>Reforked</PublisherDisplayName>
    <Logo>bin\reforked-shell.png</Logo>
    <uap10:AllowExternalContent>true</uap10:AllowExternalContent>
  </Properties>
  <Resources><Resource Language="en-US" /></Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Applications>
    <Application Id="Reforked" Executable="bin\reforked64.exe"
                 uap10:TrustLevel="mediumIL" uap10:RuntimeBehavior="win32App">
      <uap:VisualElements DisplayName="Reforked" Description="Open files and folders in Reforked"
                          BackgroundColor="transparent" Square150x150Logo="bin\reforked-shell.png"
                          Square44x44Logo="bin\reforked-shell.png" AppListEntry="none" />
      <Extensions>
        <com:Extension Category="windows.comServer">
          <com:ComServer><com:SurrogateServer DisplayName="Reforked">
            <com:Class Id="9FAD6B45-367B-4F7E-A862-4E7E287FC017" Path="bin\reforked-shell.dll" ThreadingModel="STA" />
          </com:SurrogateServer></com:ComServer>
        </com:Extension>
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type="*">
              <desktop5:Verb Id="EditWithReforked" Clsid="9FAD6B45-367B-4F7E-A862-4E7E287FC017" />
            </desktop5:ItemType>
            <desktop5:ItemType Type="Directory">
              <desktop5:Verb Id="OpenWithReforked" Clsid="9FAD6B45-367B-4F7E-A862-4E7E287FC017" />
            </desktop5:ItemType>
            <desktop5:ItemType Type="Directory\Background">
              <desktop5:Verb Id="OpenWithReforked" Clsid="9FAD6B45-367B-4F7E-A862-4E7E287FC017" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
'''


def manifest_fixture(architecture):
    root = ET.fromstring(MANIFEST)
    root.find('appx:Identity', NS).set('ProcessorArchitecture', architecture)
    return root


def pe_fixture(architecture):
    image = bytearray(1024)
    image[:2] = b'MZ'
    struct.pack_into('<I', image, 0x3c, 0x80)
    image[0x80:0x84] = b'PE\0\0'
    machine = 0x8664 if architecture == 'x64' else 0xAA64
    struct.pack_into('<HHIIIHH', image, 0x84, machine, 1, 0, 0, 0, 240, 0x2022)
    optional = 0x98
    struct.pack_into('<H', image, optional, 0x20b)
    struct.pack_into('<I', image, optional + 16, 0x1000)
    struct.pack_into('<Q', image, optional + 24, 0x180000000)
    struct.pack_into('<II', image, optional + 32, 0x1000, 0x200)
    struct.pack_into('<II', image, optional + 56, 0x2000, 0x200)
    struct.pack_into('<I', image, optional + 108, 16)
    section = optional + 240
    image[section:section + 8] = b'.text\0\0\0'
    struct.pack_into('<IIII', image, section + 8, 4, 0x1000, 0x200, 0x200)
    struct.pack_into('<I', image, section + 36, 0x60000020)
    image[0x200:0x204] = b'\xc3\x90\x90\x90' if architecture == 'x64' else b'\xc0\x03\x5f\xd6'
    return bytes(image)


def png_fixture():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    pixels = (b'\0' + b'\x54\xd6\xc7\xff' * 256) * 256
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 256, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))


def package_fixture(root, signature=False):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as package:
        package.writestr('AppxManifest.xml', ET.tostring(root, encoding='utf-8', xml_declaration=True))
        if signature:
            package.writestr('AppxSignature.p7x', b'an unexpected signature')
    return buffer.getvalue()


def payload_fixture(architecture):
    return {
        'reforked-shell.dll': pe_fixture(architecture),
        'reforked-shell.msix': package_fixture(manifest_fixture(architecture)),
        'reforked-shell.png': png_fixture(),
        'reforked-shell-integration.ps1': b'param([string] $Action, [string] $InstallDirectory)\n',
        'reforked-shell.properties': b'menu.open.folder=Open with Reforked\nmenu.edit.file=Edit with Reforked\n',
    }


class WindowsShellPackagingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)

    def distribution(self, architecture='x64', payload=None, prefix='Reforked/', filename=None):
        if filename is None:
            filename = 'reforked.win.zip' if architecture == 'x64' else 'reforked-aarch64.win.zip'
        path = self.directory / filename
        if payload is None:
            payload = payload_fixture(architecture)
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in payload.items():
                archive.writestr(f'{prefix}bin/{name}', data)
        return path

    def reject_manifest(self, root):
        payload = payload_fixture('x64')
        payload['reforked-shell.msix'] = package_fixture(root)
        with self.assertRaises(ValueError):
            VERIFIER.verify_archive(self.distribution(payload=payload), 'x64')

    def test_accepts_both_architectures_with_flat_or_product_root(self):
        for architecture in ('x64', 'arm64'):
            for prefix in ('', 'Reforked/'):
                with self.subTest(architecture=architecture, prefix=prefix):
                    VERIFIER.verify_archive(self.distribution(architecture, prefix=prefix), architecture)

    def test_command_line_accepts_a_complete_distribution_pair(self):
        self.distribution('x64')
        self.distribution('arm64')
        result = subprocess.run([sys.executable, str(VERIFIER_PATH), str(self.directory)],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_or_empty_payload_files(self):
        for name in PAYLOAD_NAMES:
            for missing in (True, False):
                with self.subTest(name=name, missing=missing):
                    payload = payload_fixture('x64')
                    if missing:
                        del payload[name]
                    else:
                        payload[name] = b''
                    with self.assertRaises(ValueError):
                        VERIFIER.verify_archive(self.distribution(payload=payload), 'x64')

    def test_rejects_ambiguous_payload_locations(self):
        path = self.distribution()
        with zipfile.ZipFile(path, 'a') as archive:
            archive.writestr('AnotherProduct/bin/reforked-shell.dll', pe_fixture('x64'))
        with self.assertRaises(ValueError):
            VERIFIER.verify_archive(path, 'x64')

    def test_rejects_dll_from_the_other_architecture(self):
        for expected, actual in (('x64', 'arm64'), ('arm64', 'x64')):
            with self.subTest(expected=expected):
                payload = payload_fixture(expected)
                payload['reforked-shell.dll'] = pe_fixture(actual)
                with self.assertRaises(ValueError):
                    VERIFIER.verify_archive(self.distribution(expected, payload), expected)

    def test_rejects_package_from_the_other_architecture(self):
        for expected, actual in (('x64', 'arm64'), ('arm64', 'x64')):
            with self.subTest(expected=expected):
                payload = payload_fixture(expected)
                payload['reforked-shell.msix'] = package_fixture(manifest_fixture(actual))
                with self.assertRaises(ValueError):
                    VERIFIER.verify_archive(self.distribution(expected, payload), expected)

    def test_rejects_invalid_pe_signatures(self):
        for offset in (0, 0x80):
            with self.subTest(offset=offset):
                payload = payload_fixture('x64')
                dll = bytearray(payload['reforked-shell.dll'])
                dll[offset:offset + 2] = b'??'
                payload['reforked-shell.dll'] = bytes(dll)
                with self.assertRaises(ValueError):
                    VERIFIER.verify_archive(self.distribution(payload=payload), 'x64')

    def test_rejects_incorrect_package_identity(self):
        for attribute, value in (('Name', 'Another.Explorer'), ('Publisher', 'CN=Reforked'),
                                 ('ProcessorArchitecture', 'neutral')):
            with self.subTest(attribute=attribute):
                root = manifest_fixture('x64')
                root.find('appx:Identity', NS).set(attribute, value)
                self.reject_manifest(root)

    def test_rejects_missing_identity(self):
        root = manifest_fixture('x64')
        root.remove(root.find('appx:Identity', NS))
        self.reject_manifest(root)

    def test_rejects_a_signature_in_the_unsigned_test_package(self):
        payload = payload_fixture('x64')
        payload['reforked-shell.msix'] = package_fixture(manifest_fixture('x64'), signature=True)
        with self.assertRaises(ValueError):
            VERIFIER.verify_archive(self.distribution(payload=payload), 'x64')

    def test_rejects_each_missing_context_menu(self):
        for item_type in ('*', 'Directory', 'Directory\\Background'):
            with self.subTest(item_type=item_type):
                root = manifest_fixture('x64')
                menu = root.find('.//desktop4:FileExplorerContextMenus', NS)
                item = next(item for item in menu if item.get('Type') == item_type)
                menu.remove(item)
                self.reject_manifest(root)

    def test_rejects_menu_types_without_commands(self):
        for item_type in ('*', 'Directory', 'Directory\\Background'):
            with self.subTest(item_type=item_type):
                root = manifest_fixture('x64')
                item = next(item for item in root.findall('.//desktop5:ItemType', NS)
                            if item.get('Type') == item_type)
                item.remove(item.find('desktop5:Verb', NS))
                self.reject_manifest(root)

    def test_rejects_incorrect_or_missing_command_bindings(self):
        for attribute, value in (('Id', 'UnrelatedCommand'), ('Clsid', None),
                                 ('Clsid', '11111111-1111-1111-1111-111111111111')):
            with self.subTest(attribute=attribute, value=value):
                root = manifest_fixture('x64')
                command = root.find('.//desktop5:Verb', NS)
                if value is None:
                    del command.attrib[attribute]
                else:
                    command.set(attribute, value)
                self.reject_manifest(root)

    def test_rejects_missing_or_misbound_com_server(self):
        for mutation in ('missing', 'wrong_id', 'wrong_path'):
            with self.subTest(mutation=mutation):
                root = manifest_fixture('x64')
                server = root.find('.//com:SurrogateServer', NS)
                command_class = server.find('com:Class', NS)
                if mutation == 'missing':
                    server.remove(command_class)
                elif mutation == 'wrong_id':
                    command_class.set('Id', '11111111-1111-1111-1111-111111111111')
                else:
                    command_class.set('Path', 'bin\\missing-shell.dll')
                self.reject_manifest(root)

    def test_rejects_a_non_png_menu_icon(self):
        payload = payload_fixture('x64')
        payload['reforked-shell.png'] = b'<svg xmlns="http://www.w3.org/2000/svg"/>'
        with self.assertRaises(ValueError):
            VERIFIER.verify_archive(self.distribution(payload=payload), 'x64')

    def test_rejects_a_missing_distribution_architecture(self):
        for present in ('x64', 'arm64'):
            with self.subTest(present=present):
                path = self.distribution(present)
                with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                    VERIFIER.verify_distributions(self.directory)
                path.unlink()

    def test_rejects_duplicate_distribution_architectures(self):
        self.distribution('x64')
        self.distribution('arm64')
        self.distribution('x64', filename='older-reforked.win.zip')
        with self.assertRaises(ValueError):
            VERIFIER.verify_distributions(self.directory)

    def test_command_line_fails_for_a_damaged_distribution(self):
        self.distribution('x64')
        payload = payload_fixture('arm64')
        del payload['reforked-shell.msix']
        self.distribution('arm64', payload)
        result = subprocess.run([sys.executable, str(VERIFIER_PATH), str(self.directory)],
                                capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
