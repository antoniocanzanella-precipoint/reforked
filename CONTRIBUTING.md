# Contributing

This guide applies to [this fork](https://github.com/antoniocanzanella-precipoint/rebased).
[Upstream Rebased](https://github.com/DetachHead/rebased) has its own contribution policy.

## AI contribution policy

This fork accepts code written by people and AI agents.
AI assistance and AI-generated code are welcome.

Contributors remain responsible for each submitted change:

- Review the complete diff.
- Run the affected tests and report the results.
- State when AI writes or changes code.
- Keep descriptions short and describe the behavior.
- Keep the existing credits, copyright notices, and license terms.
- Include related commits when an imported feature needs them.

## Submit a change

Report problems and propose features in [this fork's issue tracker](https://github.com/antoniocanzanella-precipoint/rebased/issues).
You can submit a pull request without an assigned issue.
Discuss large changes before implementation to confirm the scope.

1. Start a feature branch from this fork's `master`.
2. Use the `codex/` prefix for an agent branch.
3. Keep each feature in separate commits.
4. Follow the applicable `AGENTS.md` instructions.
5. Run the affected tests and review the diff.
6. Open a pull request against this fork's `master`.

Include a short description, the test results, and any known limitations.

## Getting the source code

Install [Git](https://git-scm.com/).
On Windows, configure Git before cloning:

```shell
git config --global core.longpaths true
git config --global core.autocrlf input
```

Clone this fork and register upstream Rebased:

```shell
git clone https://github.com/antoniocanzanella-precipoint/rebased.git
cd rebased
git remote add upstream https://github.com/DetachHead/rebased.git
git config remote.pushDefault origin
```

Use these remote names:

| Remote | Repository | Purpose |
| --- | --- | --- |
| `origin` | `antoniocanzanella-precipoint/rebased` | Develop and publish this fork. |
| `upstream` | `DetachHead/rebased` | Review and import upstream changes. |

The `master` branch contains this fork's development version.
The release tags identify the source used for published packages.

## Building Rebased

### Open the project in IntelliJ IDEA

1. Install IntelliJ IDEA 2026.1 or newer.
2. Enable the [Bazel plugin](https://plugins.jetbrains.com/plugin/22977-bazel).
3. Open the `.bazelproject` file at the repository root.
4. Enable any required plugins when IntelliJ IDEA requests them.

If you disable the Maven plugin, define the `MAVEN_REPOSITORY` path variable.
Set it to the `.m2/repository` directory in your user directory.

The build uses Bazel.
In IntelliJ IDEA, select **Build > Build Project**.
From the repository root, run:

```shell
./bazel-build-all-community.cmd
```

### Run the application

In IntelliJ IDEA, select the `Run //build:idea_community` configuration.
From the repository root, run:

```shell
./bazel.cmd run //build:idea_community
```

### Build installation packages

Build packages for the current operating system:

```shell
./installers.cmd -Dintellij.build.target.os=current
```

On PowerShell, use stop-parsing mode for JVM options:

```powershell
./installers.cmd --% -Dintellij.build.target.os=current
```

See [BuildOptions.kt](platform/build-scripts/src/org/jetbrains/intellij/build/BuildOptions.kt) for other build options.

## Running tests

Name the test module and the fully qualified test class.
Run the tests for each affected module.
For example, run a repository tab test:

```shell
./tests.cmd --module intellij.platform.vcs.log.impl.tests --test com.intellij.vcs.log.impl.RepositoryLogTabWorkspaceTest
```

See [the testing guide](.agents/skills/testing/SKILL.md) for patterns and debug options.
Changes to documentation alone do not require application tests.

The release scripts have their own tests:

```shell
node --test .github/scripts/prepare-release.test.mjs .github/scripts/release-version.test.mjs
```

## Publishing the project site

GitHub Pages publishes the static site from the `/docs` directory on `master`.
The site links to this fork's source, releases, and contribution guide.
Edit `docs/index.html` to change the page.
Keep its canonical URL and `docs/sitemap.xml` consistent with the public site URL.
Update the sitemap date when the page content changes.

The page permits indexing and includes its text in the HTML.
Google controls when the site appears in search results.

## Building a fork release

The `master` branch contains the repository tabs feature and the fork release workflow.
It can contain platform changes that upstream has not released.

1. Test and push the commits to this fork.
2. Open [the Rebased workflow](https://github.com/antoniocanzanella-precipoint/rebased/actions/workflows/IntelliJ_IDEA.yml).
3. Select **Run workflow** and choose the tested branch.
4. Enter a unique version, such as `1.1.22-precipoint.2`.
5. Wait for all builds to finish.
6. Open [Releases](https://github.com/antoniocanzanella-precipoint/rebased/releases).
7. Review the draft and its assets before you publish it.

The workflow uses the numeric part of the version for package builds.
For example, the tag `1.1.22-precipoint.2` produces the package version `1.1.22`.

The workflow checks 20 required assets before it creates a draft.
The assets include Windows installers and ZIP files, macOS disk images, Linux archives, AppImages, update files, and software bills of materials.
The check rejects missing files and empty files.

The fork builds unsigned Windows installers.
It skips upstream signing and upstream package publication.
Fork releases start as draft prereleases.
Use the release page for prerelease downloads.

## Importing upstream changes

Keep this fork's published history.
Review upstream changes on a separate branch before integration.

```shell
git fetch --no-tags origin master
git fetch --no-tags upstream master
git switch -c codex/update-upstream origin/master
git log --oneline origin/master..upstream/master
git merge --no-commit --no-ff upstream/master
```

Inspect the merged changes before you commit them.
Keep this fork's contribution policy, download links, and release settings when you resolve conflicts.
Run the affected tests and review the diff.
Then commit the merge and open a pull request against this fork.

For selected fixes, use `git cherry-pick -x COMMIT` in place of the merge.
Replace `COMMIT` with the source commit.
The `-x` option records the source commit in the new commit message.

Upstream Rebased manages its own IntelliJ release bases.
Importing upstream `master` does not reproduce an upstream release.
Use the relevant upstream release branch or tag when you need that release base.

## Importing a feature from another repository

Keep each imported feature in a separate branch.
Replace the uppercase placeholders below with the source URL, branch, and commit.

```shell
git remote add feature-source SOURCE_REPOSITORY_URL
git fetch --no-tags feature-source SOURCE_BRANCH
git fetch --no-tags origin master
git switch -c codex/import-feature origin/master
git cherry-pick -x FEATURE_COMMIT
```

Register `feature-source` once for each source repository.
Use a different remote name for another source repository.
Import prerequisite commits first when a feature depends on them.

Resolve conflicts and run the affected tests.
Adapt the feature when the source uses a different platform version.
Review the imported license notices.
Include the source repository URL and commit references in the pull request.
