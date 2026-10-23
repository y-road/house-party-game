import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// 플레이어(/)와 관리자(/admin) 두 페이지를 한 번에 빌드한다.
export default defineConfig({
  root: import.meta.dirname,
  server: { fs: { allow: ['..'] } }, // ../shared 상수를 서버와 함께 쓴다
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        player: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
