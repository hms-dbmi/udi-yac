import { useCallback, useState } from 'react';
import { useTracker } from '@/app/UDIChatContext';

const STORAGE_KEY = 'udi-chat-api-key';

function readStoredKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredKey(key: string | null): void {
  try {
    if (key === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, key);
    }
  } catch {
    /* noop — private-mode / disabled storage */
  }
}

/**
 * Owns all state related to the user-supplied OpenAI API key: the key
 * itself (persisted to localStorage), the two quota flags that react to
 * budget-exceeded rebuffs from the server, and the one-shot retry signal
 * that fires after the user submits a key in response to a quota event.
 *
 * The retry effect itself lives in `ChatPanel`, because it needs
 * `retryLastUserMessage` from `useChatApi` — see `pendingQuotaRetry` /
 * `consumePendingRetry` for the hand-off.
 */
export function useApiKey({ requireApiKey }: { requireApiKey: boolean }) {
  const trackEvent = useTracker();
  const [openAiKey, setOpenAiKey] = useState<string | null>(readStoredKey);
  // Budget-exceeded rebuff arrived while the request had no user key —
  // unlocks `ApiKeyInput` regardless of `requireApiKey`.
  const [serverQuotaExceeded, setServerQuotaExceeded] = useState(false);
  // Budget-exceeded rebuff arrived while the request DID carry the user's
  // key — their own key appears spent; surfaces the "clear & re-enter"
  // banner in `ChatPanel`.
  const [userKeyQuotaExceeded, setUserKeyQuotaExceeded] = useState(false);
  // Flipped on when a key is submitted in response to a quota event,
  // consumed by `ChatPanel` to auto-retry the last user message after the
  // new key has propagated through `queryConfig`. Gated so manual key
  // entry (via `requireApiKey=true`) doesn't trigger a phantom resend.
  const [pendingQuotaRetry, setPendingQuotaRetry] = useState(false);

  const setApiKey = useCallback(
    (key: string) => {
      setOpenAiKey(key);
      writeStoredKey(key);
      const wasQuotaResponse = serverQuotaExceeded || userKeyQuotaExceeded;
      setServerQuotaExceeded(false);
      setUserKeyQuotaExceeded(false);
      if (wasQuotaResponse) {
        setPendingQuotaRetry(true);
      }
      trackEvent('api_key_set', { inResponseToQuota: wasQuotaResponse });
    },
    [serverQuotaExceeded, userKeyQuotaExceeded, trackEvent],
  );

  const clearApiKey = useCallback(() => {
    setOpenAiKey(null);
    setUserKeyQuotaExceeded(false);
    writeStoredKey(null);
    trackEvent('api_key_cleared');
  }, [trackEvent]);

  const onQuotaRebuff = useCallback((hadUserKey: boolean) => {
    if (hadUserKey) {
      setUserKeyQuotaExceeded(true);
    } else {
      setServerQuotaExceeded(true);
    }
  }, []);

  const onNormalResponse = useCallback(() => {
    setServerQuotaExceeded(false);
    setUserKeyQuotaExceeded(false);
  }, []);

  const consumePendingRetry = useCallback(() => {
    setPendingQuotaRetry(false);
  }, []);

  const needsApiKey = (requireApiKey || serverQuotaExceeded) && !openAiKey;
  const hasApiKey = !!openAiKey;

  return {
    openAiKey,
    needsApiKey,
    hasApiKey,
    userKeyQuotaExceeded,
    pendingQuotaRetry,
    setApiKey,
    clearApiKey,
    onQuotaRebuff,
    onNormalResponse,
    consumePendingRetry,
  };
}
