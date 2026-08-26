import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const workspace = process.cwd();
const nextBin = resolve(workspace, 'node_modules/next/dist/bin/next');
const outputRoot = process.env.SIDE_VIEW_OUTPUT_ROOT ?? 'output/side-view-e2e';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE ?? findLocalBrowserExecutable();

async function run(command, args, environment = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: workspace,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

async function startServer(mode, port) {
  const child = spawn(process.execPath, [nextBin, mode, '--port', String(port)], {
    cwd: workspace,
    env: process.env,
    stdio: 'inherit',
  });
  const url = `http://localhost:${port}`;
  try {
    await waitForServer(url);
    return { child, url };
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.killed) return;
  child.kill('SIGINT');
  await new Promise((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, 5000);
    child.once('exit', () => { clearTimeout(timeout); resolvePromise(); });
  });
}

async function runBrowserScript(script, url, outputDirectory, extraEnvironment = {}) {
  await run(process.execPath, [resolve(workspace, script)], {
    SIDE_VIEW_BASE_URL: url,
    SIDE_VIEW_OUTPUT_DIR: resolve(workspace, outputDirectory),
    ...(browserExecutable ? { SIDE_VIEW_BROWSER_EXECUTABLE: browserExecutable } : {}),
    ...extraEnvironment,
  });
}

function findLocalBrowserExecutable() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => existsSync(candidate));
}

let devServer;
let productionServer;
try {
  devServer = await startServer('dev', 3010);
  await runBrowserScript('scripts/verify-side-view-flow.mjs', devServer.url, `${outputRoot}/full-flow`);
  await runBrowserScript('scripts/verify-side-view-failure.mjs', devServer.url, `${outputRoot}/failure`);
  await runBrowserScript('scripts/verify-side-view-mobile.mjs', devServer.url, `${outputRoot}/mobile-900`, { SIDE_VIEW_WIDTH: '900', SIDE_VIEW_HEIGHT: '500' });
  await runBrowserScript('scripts/verify-side-view-mobile.mjs', devServer.url, `${outputRoot}/mobile-640`, { SIDE_VIEW_WIDTH: '640', SIDE_VIEW_HEIGHT: '360' });
  await runBrowserScript('scripts/verify-side-view-abort.mjs', devServer.url, `${outputRoot}/abort`);
  await runBrowserScript('scripts/verify-side-view-visual-sync.mjs', devServer.url, `${outputRoot}/visual-sync`);
  await runBrowserScript('scripts/verify-ground-unit-positioning.mjs', devServer.url, `${outputRoot}/ground-positioning`);
  await runBrowserScript('scripts/verify-absorption-beam-v2.mjs', devServer.url, `${outputRoot}/absorption-v2`);
  await runBrowserScript('scripts/verify-side-view-biome-art.mjs', devServer.url, `${outputRoot}/biome-art`);
  await stopServer(devServer.child);
  devServer = undefined;

  await run('npm', ['run', 'build']);
  productionServer = await startServer('start', 3011);
  await runBrowserScript('scripts/verify-side-view-production-debug.mjs', productionServer.url, `${outputRoot}/production-debug`);
} finally {
  if (productionServer) await stopServer(productionServer.child);
  if (devServer) await stopServer(devServer.child);
}
