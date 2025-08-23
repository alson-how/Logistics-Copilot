import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://api:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    port: 5173,
    host: true
  },
  // Remove proxy in production build
  build: {
    rollupOptions: {
      // Ensure environment variables are properly replaced
    }
  }
})
