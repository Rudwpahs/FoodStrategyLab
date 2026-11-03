import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, 'web'),
  plugins: [react()],
  server: { fs: { allow: [path.resolve(here, '../..')] } },
  // npm run start 용 묶음 (휴대폰에서 빠르게 열리도록)
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
