import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyBundledPlugins } from './verify-bundled-plugins.mjs';

const archives = [
  'reforked.win.zip',
  'reforked-aarch64.win.zip',
  'reforked.tar.gz',
  'reforked-aarch64.tar.gz',
  'reforked.sit',
  'reforked-aarch64.sit',
];

const bundledPlugins = [
  'Git4Idea',
  'com.intellij',
  'com.intellij.idea.customization',
  'com.intellij.mermaid',
  'com.intellij.modules.jcef',
  'com.intellij.modules.json',
  'com.intellij.platform.images',
  'intellij.bookmarks.plugin',
  'intellij.git.commit.modal',
  'intellij.grid.core.plugin',
  'intellij.libraries.misc.plugin',
  'intellij.navbar.plugin',
  'intellij.platform.tasks.plugin',
  'intellij.recentFiles.plugin',
  'intellij.structureView.plugin',
  'intellij.vcs.plugin',
  'org.intellij.plugins.markdown',
  'org.jetbrains.plugins.github',
  'org.jetbrains.plugins.gitlab',
  'org.jetbrains.plugins.terminal',
  'org.jetbrains.plugins.textmate',
  'org.jetbrains.plugins.yaml',
];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'reforked-plugins-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(archives.map(name => writeFile(
    join(root, `${name}.product-info.json`),
    JSON.stringify({ buildNumber: '263.SNAPSHOT', bundledPlugins }),
  )));
  return root;
}

test('the check accepts all platforms with the complete plugin inventory', async t => {
  const root = await fixture(t);
  assert.deepEqual(await verifyBundledPlugins(root), archives);
});

for (const archive of archives) {
  test(`the check rejects missing Git in ${archive}`, async t => {
    const root = await fixture(t);
    await writeFile(join(root, `${archive}.product-info.json`), JSON.stringify({
      bundledPlugins: bundledPlugins.filter(id => id !== 'Git4Idea'),
    }));
    await assert.rejects(verifyBundledPlugins(root), error => {
      assert.ok(error.message.includes(`${archive}.product-info.json`));
      assert.ok(error.message.includes('Git4Idea'));
      return true;
    });
  });
}

for (const plugin of bundledPlugins) {
  test(`the check rejects a missing bundled plugin: ${plugin}`, async t => {
    const root = await fixture(t);
    await writeFile(join(root, 'reforked.win.zip.product-info.json'), JSON.stringify({
      bundledPlugins: bundledPlugins.filter(id => id !== plugin),
    }));
    await assert.rejects(verifyBundledPlugins(root), error => {
      assert.ok(error.message.includes(plugin));
      return true;
    });
  });
}

test('missing package metadata blocks the build check', async t => {
  const root = await fixture(t);
  await unlink(join(root, 'reforked-aarch64.sit.product-info.json'));
  await assert.rejects(verifyBundledPlugins(root), { code: 'ENOENT' });
});

test('invalid package metadata blocks the build check', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reforked.tar.gz.product-info.json'), '{');
  await assert.rejects(verifyBundledPlugins(root), SyntaxError);
});

test('an absent plugin list blocks the build check', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reforked.sit.product-info.json'), '{}');
  await assert.rejects(verifyBundledPlugins(root), /Invalid bundled plugin list/);
});

test('a new plugin requires an inventory update', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reforked.tar.gz.product-info.json'), JSON.stringify({
    bundledPlugins: [...bundledPlugins, 'example.new.plugin'],
  }));
  await assert.rejects(verifyBundledPlugins(root), /Extra plugins: example\.new\.plugin/);
});

for (const [description, plugins] of [
  ['empty', []],
  ['duplicate', [...bundledPlugins, 'Git4Idea']],
  ['non-string', [...bundledPlugins, 42]],
  ['blank', [...bundledPlugins, ' ']],
  ['non-array', 'Git4Idea'],
]) {
  test(`the check rejects a plugin list marked as ${description}`, async t => {
    const root = await fixture(t);
    await writeFile(join(root, 'reforked.sit.product-info.json'), JSON.stringify({ bundledPlugins: plugins }));
    await assert.rejects(verifyBundledPlugins(root), /Invalid bundled plugin list/);
  });
}

test('the check accepts plugin lists in a different order', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reforked.win.zip.product-info.json'), JSON.stringify({
    bundledPlugins: bundledPlugins.toReversed(),
  }));
  assert.deepEqual(await verifyBundledPlugins(root), archives);
});

test('the command accepts packages that include all bundled plugins', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./verify-bundled-plugins.mjs', import.meta.url)), root,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified all bundled plugins in 6 packages/);
});

test('the command fails when a package omits bundled plugins', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reforked.win.zip.product-info.json'), JSON.stringify({ bundledPlugins: ['Git4Idea'] }));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./verify-bundled-plugins.mjs', import.meta.url)), root,
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing plugins/);
  assert.match(result.stderr, /org\.intellij\.plugins\.markdown/);
});
