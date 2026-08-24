import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceProject = path.resolve(getArgument('--source-root') ?? path.join(projectRoot, '..', 'TeyCAllItEarthBabEdittor'));
const mappings = [
  { label: 'art originals', source: path.join(sourceProject, 'art-source', 'battlescene', 'maps', 'city-day', 'buildings'), target: path.join(projectRoot, 'art-source', 'buildings') },
  { label: 'runtime public assets', source: path.join(sourceProject, 'public', 'assets', 'runtime', 'battlescene', 'maps', 'city-day', 'buildings'), target: path.join(projectRoot, 'public', 'assets', 'buildings') },
  { label: 'reference image', source: path.join(sourceProject, 'docs', 'reference_images', 'thetcall_inbattle_2d_day.png'), target: path.join(projectRoot, 'art-source', 'references', 'thetcall_inbattle_2d_day.png') },
];

const report = [];
let failed = false;
for (const mapping of mappings) {
  const sourceFiles = await collectFiles(mapping.source);
  const targetFiles = await collectFiles(mapping.target);
  const sourceNames = new Set(sourceFiles.map((file) => file.relative));
  const targetNames = new Set(targetFiles.map((file) => file.relative));
  const missing = [...sourceNames].filter((name) => !targetNames.has(name));
  const extra = [...targetNames].filter((name) => !sourceNames.has(name));
  const mismatched = [];
  for (const sourceFile of sourceFiles) {
    const targetFile = targetFiles.find((file) => file.relative === sourceFile.relative);
    const manifestIsNormalized = mapping.label === 'runtime public assets' && sourceFile.relative.endsWith('manifest.json');
    if (targetFile && sourceFile.sha256 !== targetFile.sha256 && !manifestIsNormalized) mismatched.push(sourceFile.relative);
  }
  const ok = missing.length === 0 && extra.length === 0 && mismatched.length === 0;
  failed ||= !ok;
  report.push({ ...mapping, sourceFiles, targetFiles, missing, extra, mismatched, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mapping.label}: ${sourceFiles.length} source / ${targetFiles.length} target`);
  if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
  if (extra.length) console.log(`  extra: ${extra.join(', ')}`);
  if (mismatched.length) console.log(`  checksum mismatch: ${mismatched.join(', ')}`);
}

const duplicateSource = path.join(sourceProject, 'assets', 'battlescene', 'maps', 'city-day', 'buildings');
const duplicatePublic = path.join(sourceProject, 'public', 'assets', 'runtime', 'battlescene', 'maps', 'city-day', 'buildings');
const duplicateCheck = await compareDirectories(duplicateSource, duplicatePublic);
console.log(`${duplicateCheck.ok ? 'PASS' : 'FAIL'} original duplicate runtime copies: ${duplicateCheck.sourceCount} / ${duplicateCheck.targetCount}`);
failed ||= !duplicateCheck.ok;

const manifest = [
  '# Migration Manifest',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This manifest records the non-destructive migration from the existing game project. The source project was copied; no source files were removed.',
  '',
  '| Group | Source | Target | Files | Bytes | Status |',
  '| --- | --- | --- | ---: | ---: | --- |',
  ...report.map((item) => `| ${item.label} | \`${relativeOrAbsolute(item.source)}\` | \`${relativeOrAbsolute(item.target)}\` | ${item.sourceFiles.length} | ${item.sourceFiles.reduce((sum, file) => sum + file.bytes, 0)} | ${item.ok ? 'PASS' : 'FAIL'} |`),
  '',
  '## File checksums',
  '',
  ...report.flatMap((item) => [
    `### ${item.label}`,
    '',
    '| Relative path | Bytes | SHA-256 |',
    '| --- | ---: | --- |',
    ...item.sourceFiles.map((file) => `| \`${file.relative}\` | ${file.bytes} | \`${file.sha256}\` |`),
    '',
  ]),
  '## Deletion gate',
  '',
  '- Existing game project files remain untouched by this migration.',
  '- Deletion is intentionally deferred until the user explicitly requests it after development and verification are complete.',
  '- Any future deletion must re-check checksums, build output, tests, and the user-owned working tree immediately before execution.',
  '',
];
await fs.writeFile(path.join(projectRoot, 'docs', 'MIGRATION_MANIFEST.md'), manifest.join('\n'));

if (failed) process.exitCode = 1;

async function compareDirectories(source, target) {
  const sourceFiles = await collectFiles(source);
  const targetFiles = await collectFiles(target);
  const targetByName = new Map(targetFiles.map((file) => [file.relative, file]));
  const ok = sourceFiles.length === targetFiles.length && sourceFiles.every((file) => targetByName.get(file.relative)?.sha256 === file.sha256);
  return { ok, sourceCount: sourceFiles.length, targetCount: targetFiles.length };
}

async function collectFiles(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) return [{ relative: path.basename(inputPath), bytes: stat.size, sha256: await checksum(inputPath) }];
  const files = [];
  await walk(inputPath, inputPath, files);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function walk(root, current, files) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, fullPath, files);
    else {
      const stat = await fs.stat(fullPath);
      files.push({ relative: path.relative(root, fullPath), bytes: stat.size, sha256: await checksum(fullPath) });
    }
  }
}

async function checksum(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function relativeOrAbsolute(value) {
  return path.relative(projectRoot, value) || '.';
}
