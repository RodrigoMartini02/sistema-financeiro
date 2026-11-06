import type { Connect, Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

type FrontendTarget = 'combined' | 'main' | 'tenders';
const TENDERS_BASE = '/licitacoes/app/';
const entries = { app: 'app.html', assistant: 'assistant.html', login: 'index.html', demo: 'demo.html', tenders: 'tenders.html' };
const loadConfig = createRequire(resolve(__dirname, 'package.json'));

export function htmlEntryRewrite(name: string, appPath: string, entryPath: string): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? '';
    if ((req.method === 'GET' || req.method === 'HEAD')
      && (path === appPath || path.startsWith(`${appPath}/`))
      && !extname(path)
      && !path.startsWith(`${appPath}/assets/`)
      && !path.startsWith(`${appPath}/icons/`)) {
      const query = url.indexOf('?');
      req.url = entryPath + (query >= 0 ? url.slice(query) : '');
    }
    next();
  };
  return {
    name,
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

function buildBoundary(target: FrontendTarget): Plugin {
  const forbidden = target === 'main' ? ['apps/tenders/web/'] : ['apps/site/', 'apps/finance/web/'];
  return {
    name: 'frontend-build-boundary',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (target === 'combined') return;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const normalized = moduleId.replaceAll('\\', '/');
          if (forbidden.some(directory => normalized.includes(`${__dirname.replaceAll('\\', '/')}/${directory}`))) {
            this.error(`O build ${target} importou código de outro produto: ${moduleId}`);
          }
        }
      }
    },
  };
}

function tendersIcons(outDir: string): Plugin {
  return {
    name: 'tenders-public-icons',
    apply: 'build',
    async writeBundle() {
      const destination = resolve(__dirname, outDir, 'icons');
      await mkdir(destination, { recursive: true });
      await Promise.all(['favicon.svg', 'apple-touch-icon.png', 'fingerence-logo.webp'].map(icon =>
        copyFile(resolve(__dirname, 'public/icons', icon), resolve(destination, icon))));
    },
  };
}

export function createFrontendConfig(target: FrontendTarget): UserConfig {
  const tenders = target === 'tenders';
  const selectedEntries = Object.entries(entries).filter(([key]) => target === 'combined' || (tenders ? key === 'tenders' : key !== 'tenders'));
  const outDir = target === 'combined' ? 'dist' : tenders ? 'dist/tenders/licitacoes/app' : 'dist/main';
  const tailwind = loadConfig('./tailwind.config.cjs') as tailwindcss.Config;
  const htmlFiles = new Set(selectedEntries.map(([, file]) => `./${file}`));
  const content = (tailwind.content as string[]).filter(file => target === 'combined'
    || file.startsWith('./packages/ui/') || htmlFiles.has(file)
    || (tenders ? file.startsWith('./apps/tenders/web/') : file.startsWith('./apps/site/') || file.startsWith('./apps/finance/web/')));
  const plugins: Plugin[] = [...react(), buildBoundary(target)];
  if (target !== 'main') {
    plugins.push(htmlEntryRewrite('tenders-app-rewrite', '/licitacoes/app', tenders ? `${TENDERS_BASE}tenders.html` : '/tenders.html'));
  }
  if (tenders) {
    plugins.push(tendersIcons(outDir));
  } else {
    plugins.push(...VitePWA({
      strategies: 'injectManifest',
      srcDir: 'apps/finance/web/src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false,
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: [
          'assistant.html',
          'manifest.json',
          'assets/assistant-*.js',
          'assets/globals-*.css',
          'assets/globals-*.js',
          'assets/UpdatePwaBanner-*.js',
          'icons/apple-touch-icon.png',
          'icons/assistente-perfil.webp',
          'icons/favicon.svg',
          'icons/pwa-192.png',
          'icons/pwa-512.png',
          'icons/pwa-maskable-512.png',
        ],
      },
    }));
  }
  return {
    plugins,
    root: '.',
    base: tenders ? TENDERS_BASE : '/',
    build: {
      outDir,
      copyPublicDir: !tenders,
      rollupOptions: {
        input: Object.fromEntries(selectedEntries.map(([key, file]) => [key, resolve(__dirname, file)])),
      },
    },
    css: { postcss: { plugins: [tailwindcss({ ...tailwind, content }), autoprefixer()] } },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3010',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@ui': resolve(__dirname, 'packages/ui/src'),
        ...(!tenders && { '@site': resolve(__dirname, 'apps/site/src'), '@finance': resolve(__dirname, 'apps/finance/web/src') }),
      },
    },
  };
}
