import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { esmExternalRequirePlugin } from 'rolldown/plugins';

// React (+ its subpaths) are peer deps and MUST stay external. Bundling a
// second copy gives the lib its own React instance whose hook dispatcher is
// never installed by the consumer's renderer, so the first hook (useRef) reads
// a null dispatcher → "can't access property useRef, O() is null". Everything
// else (arquero/vega, pulled in via udi-toolkit) is deliberately bundled so
// consumers don't have to install it — only React breaks when duplicated.
const REACT_EXTERNALS = ['react', 'react-dom', 'react/jsx-runtime'];
const isReactExternal = (id: string) =>
  id === 'react' || id === 'react-dom' || id.startsWith('react/') || id.startsWith('react-dom/');

export default defineConfig(({ mode }) => ({
  base: mode === 'lib' ? '/' : (process.env.VITE_BASE ?? '/'),
  // react-draggable@4.7.0 reads unguarded `process.env.DRAGGABLE_DEBUG`, which
  // throws `process is not defined` in the browser (drag/resize dies on
  // mousedown). Vite only auto-replaces NODE_ENV, so stub this one out.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'undefined',
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'lib'
      ? [
          dts({
            // No insertTypesEntry: under rolldown-vite it wrote an empty
            // `export {}` stub at dist/index.d.ts (its computed source-entry
            // path didn't match an emitted file). The real barrel is emitted at
            // dist/src/index.d.ts; package.json "types" points there directly.
            include: ['src'],
            exclude: ['src/app/App.tsx', 'src/app/main.tsx'],
            tsconfigPath: resolve(__dirname, 'tsconfig.app.json'),
          }),
          esmExternalRequirePlugin({ external: REACT_EXTERNALS }),
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
            // rollupOptions.external is what actually keeps React out of the
            // bundle. esmExternalRequirePlugin (above) only rewrites CJS
            // `require("react")` in bundled deps into ESM imports — it does NOT
            // mark anything external on its own, so without this React was being
            // inlined.
            external: isReactExternal,
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
