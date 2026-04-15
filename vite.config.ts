import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

const udiToolkitRoot = resolve(__dirname, '../udi-grammar/src/components');

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'lib'
      ? [
          dts({
            insertTypesEntry: true,
            include: ['src'],
            exclude: ['src/app/App.tsx', 'src/app/main.tsx'],
            tsconfigPath: resolve(__dirname, 'tsconfig.app.json'),
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Point to pre-built dist files (contains bundled Vue CE + React wrapper)
      'udi-toolkit/react': resolve(udiToolkitRoot, 'dist/react.js'),
      'udi-toolkit': resolve(udiToolkitRoot, 'dist/index.js'),
    },
  },
  build:
    mode === 'lib'
      ? {
          lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'UDIChatReact',
            fileName: 'udi-chat-react',
            formats: ['es'] as const,
          },
          rollupOptions: {
            external: [
              'react',
              'react-dom',
              'react/jsx-runtime',
              'arquero',
              'vega',
              'vega-embed',
              'vega-lite',
            ],
            output: {
              globals: {
                react: 'React',
                'react-dom': 'ReactDOM',
              },
            },
          },
          cssCodeSplit: false,
        }
      : {},
}));
