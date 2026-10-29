import io
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile


TEST_PUBLISHER = 'CN=Reforked Local Test, OID.2.25.311729368913984317654407730594956997722=1'
FOUNDATION = '{http://schemas.microsoft.com/appx/manifest/foundation/windows10}'


def verify_archive(path, architecture):
    with zipfile.ZipFile(path) as archive:
        payload = {}
        for name in ('reforked-shell.dll', 'reforked-shell.msix', 'reforked-shell.png',
                     'reforked-shell-integration.ps1', 'reforked-shell.properties'):
            matches = [entry for entry in archive.namelist()
                       if entry == f'bin/{name}' or entry.endswith(f'/bin/{name}')]
            if len(matches) != 1:
                raise ValueError(f'{path}: expected one bin/{name}, found {len(matches)}')
            payload[name] = archive.read(matches[0])
            if not payload[name]:
                raise ValueError(f'{path}: {name} is empty')

    dll = payload['reforked-shell.dll']
    pe_offset = struct.unpack_from('<I', dll, 0x3c)[0]
    machine = struct.unpack_from('<H', dll, pe_offset + 4)[0]
    if dll[:2] != b'MZ' or dll[pe_offset:pe_offset + 4] != b'PE\0\0':
        raise ValueError(f'{path}: the menu DLL is not a Windows executable')
    if machine != {'x64': 0x8664, 'arm64': 0xAA64}[architecture]:
        raise ValueError(f'{path}: the menu DLL has the wrong architecture')

    with zipfile.ZipFile(io.BytesIO(payload['reforked-shell.msix'])) as package:
        root = ET.fromstring(package.read('AppxManifest.xml'))
        identity = root.find(f'{FOUNDATION}Identity')
        if identity is None or identity.get('Name') != 'Reforked.Explorer':
            raise ValueError(f'{path}: the menu package identity is incorrect')
        if identity.get('ProcessorArchitecture') != architecture:
            raise ValueError(f'{path}: the menu package has the wrong architecture')
        if identity.get('Publisher') != TEST_PUBLISHER:
            raise ValueError(f'{path}: expected the explicit unsigned test publisher')
        if 'AppxSignature.p7x' in package.namelist():
            raise ValueError(f'{path}: an unsigned test package must not contain a signature')
        namespace = '{http://schemas.microsoft.com/appx/manifest/desktop/windows10/5}'
        command_class = '9FAD6B45-367B-4F7E-A862-4E7E287FC017'
        expected = {'*': 'EditWithReforked', 'Directory': 'OpenWithReforked',
                    'Directory\\Background': 'OpenWithReforked'}
        for item_type, verb_id in expected.items():
            verbs = [verb for item in root.iter(f'{namespace}ItemType')
                     if item.get('Type') == item_type for verb in item.findall(f'{namespace}Verb')]
            if not any(verb.get('Id') == verb_id and verb.get('Clsid') == command_class for verb in verbs):
                raise ValueError(f'{path}: the menu package is missing a file or folder command: {item_type}')
        com_namespace = '{http://schemas.microsoft.com/appx/manifest/com/windows10}'
        if not any(item.get('Id') == command_class and item.get('Path') == 'bin\\reforked-shell.dll'
                   for item in root.iter(f'{com_namespace}Class')):
            raise ValueError(f'{path}: the menu command has no matching COM class')
    if not payload['reforked-shell.png'].startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'{path}: the menu icon is not a PNG image')


def verify_distributions(directory):
    for pattern, architecture in (('*.win.zip', 'x64'), ('*-aarch64.win.zip', 'arm64')):
        matches = [path for path in Path(directory).glob(pattern)
                   if architecture != 'x64' or not path.name.endswith('-aarch64.win.zip')]
        if len(matches) != 1:
            raise ValueError(f'Expected one {architecture} Windows distribution, found {len(matches)}')
        verify_archive(matches[0], architecture)
        print(f'PASS: {matches[0].name} contains the {architecture} Windows menu test package')


if __name__ == '__main__':
    verify_distributions(sys.argv[1])
