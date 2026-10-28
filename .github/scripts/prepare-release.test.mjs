import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareRelease, releaseAssets } from './prepare-release.mjs';

async function fixture(t, signedWindows) {
  const root = await mkdtemp(join(tmpdir(), 'rebased-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = join(root, 'artifacts');
  const destination = join(root, 'release-assets');
  for (const { artifact, name } of releaseAssets(signedWindows)) {
    await mkdir(join(artifacts, artifact), { recursive: true });
    await writeFile(join(artifacts, artifact, name), artifact);
  }
  return { artifacts, destination };
}

test('a fork collects all platforms without signing credentials', async t => {
  const { artifacts, destination } = await fixture(t, false);
  const files = await prepareRelease(artifacts, destination, false);
  assert.equal(files.length, 20);
  assert.deepEqual((await readdir(destination)).sort(), files.sort());
  assert.equal(await readFile(join(destination, 'rebased-aarch64.exe'), 'utf8'), 'windows-aarch64.exe-unsigned');
  assert.ok(files.includes('rebased.dmg'));
  assert.ok(files.includes('Rebased-aarch64.AppImage.zsync'));
  assert.ok(files.includes('rebased.tar.gz.spdx.json'));
});

test('upstream selects signed installers and ignores duplicate unsigned files', async t => {
  const { artifacts, destination } = await fixture(t, true);
  await mkdir(join(artifacts, 'windows.exe-unsigned'));
  await writeFile(join(artifacts, 'windows.exe-unsigned', 'rebased.exe'), 'unsigned');
  await prepareRelease(artifacts, destination, true);
  assert.equal(await readFile(join(destination, 'rebased.exe'), 'utf8'), 'windows-signed-x64');
  assert.equal((await readdir(destination)).length, 20);
});

test('a missing installer blocks release preparation', async t => {
  const { artifacts, destination } = await fixture(t, false);
  await unlink(join(artifacts, 'windows-aarch64.exe-unsigned', 'rebased-aarch64.exe'));
  await assert.rejects(prepareRelease(artifacts, destination, false), /rebased-aarch64\.exe/);
  await assert.rejects(stat(destination), { code: 'ENOENT' });
});

test('an empty disk image blocks release preparation', async t => {
  const { artifacts, destination } = await fixture(t, false);
  await writeFile(join(artifacts, 'mac.dmg-unsigned', 'rebased.dmg'), '');
  await assert.rejects(prepareRelease(artifacts, destination, false), /rebased\.dmg/);
  await assert.rejects(stat(destination), { code: 'ENOENT' });
});

test('upstream does not replace a missing signed installer with an unsigned installer', async t => {
  const { artifacts, destination } = await fixture(t, false);
  await assert.rejects(prepareRelease(artifacts, destination, true), /windows-signed-x64/);
  await assert.rejects(stat(destination), { code: 'ENOENT' });
});
