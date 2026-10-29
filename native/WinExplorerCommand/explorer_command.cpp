// Copyright 2026. Use of this source code is governed by the Apache 2.0 license.
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <wrl.h>
#include <wrl/module.h>
#include <string>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

namespace {
HMODULE moduleHandle;

HRESULT launcherPath(std::wstring& path) {
  wchar_t buffer[32768];
  const DWORD size = GetModuleFileNameW(moduleHandle, buffer, ARRAYSIZE(buffer));
  if (size == 0) return HRESULT_FROM_WIN32(GetLastError());
  if (size == ARRAYSIZE(buffer)) return HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER);
  path.assign(buffer, size);
  const size_t separator = path.find_last_of(L"\\/");
  if (separator == std::wstring::npos) return E_UNEXPECTED;
  path.resize(separator + 1);
  path += L"reforked64.exe";
  return S_OK;
}

std::wstring quoteArgument(const wchar_t* value) {
  std::wstring quoted = L"\"";
  size_t backslashes = 0;
  for (const wchar_t* character = value; *character; ++character) {
    if (*character == L'\\') {
      ++backslashes;
      continue;
    }
    quoted.append(backslashes * (*character == L'"' ? 2 : 1), L'\\');
    if (*character == L'"') quoted += L'\\';
    quoted += *character;
    backslashes = 0;
  }
  quoted.append(backslashes * 2, L'\\');
  quoted += L'"';
  return quoted;
}

class __declspec(uuid("9FAD6B45-367B-4F7E-A862-4E7E287FC017")) FolderCommand final
  : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand, IObjectWithSite> {
public:
  IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* title) override {
    if (!title) return E_POINTER;
    *title = nullptr;
    wchar_t text[256];
    if (!LoadStringW(moduleHandle, 101, text, ARRAYSIZE(text))) return E_FAIL;
    return SHStrDupW(text, title);
  }

  IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override {
    if (!icon) return E_POINTER;
    *icon = nullptr;
    std::wstring path;
    const HRESULT result = launcherPath(path);
    if (FAILED(result)) return result;
    path += L",0";
    return SHStrDupW(path.c_str(), icon);
  }

  IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR* tooltip) override {
    if (!tooltip) return E_POINTER;
    *tooltip = nullptr;
    return E_NOTIMPL;
  }

  IFACEMETHODIMP GetCanonicalName(GUID* name) override {
    if (!name) return E_POINTER;
    *name = __uuidof(FolderCommand);
    return S_OK;
  }

  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    if (!state) return E_POINTER;
    *state = ECS_HIDDEN;
    DWORD count = 0;
    if (!items) {
      ComPtr<IShellItem> folder;
      if (SUCCEEDED(backgroundFolder(&folder))) *state = ECS_ENABLED;
      return S_OK;
    }
    HRESULT result = items->GetCount(&count);
    if (FAILED(result)) return result;
    if (count == 0) {
      ComPtr<IShellItem> folder;
      if (SUCCEEDED(backgroundFolder(&folder))) *state = ECS_ENABLED;
      return S_OK;
    }
    for (DWORD index = 0; index < count; ++index) {
      ComPtr<IShellItem> item;
      result = items->GetItemAt(index, &item);
      if (FAILED(result)) return result;
      SFGAOF attributes = 0;
      result = item->GetAttributes(SFGAO_FOLDER | SFGAO_FILESYSTEM, &attributes);
      if (FAILED(result)) return result;
      if (attributes != (SFGAO_FOLDER | SFGAO_FILESYSTEM)) return S_OK;
    }
    *state = ECS_ENABLED;
    return S_OK;
  }

  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
    std::wstring launcher;
    HRESULT result = launcherPath(launcher);
    if (FAILED(result)) return result;
    DWORD count = 0;
    if (items) {
      result = items->GetCount(&count);
      if (FAILED(result)) return result;
    }
    std::wstring arguments;
    for (DWORD index = 0; index < (count ? count : 1); ++index) {
      ComPtr<IShellItem> item;
      result = count ? items->GetItemAt(index, &item) : backgroundFolder(&item);
      if (FAILED(result)) return result;
      PWSTR path = nullptr;
      result = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
      if (FAILED(result)) return result;
      if (!arguments.empty()) arguments += L' ';
      arguments += quoteArgument(path);
      CoTaskMemFree(path);
    }
    if (arguments.empty()) return E_INVALIDARG;
    SHELLEXECUTEINFOW execution = {};
    execution.cbSize = sizeof(execution);
    execution.fMask = SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC;
    execution.lpFile = launcher.c_str();
    execution.lpParameters = arguments.c_str();
    execution.nShow = SW_SHOWNORMAL;
    return ShellExecuteExW(&execution) ? S_OK : HRESULT_FROM_WIN32(GetLastError());
  }

  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
    if (!flags) return E_POINTER;
    *flags = ECF_DEFAULT;
    return S_OK;
  }

  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override {
    if (!commands) return E_POINTER;
    *commands = nullptr;
    return E_NOTIMPL;
  }

  IFACEMETHODIMP SetSite(IUnknown* site) override {
    site_ = site;
    return S_OK;
  }

  IFACEMETHODIMP GetSite(REFIID iid, void** site) override {
    if (!site) return E_POINTER;
    *site = nullptr;
    return site_ ? site_->QueryInterface(iid, site) : E_FAIL;
  }

