import { useEffect, useState } from 'react';
import { useDataPackage } from '@/app/UDIChatContext';

/**
 * Fetches example prompts from the UDI agent's /v1/yac/examples endpoint,
 * naming the loaded data package so a package with its own prompts gets them
 * (the agent falls back to its global list). Waits for the package, so a
 * package-specific list never flashes the global one first.
 * Returns an empty list until the fetch resolves or if the endpoint is unavailable.
 */
export function useExamplePrompts(apiBaseUrl: string | undefined): {
  examplePrompts: string[];
} {
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);
  const loaded = useDataPackage((s) => s.dataPackage !== null);
  const packageName = useDataPackage((s) => s.dataPackage?.name);

  useEffect(() => {
    if (!apiBaseUrl || !loaded) return;
    let stale = false;
    const query = packageName ? `?package=${encodeURIComponent(packageName)}` : '';
    fetch(`${apiBaseUrl}/v1/yac/examples${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (stale || !Array.isArray(data)) return;
        const prompts = data
          .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
          .filter((p: string) => p.length > 0);
        setExamplePrompts(prompts);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [apiBaseUrl, loaded, packageName]);

  return { examplePrompts };
}
