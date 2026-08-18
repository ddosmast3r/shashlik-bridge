import { defineConfig } from 'vite'

export default defineConfig({
  // В вёрстке картинки указаны как /public/image/... — отключаем спецрежим Vite
  // для папки public, чтобы пути работали один в один как на сервере.
  publicDir: false,
  // Сайт многостраничный (/, /menu/, /shashlyk/) — без SPA-фоллбэка,
  // чтобы dev-сервер вёл себя так же, как nginx, и не прятал 404.
  appType: 'mpa',
  server: {
    port: 5173,
    open: true
  }
})
