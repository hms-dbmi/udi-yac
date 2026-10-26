import { useEffect, useMemo, useState } from 'react';
import { useDataPackage } from '@/app/UDIChatContext';

function cleanPrompts(data: unknown[]): string[] {
  return data.map((p) => (typeof p === 'string' ? p.trim() : '')).filter((p) => p.length > 0);
}

/**
 * Example prompts for the loaded data package. A package that carries its own
 * `udi:example_prompts` gets those, with no agent needed — a static host such as
 * GitHub Pages can ship prompts beside its CSVs. Otherwise fetches the UDI
 * agent's /v1/yac/examples endpoint, naming the package so one with its own
 * prompts gets them (the agent falls back to its global list). Waits for the
 * package, so a package-specific list never flashes the global one first.
 * Returns an empty list until the fetch resolves or if the endpoint is unavailable.
 */
export function useExamplePrompts(apiBaseUrl: string | undefined): {
  examplePrompts: string[];
} {
  const [agentPrompts, setAgentPrompts] = useState<string[]>([]);
  const loaded = useDataPackage((s) => s.dataPackage !== null);
  const packageName = useDataPackage((s) => s.dataPackage?.name);
  const packagePrompts = useDataPackage((s) => s.dataPackage?.['udi:example_prompts']);
  const ownPrompts = useMemo(
    () => (Array.isArray(packagePrompts) ? cleanPrompts(packagePrompts) : null),
    [packagePrompts],
  );

  useEffect(() => {
    if (!apiBaseUrl || !loaded || ownPrompts) return;
    let stale = false;
    const query = packageName ? `?package=${encodeURIComponent(packageName)}` : '';
    fetch(`${apiBaseUrl}/v1/yac/examples${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (stale || !Array.isArray(data)) return;
        setAgentPrompts(cleanPrompts(data));
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [apiBaseUrl, loaded, packageName, ownPrompts]);

  return { examplePrompts: ownPrompts ?? agentPrompts };
}
