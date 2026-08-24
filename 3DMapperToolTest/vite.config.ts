import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, resolve } from 'node:path';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

function localGlbServer(): Plugin {
  const localRoot = resolve(process.cwd(), 'local-assets', 'glb');
  const serve = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const requestPath = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
    if (!requestPath || !requestPath.toLowerCase().endsWith('.glb')) return next();
    const filePath = resolve(localRoot, requestPath);
    const relativePath = relative(localRoot, filePath);
    if (relativePath.startsWith('..') || relativePath.includes('..' + '/') || !existsSync(filePath)) {
      res.statusCode = relativePath.startsWith('..') ? 403 : 404;
      res.end('Local GLB asset not found.');
      return;
    }
    const stat = statSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res as never);
  };
  return {
    name: 'local-glb-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__local_glb__', serve);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use('/__local_glb__', serve);
    },
  };
}

export default defineConfig({
  plugins: [react(), localGlbServer()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          babylonCore: ['@babylonjs/core'],
          babylonMaterials: ['@babylonjs/materials'],
        },
      },
    },
  },
});
