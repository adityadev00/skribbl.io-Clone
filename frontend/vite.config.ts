import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind v4 needs no tailwind.config.js — the plugin reads theme tokens from src/index.css (@theme).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 }, // must match CLIENT_ORIGIN in backend/.env
});
