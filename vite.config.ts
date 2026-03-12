import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  base: '/',

  build: {
    modulePreload: false,
    assetsInlineLimit: 0,
    minify: 'terser',
    cssMinify: true
  }

})