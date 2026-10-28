import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseAssets(signedWindows) {
  const assets = [];
  const add = (artifact, name) => assets.push({ artifact, name });
  const addWithSbom = (artifact, name) => {
    add(artifact, name);
    add(artifact, `${name}.spdx.json`);
  };

  for (const { suffix, arch, appImageArch } of [
    { suffix: '', arch: 'x64', appImageArch: 'x86_64' },
    { suffix: '-aarch64', arch: 'aarch64', appImageArch: 'aarch64' },
  ]) {
    addWithSbom(`linux${suffix}.tar.gz-unsigned`, `rebased${suffix}.tar.gz`);
    add(`linux-${appImageArch}.AppImage-unsigned`, `Rebased-${appImageArch}.AppImage`);
    add(`linux-${appImageArch}.AppImage-unsigned`, `Rebased-${appImageArch}.AppImage.zsync`);
    addWithSbom(
      signedWindows ? `windows-signed-${arch}` : `windows${suffix}.exe-unsigned`,
      `rebased${suffix}.exe`,
    );
    addWithSbom(`windows${suffix}.win.zip-unsigned`, `rebased${suffix}.win.zip`);
    add(`mac${suffix}.dmg-unsigned`, `rebased${suffix}.dmg`);
    add(`mac${suffix}.sit-unsigned`, `rebased${suffix}.sit.spdx.json`);
  }
  return assets;
}

export async function prepareRelease(artifactRoot, destination, signedWindows) {
  const assets = releaseAssets(signedWindows);
  const invalid = [];
  for (const { artifact, name } of assets) {
    const source = join(artifactRoot, artifact, name);
    try {
      const info = await stat(source);
      if (!info.isFile() || info.size === 0) invalid.push(source);
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      invalid.push(source);
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Missing or empty release assets:\n${invalid.join('\n')}`);
  }

  await mkdir(destination);
  for (const { artifact, name } of assets) {
    await copyFile(join(artifactRoot, artifact, name), join(destination, name));
  }
  return assets.map(({ name }) => name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [artifactRoot, destination] = process.argv.slice(2);
  if (!artifactRoot || !destination || !process.env.GITHUB_REPOSITORY) {
    throw new Error('Provide the artifact directory, the destination, and GITHUB_REPOSITORY.');
  }
  const files = await prepareRelease(
    artifactRoot,
    destination,
    process.env.GITHUB_REPOSITORY === 'DetachHead/rebased',
  );
  console.log(`Collected ${files.length} release assets:\n${files.join('\n')}`);
}
