import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { cors:true },
  preview: { cors:true },
  build: { target: 'chrome140', sourcemap: true, rollupOptions: {input: {main:'index.html',ocrSandbox:'src/ocr/sandbox.html'}} },
  worker: { format: 'es' },
});