private:
  ComPtr<IUnknown> site_;

  HRESULT backgroundFolder(IShellItem** folder) {
    if (!folder) return E_POINTER;
    *folder = nullptr;
    if (!site_) return E_FAIL;
    ComPtr<IFolderView> view;
    HRESULT result = IUnknown_QueryService(site_.Get(), SID_SFolderView, IID_PPV_ARGS(&view));
    if (FAILED(result)) return result;
    ComPtr<IShellFolder> shellFolder;
    result = view->GetFolder(IID_PPV_ARGS(&shellFolder));
    if (FAILED(result)) return result;
    PIDLIST_ABSOLUTE itemId = nullptr;
    result = SHGetIDListFromObject(shellFolder.Get(), &itemId);
    if (FAILED(result)) return result;
    ComPtr<IShellItem> item;
    result = SHCreateItemFromIDList(itemId, IID_PPV_ARGS(&item));
    CoTaskMemFree(itemId);
    if (FAILED(result)) return result;
    SFGAOF attributes = 0;
    result = item->GetAttributes(SFGAO_FILESYSTEM, &attributes);
    if (FAILED(result)) return result;
    if (!(attributes & SFGAO_FILESYSTEM)) return E_INVALIDARG;
    return item.CopyTo(folder);
  }
};

class Factory final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IClassFactory> {
public:
  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID iid, void** object) override {
    if (!object) return E_POINTER;
    *object = nullptr;
    if (outer) return CLASS_E_NOAGGREGATION;
    auto command = Make<FolderCommand>();
    return command ? command->QueryInterface(iid, object) : E_OUTOFMEMORY;
  }

  IFACEMETHODIMP LockServer(BOOL lock) override {
    auto& module = Microsoft::WRL::Module<Microsoft::WRL::InProc>::GetModule();
    if (lock) module.IncrementObjectCount();
    else module.DecrementObjectCount();
    return S_OK;
  }
};
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, void*) {
  if (reason == DLL_PROCESS_ATTACH) {
    moduleHandle = instance;
  }
  return TRUE;
}

STDAPI DllGetClassObject(REFCLSID clsid, REFIID iid, void** object) {
  if (!object) return E_POINTER;
  *object = nullptr;
  if (clsid != __uuidof(FolderCommand)) return CLASS_E_CLASSNOTAVAILABLE;
  auto factory = Make<Factory>();
  return factory ? factory->QueryInterface(iid, object) : E_OUTOFMEMORY;
}

STDAPI DllCanUnloadNow() {
  return Microsoft::WRL::Module<Microsoft::WRL::InProc>::GetModule().GetObjectCount() == 0 ? S_OK : S_FALSE;
}
