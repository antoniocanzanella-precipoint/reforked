// Copyright 2026. Use of this source code is governed by the Apache 2.0 license.
#include <windows.h>
#include <shlobj.h>
#include <wrl.h>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace {
void check(HRESULT result) {
  if (FAILED(result)) throw std::runtime_error("The shell call failed.");
}

class TestDirectory {
public:
  TestDirectory() {
    wchar_t temporaryPath[MAX_PATH];
    if (!GetTempPathW(ARRAYSIZE(temporaryPath), temporaryPath)) throw std::runtime_error("The temporary path is unavailable.");
    wchar_t directory[MAX_PATH];
    if (!GetTempFileNameW(temporaryPath, L"rfk", 0, directory)) throw std::runtime_error("The temporary file is unavailable.");
    path = directory;
    DeleteFileW(path.c_str());
    if (!CreateDirectoryW(path.c_str(), nullptr)) throw std::runtime_error("The temporary directory is unavailable.");
  }

  ~TestDirectory() {
    for (const auto& file : files) DeleteFileW(file.c_str());
    RemoveDirectoryW(path.c_str());
  }

  std::wstring file(const wchar_t* name) {
    std::wstring result = path + L"\\" + name;
    HANDLE handle = CreateFileW(result.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle == INVALID_HANDLE_VALUE) throw std::runtime_error("The test file is unavailable.");
    CloseHandle(handle);
    files.push_back(result);
    return result;
  }

  std::wstring path;

private:
  std::vector<std::wstring> files;
};

ComPtr<IShellItemArray> items(const std::vector<std::wstring>& paths) {
  std::vector<PIDLIST_ABSOLUTE> identifiers;
  for (const auto& path : paths) {
    PIDLIST_ABSOLUTE identifier = nullptr;
    HRESULT result = SHParseDisplayName(path.c_str(), nullptr, &identifier, 0, nullptr);
    if (FAILED(result)) {
      for (auto value : identifiers) CoTaskMemFree(value);
      check(result);
    }
    identifiers.push_back(identifier);
  }
  ComPtr<IShellItemArray> result;
  std::vector<PCIDLIST_ABSOLUTE> pointers(identifiers.begin(), identifiers.end());
  HRESULT status = SHCreateShellItemArrayFromIDLists(static_cast<UINT>(pointers.size()), pointers.data(), &result);
  for (auto value : identifiers) CoTaskMemFree(value);
  check(status);
  return result;
}

void expectState(IExplorerCommand* command, IShellItemArray* selection, EXPCMDSTATE expected) {
  for (BOOL slow : {FALSE, TRUE}) {
    EXPCMDSTATE state = ECS_HIDDEN;
    check(command->GetState(selection, slow, &state));
    if (state != expected) throw std::runtime_error("The command has the wrong state.");
  }
}

void testCommand(HMODULE library) {
  const CLSID commandId = {0x9fad6b45, 0x367b, 0x4f7e, {0xa8, 0x62, 0x4e, 0x7e, 0x28, 0x7f, 0xc0, 0x17}};
  using GetClassObject = HRESULT(STDAPICALLTYPE*)(REFCLSID, REFIID, void**);
  FARPROC address = GetProcAddress(library, "DllGetClassObject");
  if (!address) throw std::runtime_error("The command factory is unavailable.");
  GetClassObject getClassObject;
  static_assert(sizeof(getClassObject) == sizeof(address));
  memcpy(&getClassObject, &address, sizeof(address));
  ComPtr<IClassFactory> factory;
  check(getClassObject(commandId, IID_PPV_ARGS(&factory)));
  ComPtr<IExplorerCommand> command;
  check(factory->CreateInstance(nullptr, IID_PPV_ARGS(&command)));

  TestDirectory directory;
  std::vector<std::wstring> paths = {
    directory.file(L"unknown.reforked-test-type"),
    directory.file(L"no-extension"),
    directory.file(L"text with spaces.txt"),
    directory.file(L"program.exe"),
    directory.file(L"archive.zip"),
    directory.file(L"unicode-\u00e8.md"),
  };
  for (const auto& path : paths) expectState(command.Get(), items({path}).Get(), ECS_ENABLED);
  expectState(command.Get(), items(paths).Get(), ECS_ENABLED);
  expectState(command.Get(), items({directory.path}).Get(), ECS_ENABLED);
  paths.push_back(directory.path);
  expectState(command.Get(), items(paths).Get(), ECS_HIDDEN);
  expectState(command.Get(), nullptr, ECS_HIDDEN);

  ComPtr<IShellItem> virtualFolder;
  check(SHGetKnownFolderItem(FOLDERID_RecycleBinFolder, KF_FLAG_DEFAULT, nullptr, IID_PPV_ARGS(&virtualFolder)));
  ComPtr<IShellItemArray> virtualItems;
  check(SHCreateShellItemArrayFromShellItem(virtualFolder.Get(), IID_PPV_ARGS(&virtualItems)));
  expectState(command.Get(), virtualItems.Get(), ECS_HIDDEN);
}
}

int wmain(int count, wchar_t** arguments) {
  if (count != 2) return 1;
  if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 1;
  HMODULE library = LoadLibraryW(arguments[1]);
  int result = 1;
  try {
    if (!library) throw std::runtime_error("The command library is unavailable.");
    testCommand(library);
    std::cout << "The file and folder command tests passed.\n";
    result = 0;
  }
  catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
  }
  if (library) FreeLibrary(library);
  CoUninitialize();
  return result;
}
