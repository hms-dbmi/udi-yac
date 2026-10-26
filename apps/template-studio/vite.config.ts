import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { reviewStorePlugin } from './vite-plugin-review-store';

// Review state lives beside the agent's templates so the authoring skill can read
// both together. It is a sidecar: the generated template files stay untouched.
const SKILLS_DIR = resolve(__dirname, '../../packages/agent/src/udiagent/data/skills');
const REVIEW_FILE = resolve(SKILLS_DIR, 'template_reviews.json');
const TEMPLATES_FILE = resolve(SKILLS_DIR, 'template_visualizations.json');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    reviewStorePlugin({ reviewFile: REVIEW_FILE, templatesFile: TEMPLATES_FILE }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    // Distinct from chat (5173) and the grammar app so all three can run at once.
    port: 5175,
    open: false,
  },
});
