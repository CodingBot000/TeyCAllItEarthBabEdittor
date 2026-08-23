import fs from 'node:fs/promises';
import path from 'node:path';
import { pack } from '../node_modules/babylonjs-editor-cli/build/src/pack/pack.mjs';

const projectRoot = process.cwd();
const excludedDirectories = [
  {
    source: path.join(projectRoot, 'assets/battlescene'),
    hold: path.join(projectRoot, '.phase-one-battlescene-assets'),
  },
];

const moved = [];

try {
  for (const directory of excludedDirectories) {
    try {
      await fs.rename(directory.source, directory.hold);
      moved.push(directory);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  await pack(projectRoot, { optimize: true });
} finally {
  for (const directory of moved.reverse()) {
    await fs.rename(directory.hold, directory.source);
  }
}
