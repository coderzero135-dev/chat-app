import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? './' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'dist'
  }
}));
