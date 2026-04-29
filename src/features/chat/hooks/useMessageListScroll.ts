import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Message } from '@/types/messages';

const PIN_THRESHOLD_PX = 64;

export interface MessageListScrollResult {
  contentRef: RefObject<HTMLDivElement | null>;
  firstUnreadIndex: number | null;
  scrollToBottom: () => void;
}

/**
 * Owns the scroll-pin / new-message-arrival / streaming-tail behavior for
 * the chat message list. Tracks whether the user is "pinned" near the bottom
 * (within PIN_THRESHOLD_PX), aligns newly-arrived messages to the top of the
 * viewport when pinned, keeps the tail glued to the bottom while a streamed
 * message grows in place, and exposes a firstUnreadIndex marker for the
 * divider + "new message" pill rendered by the consumer.
 *
 * The unread marker is anchored to the first message that arrived
 * out-of-view and is cleared on two re-engagement signals: scrolling back
 * within the pin threshold, or sending a new user message.
 */
export function useMessageListScroll(messages: Message[]): MessageListScrollResult {
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const prevLengthRef = useRef(messages.length);
  // Start pinned so the initial mount scrolls to the latest message.
  const pinnedRef = useRef(true);
  const justAddedMessageRef = useRef(false);

  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);

  // Resolve the scroll viewport once the content is mounted, jump to the bottom
  // on initial render, and keep pinnedRef in sync with user scroll position.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const root = content.closest<HTMLElement>('[data-slot="scroll-area"]');
    const viewport = root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    viewportRef.current = viewport;
    viewport.scrollTop = viewport.scrollHeight;

    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nowPinned = distance < PIN_THRESHOLD_PX;
      const wasPinned = pinnedRef.current;
      pinnedRef.current = nowPinned;
      // Re-entering the pinned region is one of the two "I've caught up"
      // signals that dismisses the unread divider.
      if (nowPinned && !wasPinned) {
        setFirstUnreadIndex(null);
      }
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // On new-message arrival: if the user is pinned, scroll the newest message
  // to the top of the viewport; otherwise mark the first unread boundary so a
  // divider + "new message" pill can surface the fact that content arrived
  // out of view. Sending a user message counts as the user re-engaging with
  // the conversation and clears the divider, even if the viewport hasn't
  // scrolled yet.
  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (messages.length <= prev) return;

    const latest = messages[messages.length - 1];
    const userSent = latest?.role === 'user';

    if (pinnedRef.current || userSent) {
      setFirstUnreadIndex(null);
    } else {
      // Preserve the earliest unread boundary across successive arrivals —
      // once a gap opens, the divider should anchor to where reading stopped,
      // not creep forward with every new message.
      setFirstUnreadIndex((current) => current ?? prev);
    }

    if (!pinnedRef.current) return;

    justAddedMessageRef.current = true;
    const frame = requestAnimationFrame(() => {
      const items = contentRef.current?.querySelectorAll<HTMLElement>('[data-message]');
      const last = items?.[items.length - 1];
      last?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestAnimationFrame(() => {
        justAddedMessageRef.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  // Streaming updates: when the last message grows in place and the user is
  // still pinned to the bottom, keep the tail glued to the viewport bottom
  // without overriding the just-added-message alignment.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (justAddedMessageRef.current) return;
      if (!pinnedRef.current) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  };

  return { contentRef, firstUnreadIndex, scrollToBottom };
}
