import fs from 'node:fs/promises';
import path from 'node:path';
import { pack } from '../node_modules/babylonjs-editor-cli/build/src/pack/pack.mjs';

const projectRoot = process.cwd();
const includeBattleAssets = process.argv.includes('--battle') || process.env.BATTLE_PACK === '1';
const excludedDirectories = includeBattleAssets ? [] : [
  {
    source: path.join(projectRoot, 'assets/battlescene'),
    hold: path.join(projectRoot, '.phase-one-battlescene-assets'),
  },
  {
    source: path.join(projectRoot, 'assets/battlescene.scene'),
    hold: path.join(projectRoot, '.phase-one-battlescene-scene'),
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
  await normalizeGeneratedScriptsMap();
  if (includeBattleAssets) {
    await syncBattleRuntimeAssets();
    await disablePhysicsForBattleScene();
  }
} finally {
  for (const directory of moved.reverse()) {
    await fs.rename(directory.hold, directory.source);
  }
}

async function normalizeGeneratedScriptsMap() {
  const scriptsPath = path.join(projectRoot, 'src/scripts.ts');
  try {
    const source = await fs.readFile(scriptsPath, 'utf8');
    const normalized = source.replace(/[ \t]+\n/g, '\n');
    if (normalized !== source) await fs.writeFile(scriptsPath, normalized);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function syncBattleRuntimeAssets() {
  const source = path.join(projectRoot, 'assets/battlescene');
  const target = path.join(projectRoot, 'public/assets/runtime/battlescene');
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

async function disablePhysicsForBattleScene() {
  const scenePath = path.join(projectRoot, 'public/scene/battlescene.babylon');
  try {
    const scene = JSON.parse(await fs.readFile(scenePath, 'utf8'));
    scene.physicsEnabled = false;
    delete scene.physicsEngine;
    delete scene.physicsGravity;
    await fs.writeFile(scenePath, JSON.stringify(scene));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
