// frontend/vite.config.js  — replace your existing one with this
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: "jsdom",
    setupFiles:  "./src/tests/setup.js",
  },
});