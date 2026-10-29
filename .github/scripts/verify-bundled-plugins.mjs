import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packages = [
  'reforked.win.zip',
  'reforked-aarch64.win.zip',
  'reforked.tar.gz',
  'reforked-aarch64.tar.gz',
  'reforked.sit',
  'reforked-aarch64.sit',
];

function pluginIds(value, source) {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some(id => typeof id !== 'string' || id.trim() === '') || new Set(value).size !== value.length) {
    throw new Error(`Invalid bundled plugin list in ${source}.`);
  }
  return new Set(value);
}

const inventoryUrl = new URL('./bundled-plugins.json', import.meta.url);
const expectedPlugins = pluginIds(JSON.parse(await readFile(inventoryUrl, 'utf8')), inventoryUrl.pathname);

export async function verifyBundledPlugins(artifactDirectory) {
  return Promise.all(packages.map(async name => {
    const metadataPath = join(artifactDirectory, `${name}.product-info.json`);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const plugins = pluginIds(metadata?.bundledPlugins, metadataPath);
    const missing = [...expectedPlugins].filter(id => !plugins.has(id));
    const extra = [...plugins].filter(id => !expectedPlugins.has(id));
    if (missing.length > 0 || extra.length > 0) {
      const differences = [];
      if (missing.length > 0) differences.push(`Missing plugins: ${missing.join(', ')}`);
      if (extra.length > 0) differences.push(`Extra plugins: ${extra.join(', ')}`);
      throw new Error(`Bundled plugins differ from the inventory in ${metadataPath}:\n${differences.join('\n')}`);
    }
    return name;
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [artifactDirectory] = process.argv.slice(2);
  if (!artifactDirectory) throw new Error('Provide the directory for the build artifacts.');
  const verified = await verifyBundledPlugins(artifactDirectory);
  console.log(`Verified all bundled plugins in ${verified.length} packages.`);
}
