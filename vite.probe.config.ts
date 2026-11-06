import { defineConfig } from 'vite';
import { htmlEntryRewrite } from './vite.shared';

export default defineConfig({
  appType: 'mpa',
  build: { outDir: 'dist/probe' },
  plugins: [htmlEntryRewrite('hosting-probe-rewrite', '/__tenders_probe', '/__tenders_probe/index.html')],
});
