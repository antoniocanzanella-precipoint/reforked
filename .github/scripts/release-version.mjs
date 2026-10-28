import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function releaseVersion(version, allowSnapshot = false) {
  if (allowSnapshot && /^[0-9]+\.SNAPSHOT$/.test(version)) {
    return { version, build_version: version };
  }
  const match = /^([0-9]+(?:\.[0-9]+){1,3})(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.exec(version);
  if (!match) {
    throw new Error('Use two to four numeric version parts, with an optional release suffix.');
  }
  return { version, build_version: match[1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  const input = manual ? process.env.INPUT_VERSION : (await readFile('build.txt', 'utf8')).trim();
  const versions = releaseVersion(input, !manual);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(versions).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(`Release version: ${versions.version}\nPackage version: ${versions.build_version}`);
}
