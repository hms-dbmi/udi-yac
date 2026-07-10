import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  stories: ['../*.mdx', '../*.stories.@(js|jsx|mjs|ts|tsx)'],
  // Serve the repo-root single-source sample data at /data so stories can
  // fetch './data/donors.csv' etc. (from is resolved relative to this
  // .storybook config dir: ../../../ = repo root).
  staticDirs: [{ from: '../../../sample-data', to: '/data' }],
  addons: [
    '@storybook/addon-onboarding',
    '@storybook/addon-essentials',
    '@chromatic-com/storybook',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        // Don't auto-load the package's vite.config.js — that's the lib
        // build (dts emit into dist/, vue/pinia externalized), not app-ish
        // config storybook should inherit.
        viteConfigPath: '.storybook/vite.config.stub.ts',
      },
    },
  },
};

export default config;
