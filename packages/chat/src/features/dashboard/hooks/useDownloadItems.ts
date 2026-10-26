import { useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { FileArchive, FileText } from 'lucide-react';
import {
  useDataFilters,
  useDataPackage,
  useDownloadActions,
  useTracker,
} from '@/app/UDIChatContext';
import type { Row } from '@/types/dataPackage';
import { saveBlob } from '@/lib/utils';
import type { DownloadActionContext, MenuAction } from '../types';

function toCSV(rows: Row[]): string {
  if (!rows?.length) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((s, r) => {
      Object.keys(r ?? {}).forEach((k) => s.add(k));
      return s;
    }, new Set()),
  );
  const escapeCell = (val: unknown): string => {
    if (val == null) return '';
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  const lines: string[] = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Convert a human-readable action label into a snake_case event suffix
 * ("Download All TSVs" → "all_tsvs") so consumer download actions emit
 * stable, script-friendly event names like `download_all_tsvs` alongside
 * the built-in `download_raw_data` / `download_manifest`.
 */
function eventSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/^download\s+/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function timestamp(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** The Download menu's built-in items, then the host's `downloadActions`. */
export function useDownloadItems(): { items: MenuAction[]; custom: MenuAction[] } {
  const filteredData = useDataPackage((s) => s.filteredData);
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const filters = useDataFilters((s) => s.dataSelections);
  const customActions = useDownloadActions();
  const trackEvent = useTracker();

  const rowsBySource = useMemo(() => {
    const result: { source: string; rows: Row[] }[] = [];
    for (const [source, data] of filteredData.entries()) {
      result.push({ source, rows: (data.displayRows ?? []) as Row[] });
    }
    return result;
  }, [filteredData]);

  const noData = rowsBySource.every((r) => r.rows.length === 0);

  const actionContext = useMemo<DownloadActionContext>(
    () => ({ rowsBySource, filters, dataPackage }),
    [rowsBySource, filters, dataPackage],
  );

  const handleDownloadCSV = useCallback(async () => {
    if (noData) return;
    const zip = new JSZip();
    const stamp = timestamp();
    const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

    for (const { source, rows } of rowsBySource) {
      if (!rows.length) continue;
      zip.file(`udi_display_${safeName(source)}_${stamp}.csv`, toCSV(rows));
    }
    if (Object.keys(zip.files).length === 0) return;
    const blob = await zip.generateAsync({ type: 'blob' });
    saveBlob(blob, `udi_display_bundle_${stamp}.zip`);
    trackEvent('download_raw_data', {
      sources: rowsBySource.filter((r) => r.rows.length > 0).length,
      rowsTotal: rowsBySource.reduce((acc, r) => acc + r.rows.length, 0),
    });
  }, [rowsBySource, noData, trackEvent]);

  const handleDownloadManifest = useCallback(() => {
    if (noData) return;
    const blocks: string[] = [];
    let idsTotal = 0;
    for (const { source, rows } of rowsBySource) {
      const ids = rows
        .map((r) => String((r as Record<string, unknown>)['hubmap_id'] ?? '').trim())
        .filter((v) => v.length > 0);
      if (ids.length > 0) {
        blocks.push([`${source}:`, ...ids].join('\n'));
        idsTotal += ids.length;
      }
    }
    const blob = new Blob([blocks.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    saveBlob(blob, `udi_manifest_${timestamp()}.txt`);
    trackEvent('download_manifest', { idsTotal });
  }, [rowsBySource, noData, trackEvent]);

  return {
    items: [
      {
        label: 'Download Raw Data',
        Icon: FileArchive,
        disabled: noData,
        onSelect: () => void handleDownloadCSV(),
      },
      {
        label: 'Download Manifest',
        Icon: FileText,
        disabled: noData,
        onSelect: handleDownloadManifest,
      },
    ],
    custom: customActions.map((action) => ({
      label: action.label,
      disabled:
        typeof action.disabled === 'function'
          ? action.disabled(actionContext)
          : (action.disabled ?? false),
      onSelect: () => {
        const slug = eventSlug(action.label) || 'custom';
        trackEvent(`download_${slug}`, { label: action.label });
        void action.onClick(actionContext);
      },
    })),
  };
}
