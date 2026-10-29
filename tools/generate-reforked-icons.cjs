// Copyright 2026 Reforked contributors. Use of this source code is governed by the Apache 2.0 license.
// Run with Node.js and the sharp package installed.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const write = (name, data) => fs.writeFile(path.join(root, name), data);

function ico(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([directory, ...images.map(image => image.data)]);
}

function icns(images) {
  const chunks = images.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type);
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

async function bmp(pipeline, width, height) {
  const pixels = await pipeline.removeAlpha().raw().toBuffer();
  const stride = (width * 3 + 3) & ~3;
  const data = Buffer.alloc(54 + stride * height);
  data.write('BM');
  data.writeUInt32LE(data.length, 2);
  data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14);
  data.writeInt32LE(width, 18);
  data.writeInt32LE(height, 22);
  data.writeUInt16LE(1, 26);
  data.writeUInt16LE(24, 28);
  data.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 3;
      const target = 54 + (height - y - 1) * stride + x * 3;
      data[target] = pixels[source + 2];
      data[target + 1] = pixels[source + 1];
      data[target + 2] = pixels[source];
    }
  }
  return data;
}

async function main() {
  const source = await fs.readFile(path.join(root, 'docs/assets/reforked.svg'), 'utf8');
  const png = size => sharp(Buffer.from(source), { density: size * 72 / 64 }).resize(size, size).png().toBuffer();
  for (const [name, size] of [['rebased', 64], ['rebased_dark', 64], ['rebased_16', 16], ['rebased_16_dark', 16],
    ['rebased_16@2x', 32], ['rebased_16_dark@2x', 32]]) {
    await write(`community-resources/resources/${name}.svg`, source.replace('width="64" height="64"', `width="${size}" height="${size}"`));
  }
  await write('docs/assets/reforked.png', await png(512));
  for (const name of ['product_128', 'product_128_EAP']) {
    await write(`build/idea-community-images/linux/${name}.png`, await png(128));
  }
  const windowsIcon = ico(await Promise.all([16, 24, 32, 48, 64, 96, 128, 256].map(async size => ({ size, data: await png(size) }))));
  for (const name of ['product', 'product_EAP', 'install', 'uninstall']) {
    await write(`build/idea-community-images/win/${name}.ico`, windowsIcon);
  }
  const macIcon = icns(await Promise.all([['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256],
    ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]]
    .map(async ([type, size]) => ({ type, data: await png(size) }))));
  for (const name of ['product', 'product_EAP']) {
    await write(`build/idea-community-images/mac/${name}.icns`, macIcon);
  }
  for (const [name, scale] of [['reforked', 1], ['idea_community_logo', 1], ['idea_community_logo@2x', 2]]) {
    const logo = await sharp({ create: { width: 640 * scale, height: 400 * scale, channels: 4, background: '#00000000' } })
      .composite([{ input: await png(400 * scale), left: 120 * scale, top: 0 }]).png().toBuffer();
    await write(`community-resources/resources/${name}.png`, logo);
  }
  for (const [name, width, height, size, left, top] of [['logo', 164, 314, 80, 42, 28], ['headerlogo', 150, 57, 40, 100, 8]]) {
    const canvas = sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
      .composite([{ input: await png(size), left, top }]);
    await write(`build/idea-community-images/win/${name}.bmp`, await bmp(canvas, width, height));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
