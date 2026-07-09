import { createApp } from 'vue';
import { UDIVis, type UDIGrammar } from 'udi-toolkit';

export function embed(el: HTMLElement, spec: UDIGrammar) {
  const app = createApp(UDIVis, { spec });
  app.mount(el);
}
