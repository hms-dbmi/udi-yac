// Storybook's vite config — deliberately minimal (see viteConfigPath in
// main.ts): just the SFC compiler, none of the lib build's dts/externals.
import vue from '@vitejs/plugin-vue';

export default { plugins: [vue()] };
