// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';
import { fileURLToPath } from 'node:url';

export default defineConfig((ctx) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['monaco'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      publicPath: process.env.QUASAR_PUBLIC_PATH ?? '/udi-yac/grammar/',

      // app-vite 3 dropped the bare `src/`, `layouts/` and `pages/` import
      // aliases (only `@/` remains); keep the ones this app imports through.
      alias: {
        src: ctx.appPaths.srcDir,
        layouts: ctx.appPaths.resolve.src('layouts'),
        pages: ctx.appPaths.resolve.src('pages'),
      },

      typescript: {
        strict: true,
        vueShim: true,
      },

      // Resolve udi-toolkit to its workspace source so editing components in
      // packages/grammar hot-reloads the demo app. Typechecking still goes
      // through the package's dist/index.d.ts (build the toolkit first).
      extendViteConf(viteConf) {
        viteConf.resolve = viteConf.resolve ?? {};
        viteConf.resolve.alias = {
          ...viteConf.resolve.alias,
          'udi-toolkit': fileURLToPath(
            new URL('../../packages/grammar/index.ts', import.meta.url),
          ),
        };
        // Quasar injects `@import 'quasar/src/css/variables.sass'` into every
        // scss block. Toolkit SFCs live outside this package, where `quasar`
        // isn't node-resolvable — let sass find it via this app's node_modules.
        viteConf.css = viteConf.css ?? {};
        viteConf.css.preprocessorOptions =
          viteConf.css.preprocessorOptions ?? {};
        const scss = viteConf.css.preprocessorOptions.scss ?? {};
        viteConf.css.preprocessorOptions.scss = {
          ...scss,
          loadPaths: [
            ...(scss.loadPaths ?? []),
            fileURLToPath(new URL('./node_modules', import.meta.url)),
          ],
        };
      },

      vueRouterMode: 'hash', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // publicPath: '/',
      // analyze: true,
      // env: {},
      // rawDefine: {}
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // viteVuePluginOptions: {},

      // distDir: 'dist', // default Quasar output
      // extendViteConf(viteConf) {
      //   viteConf.build = viteConf.build || {};
      //   viteConf.build.lib = {
      //     entry: 'src/embed.ts',
      //     formats: ['es'],
      //     fileName: 'embed',
      //     name: 'embed',
      //   };
      // },

      // rollupOptions: {
      //   input: {
      //     // output a separate build for embed function
      //     embed: 'src/embed.ts',
      //   },
      //   output: {
      //     entryFileNames: 'embed.js',
      //     format: 'es',
      //   },
      // },

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand:
                'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
            overlay: {
              initialIsOpen: false, // set to true to show overlay on startup
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      open: false, // opens browser window automatically
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: [],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],
  };
});
