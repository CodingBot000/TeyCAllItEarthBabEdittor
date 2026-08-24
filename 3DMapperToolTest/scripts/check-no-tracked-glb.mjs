import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const forbidden = /\.(glb|bin|fbx|blend)$/i;
const trackedBinary = tracked.filter((file) => forbidden.test(file));

function findFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findFiles(path) : [path];
  });
}

const distBinary = findFiles(join(root, 'dist')).filter((file) => forbidden.test(file));
if (trackedBinary.length || distBinary.length) {
  console.error('External GLB policy failed. Binary assets must stay outside Git and dist/.');
  for (const file of [...trackedBinary, ...distBinary.map((file) => relative(root, file))]) console.error(`- ${file}`);
  process.exit(1);
}

const localRoot = join(root, 'local-assets', 'glb');
const localFiles = findFiles(localRoot).filter((file) => forbidden.test(file));
const totalBytes = localFiles.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`External GLB policy passed: tracked=0, dist=0, local=${localFiles.length} files, bytes=${totalBytes}`);
