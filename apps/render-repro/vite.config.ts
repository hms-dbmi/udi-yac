import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
  server: {
    // Distinct from chat (5173), the grammar app, and template-studio (5175).
    port: 5176,
    open: false,
  },
});
