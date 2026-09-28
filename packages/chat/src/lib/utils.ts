import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Our utilities carry the `udi:` prefix (see src/index.css); without teaching
// tailwind-merge about it, every class looks arbitrary and conflicting pairs
// like `udi:px-2 udi:px-4` both survive the merge instead of the later winning.
const twMerge = extendTailwindMerge({ prefix: 'udi' });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Short unique ID suitable for analytics correlation (sessionId, turnId).
 * Prefers `crypto.randomUUID` when available; falls back to a
 * timestamp+random concatenation for environments without WebCrypto.
 */
export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
