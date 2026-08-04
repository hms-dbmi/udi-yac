import { createContext, useContext, type RefObject } from 'react';

/**
 * A ref to UDIChat's root element, shared by the two things that need to reach
 * it from anywhere in the tree:
 *
 * 1. **Popup portals.** Base UI portals tooltip/popover/select/dropdown/dialog
 *    content to `document.body` by default — outside our root. Our design
 *    tokens are scoped to the root (so embedding us doesn't retheme the host
 *    app), so a popup portaled to `document.body` would render with the host's
 *    tokens, or none at all. The primitives forward this as Base UI's
 *    `container`.
 * 2. **Transient interaction state.** The dashboard's drag/resize class used to
 *    go on `document.body`, where its `user-select: none` and tooltip
 *    suppression reached into the host app. It goes on the root instead, which
 *    still contains the portaled popups from (1).
 *
 * Absent a provider this is null: portals fall back to Base UI's default and
 * the class toggle is a no-op, so the primitives still work standalone
 * (Storybook, isolated tests).
 */
const ChatRootContext = createContext<RefObject<HTMLElement | null> | null>(null);

export const ChatRootProvider = ChatRootContext.Provider;

/**
 * The chat root ref, or `undefined` when unmounted outside UDIChat — pass
 * straight to a Base UI `Portal`'s `container` prop.
 */
export function useChatRoot(): RefObject<HTMLElement | null> | undefined {
  return useContext(ChatRootContext) ?? undefined;
}
