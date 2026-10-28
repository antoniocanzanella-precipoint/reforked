<div align="center">
  <img src="./community-resources/resources/rebased.svg" width="100" height="100" />
  <h1>Rebased fork</h1>
  <p>A Git client based on the IntelliJ platform.</p>
</div>

This repository maintains an independent fork of [Rebased](https://github.com/DetachHead/rebased).
The fork includes **Repositories by Branch** and accepts contributions from people and AI agents.

Use [this repository](https://github.com/antoniocanzanella-precipoint/rebased) for the fork's code and contributions.
Report problems in [the fork's issue tracker](https://github.com/antoniocanzanella-precipoint/rebased/issues).
See [the contribution guide](CONTRIBUTING.md) for the AI policy, builds, and imports from other repositories.

![Rebased](screenshot.png)

## Motivation

Rebased provides the Git tools from the IntelliJ platform in a separate application.
Upstream Rebased removes most bundled plugins and adds changes for Git work.
This fork builds on that work and maintains additional features independently.

See [the original request for a separate Git client](https://youtrack.jetbrains.com/issue/IJPL-72504/Make-git-client-a-standalone-app).

## Installation

Download packages from [the fork's releases](https://github.com/antoniocanzanella-precipoint/rebased/releases).
The download links below use the published prerelease [1.1.22-precipoint.1](https://github.com/antoniocanzanella-precipoint/rebased/releases/tag/1.1.22-precipoint.1).
Read the release notes for the features included in each build.

### Windows

| Architecture | Installer | Portable ZIP |
| --- | --- | --- |
| x86_64 | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased.exe) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased.win.zip) |
| aarch64 | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased-aarch64.exe) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased-aarch64.win.zip) |

The Windows installers are unsigned.

### Linux

| Architecture | AppImage | Archive |
| --- | --- | --- |
| x86_64 | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/Rebased-x86_64.AppImage) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased.tar.gz) |
| aarch64 | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/Rebased-aarch64.AppImage) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased-aarch64.tar.gz) |

### macOS

| Architecture | Disk image |
| --- | --- |
| Apple Silicon (aarch64) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased-aarch64.dmg) |
| Intel (x86_64) | [Download](https://github.com/antoniocanzanella-precipoint/rebased/releases/download/1.1.22-precipoint.1/rebased.dmg) |

For an unsigned build that macOS blocks, remove the quarantine attribute after you install it:

```shell
xattr -rd com.apple.quarantine /Applications/Rebased.app
```

### Build from source

See [the build instructions](CONTRIBUTING.md#building-rebased).
The `master` branch contains this fork's development version.
It can contain platform changes that upstream has not released.

The upstream winget and Homebrew packages install upstream Rebased.
Use this fork's downloads or source builds for the additional features.

## Features

The fork retains the Git tools from [IntelliJ IDEA Community Edition](https://github.com/JetBrains/intellij-community) and upstream Rebased.

### Repository log tabs by branch

In the Log toolbar, select **Repositories by Branch** and enter a branch name.
Select **Apply** to open the matching repository tabs.
The option appears when the opened root repository has at least one submodule.

Completion offers local and known remote branches from all Git repositories in the project.
Matching ignores letter case and uses the complete branch name.
Matches can include the root repository, initialized submodules, and other Git repositories registered in the project.

Each matching repository gets a tab that shows all branches.
Use the normal Log filters to narrow its history.
The tabs stay in alphabetical order by repository name.
Select **Show repository paths in tab titles** to display full paths.

Your previous tabs stay hidden while repository tabs appear.
If no repository matches, the previous tabs appear while the branch stays selected.
Closed tabs stay dismissed for the selected branch.
Pinned tabs stay open during automatic updates.
The branch, title setting, selected tab, and dismissed tabs survive a restart.

Select **Clear** to close all additional Log tabs, including pinned tabs, and show one unfiltered Log.
Other open files reappear.
The checked out branches stay unchanged.

### Choose the Log location

The Log appears in the editor by default.
To show it in the tool window:

1. Go to **Settings > Version Control > Log**.
2. Clear **Show the log in the editor window**.

### Store project settings outside the project

To keep the `.idea` directory outside the project:

1. Go to **Settings > Appearance and Behavior > System Settings**.
2. Clear **Store project settings in the project root directory**.

Rebased stores these project settings with its global settings.

### Disable indexing

To disable file indexing for search:

1. Go to **Settings > Appearance and Behavior > System Settings**.
2. Clear **Enable indexing files for search**.

Rebased still scans files to track changes.

### Additional TextMate bundles

Rebased includes the [Vue TextMate bundle](https://github.com/vuejs/language-tools) for syntax highlighting.
Suggest other bundles in [an issue](https://github.com/antoniocanzanella-precipoint/rebased/issues/new).

## Plugins

You can install plugins from the JetBrains Marketplace.
Some plugins require platform components that Rebased disables.
Report problems with Git plugins in [this repository](https://github.com/antoniocanzanella-precipoint/rebased/issues).

### For plugin developers

The IntelliJ platform Gradle plugin supports [a local application instance](https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html#dependenciesLocalPlatform).

```kts
dependencies {
  intellijPlatform {
    local("/path/to/rebased")
  }
}
```

For an AppImage, extract or mount the image and select its `usr` directory.

## Contributing

Contributions from people and AI agents are welcome.
Contributors must review their changes and run the affected tests.
See [the contribution guide](CONTRIBUTING.md).

## Credits and licenses

- [DetachHead/Rebased](https://github.com/DetachHead/rebased) provides the upstream Git client.
- [JetBrains](https://github.com/JetBrains/intellij-community) provides the IntelliJ platform.
- [obiscr/intellij-community](https://github.com/obiscr/intellij-community) provides earlier Git client work used by upstream Rebased.

See [LICENSE.txt](LICENSE.txt), [NOTICE.txt](NOTICE.txt), and the license notices for individual components.
