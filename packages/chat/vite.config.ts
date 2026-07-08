import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { esmExternalRequirePlugin } from 'rolldown/plugins';

const LIB_EXTERNALS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'arquero',
  'vega',
  'vega-embed',
  'vega-lite',
];

export default defineConfig(({ mode }) => ({
  base: mode === 'lib' ? '/' : (process.env.VITE_BASE ?? '/'),
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
          esmExternalRequirePlugin({ external: LIB_EXTERNALS }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build:
    mode === 'lib'
      ? {
          lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'UDIYac',
            fileName: 'udi-yac',
            formats: ['es'] as const,
          },
          rollupOptions: {
            // Externals are declared on esmExternalRequirePlugin (configured in
            // the plugins array above), which both externalizes them AND
            // rewrites CJS `require("react")` shims inside deps like zustand
            // into ESM imports. Listing them here too triggers a duplicate
            // warning from the plugin.
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
