/**
 * Public API of the `chat` feature. Cross-feature and app-layer imports must
 * go through this barrel (enforced by eslint-plugin-project-structure's
 * independent-modules rule); intra-feature imports should use relative paths.
 */

export { ChatPanel } from './components/ChatPanel';
export { ConversationList } from './components/ConversationList';

export { createConversationStore, type ConversationState } from './stores/conversationStore';

export type { QueryConfig } from './api/completions';
