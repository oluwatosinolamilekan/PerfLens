import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';

type ExtensionVariant = 'manual' | 'auto';

const extensionVariant: ExtensionVariant = process.env.PERFLENS_VARIANT === 'auto' ? 'auto' : 'manual';
const isAutoVariant = extensionVariant === 'auto';
const outDir = resolve(__dirname, 'dist', extensionVariant);

function buildManifest() {
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, 'public/manifest.json'), 'utf8')
  );

  if (isAutoVariant) {
    manifest.name = 'PerfLens Auto - Web Performance Monitor';
    manifest.description =
      'Automatic web performance monitoring, scoring, and optimization suggestions for websites you visit';
  } else {
    manifest.name = 'PerfLens Manual - Web Performance Auditor';
    manifest.description =
      'Current-tab web performance audits, scoring, and optimization suggestions that run only when you click audit';
    manifest.permissions = ['storage', 'activeTab', 'scripting'];
    delete manifest.host_permissions;
    delete manifest.content_scripts;
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    writeBundle() {
      const distDir = outDir;

      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      writeFileSync(resolve(distDir, 'manifest.json'), buildManifest());

      copyFileSync(
        resolve(__dirname, 'src/content/content.css'),
        resolve(distDir, 'content.css')
      );

      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }

      const publicIcons = resolve(__dirname, 'public/icons');
      if (existsSync(publicIcons)) {
        try {
          const files = readdirSync(publicIcons);
          for (const file of files) {
            copyFileSync(resolve(publicIcons, file), resolve(iconsDir, file));
          }
        } catch {}
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticAssets()],
  define: {
    __PERFLENS_VARIANT__: JSON.stringify(extensionVariant),
  },
  root: resolve(__dirname, 'public'),
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'public/index.html'),
        popup: resolve(__dirname, 'public/popup.html'),
        options: resolve(__dirname, 'public/options.html'),
        devtools: resolve(__dirname, 'public/devtools.html'),
        devtoolsPanel: resolve(__dirname, 'public/devtools-panel.html'),
        agentRedirect: resolve(__dirname, 'public/agent-redirect.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'content.css') return 'content.css';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    sourcemap: process.env.NODE_ENV === 'development',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  publicDir: false,
});
