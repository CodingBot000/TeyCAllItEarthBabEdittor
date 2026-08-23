import { spawnSync } from 'node:child_process';

const encoders = ['toktx', 'basisu'];
const available = encoders.filter((command) => {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
});

if (available.length === 0) {
  console.log('Battle texture compression: WebP fallback is active. No KTX2 encoder (toktx/basisu) is installed.');
  console.log('Install KTX-Software or Basis Universal, then rerun this check before enabling compressedTexturesEnabled.');
  process.exit(0);
}

console.log(`Battle texture compression encoders detected: ${available.join(', ')}.`);
console.log('KTX2 generation remains opt-in until the generated files are committed and browser fallback is verified.');
