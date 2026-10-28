import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { releaseVersion } from './release-version.mjs';

test('a prerelease tag uses a numeric package version', () => {
  assert.deepEqual(releaseVersion('1.1.22-precipoint.1'), {
    version: '1.1.22-precipoint.1',
    build_version: '1.1.22',
  });
});

test('a numeric release keeps its package version', () => {
  assert.deepEqual(releaseVersion('1.1.22'), { version: '1.1.22', build_version: '1.1.22' });
});

test('automatic builds support the version from build.txt', () => {
  assert.deepEqual(releaseVersion('263.SNAPSHOT', true), { version: '263.SNAPSHOT', build_version: '263.SNAPSHOT' });
  assert.throws(() => releaseVersion('263.SNAPSHOT'), /numeric version parts/);
});

test('invalid versions fail before the package build starts', () => {
  for (const version of [undefined, '', '1', '1.2.3.4.5', '1.2; echo invalid', '1.2\nversion=3.4', '1.2-beta/1']) {
    assert.throws(() => releaseVersion(version), /numeric version parts/, String(version));
  }
});

async function runWorkflowStep(t, env, buildVersion = '263.SNAPSHOT') {
  const cwd = await mkdtemp(join(tmpdir(), 'rebased-version-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const output = join(cwd, 'output');
  await writeFile(join(cwd, 'build.txt'), buildVersion);
  await writeFile(output, '');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./release-version.mjs', import.meta.url))], {
    cwd,
    env: { ...process.env, GITHUB_OUTPUT: output, ...env },
    encoding: 'utf8',
  });
  return { result, output: await readFile(output, 'utf8') };
}

test('a manual workflow writes separate release and package outputs', async t => {
  const { result, output } = await runWorkflowStep(t, {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    INPUT_VERSION: '1.1.22-precipoint.1',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(output, 'version=1.1.22-precipoint.1\nbuild_version=1.1.22\n');
});

test('an automatic workflow reads build.txt', async t => {
  const { result, output } = await runWorkflowStep(t, { GITHUB_EVENT_NAME: 'push', INPUT_VERSION: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(output, 'version=263.SNAPSHOT\nbuild_version=263.SNAPSHOT\n');
});

test('a manual workflow rejects an invalid version without writing outputs', async t => {
  const { result, output } = await runWorkflowStep(t, { GITHUB_EVENT_NAME: 'workflow_dispatch', INPUT_VERSION: '1.2.3.4.5' });
  assert.notEqual(result.status, 0);
  assert.equal(output, '');
});
