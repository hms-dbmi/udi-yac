import { useEffect, useRef, useState } from 'react';
import { scrollIntoViewport } from '@/utils/scrollIntoViewport';

const FLASH_MS = 1200;

/**
 * Receiving half of a cross-panel "jump to" (chat message ↔ dashboard card).
 * Pass the request's nonce when this element is the target, `null` otherwise:
 * the element scrolls into its own viewport and flashes a highlight, so the
 * jump reads as a jump even when the target was already on screen.
 *
 * The nonce (not the target key) is the effect's dependency so clicking the
 * same jump button twice re-fires.
 */
export function useJumpTarget<T extends HTMLElement>(nonce: number | null) {
  const ref = useRef<T>(null);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (nonce == null || !ref.current) return;
    scrollIntoViewport(ref.current);
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [nonce]);

  return { ref, flashing };
}
