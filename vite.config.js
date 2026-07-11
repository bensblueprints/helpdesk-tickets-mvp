import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5441,
    proxy: {
      '/api': 'http://localhost:5341',
      '/inbound': 'http://localhost:5341',
      '/csat': 'http://localhost:5341'
    }
  }
});
