import { useEffect, useState } from 'react';

/**
 * Fetches example prompts from the UDI agent's /v1/yac/examples endpoint.
 * Returns an empty list until the fetch resolves or if the endpoint is unavailable.
 */
export function useExamplePrompts(apiBaseUrl: string | undefined): {
  examplePrompts: string[];
} {
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    fetch(`${apiBaseUrl}/v1/yac/examples`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          const prompts = data
            .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p: string) => p.length > 0);
          setExamplePrompts(prompts);
        }
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  return { examplePrompts };
}
