import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { EntityIconMap } from '@/features/dashboard';
import { DEFAULT_ENTITY_ICONS, FALLBACK_ENTITY_ICON } from '@/utils/entityIcons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDataPackage, useEntityIcons, useGlobal, useGlobalStore } from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import { buildSchemaGraph, type SchemaGraph } from '../utils/entityOverview';
import { EntityOverview } from './EntityOverview';

// ponytail: fixed node boxes laid out in ranked rows. Tune these four numbers
// if packages get denser; reach for a graph-layout library only if edges start
// crossing badly.
const NODE_W = 104;
const NODE_H = 38;
const GAP_X = 12;
const GAP_Y = 28;

/** `many-to-one` → `N:1`, short enough to sit on an edge without colliding. */
function shortCardinality(cardinality: string): string {
  const [from, to] = cardinality.split('-to-');
  const abbr = (side?: string) => (side === 'many' ? 'N' : '1');
  return `${abbr(from)}:${abbr(to)}`;
}

interface SchemaDiagramProps {
  graph: SchemaGraph;
  icons: EntityIconMap;
  selected: string | null;
  onSelect: (entity: string) => void;
}

/**
 * Package-level entity map. Edges are drawn in one absolutely positioned SVG;
 * the nodes on top are real `<button>`s so they get focus, hover and keyboard
 * activation for free rather than re-implementing them on `<g>` elements.
 */
function SchemaDiagram({ graph, icons, selected, onSelect }: SchemaDiagramProps) {
  const layout = useMemo(() => {
    const perRank = new Map<number, number>();
    for (const node of graph.nodes) perRank.set(node.rank, (perRank.get(node.rank) ?? 0) + 1);
    const width = Math.max(0, graph.maxCols * NODE_W + (graph.maxCols - 1) * GAP_X);
    const height = Math.max(0, graph.rankCount * NODE_H + (graph.rankCount - 1) * GAP_Y);
    const pos = new Map<string, { x: number; y: number }>();
    for (const node of graph.nodes) {
      const count = perRank.get(node.rank) ?? 1;
      const rowWidth = count * NODE_W + (count - 1) * GAP_X;
      pos.set(node.name, {
        x: (width - rowWidth) / 2 + node.col * (NODE_W + GAP_X),
        y: node.rank * (NODE_H + GAP_Y),
      });
    }
    return { pos, width, height };
  }, [graph]);

  // Nothing to map with a single table or no declared foreign keys.
  if (graph.nodes.length < 2 || graph.edges.length === 0) return null;

  return (
    <div className="overflow-x-auto px-3 py-2">
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
        >
          {graph.edges.map((edge) => {
            const a = layout.pos.get(edge.from);
            const b = layout.pos.get(edge.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W / 2;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x + NODE_W / 2;
            const y2 = b.y + NODE_H / 2;
            return (
              <g key={`${edge.from}|${edge.to}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-border" strokeWidth={1} />
                {edge.cardinality && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 2}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[8px]"
                  >
                    {shortCardinality(edge.cardinality)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {graph.nodes.map((node) => {
          const p = layout.pos.get(node.name);
          if (!p) return null;
          const Icon = icons[node.name] ?? FALLBACK_ENTITY_ICON;
          return (
            <button
              key={node.name}
              type="button"
              onClick={() => onSelect(node.name)}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              aria-label={`${node.name}, ${node.rowCount.toLocaleString()} rows`}
              className={cn(
                'absolute flex flex-col items-center justify-center rounded-md border bg-background text-[10px] leading-tight hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                selected === node.name && 'border-udi-primary ring-2 ring-udi-primary/40',
              )}
            >
              <span className="flex w-full items-center justify-center gap-1 px-1 font-medium">
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{node.name}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {node.rowCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Data Overview: what is actually in the loaded data package. One accordion
 * item per entity (ranges for numeric fields, leading categories for
 * categorical ones, relationships, and the rows left after active filters),
 * above a diagram of how the entities join.
 *
 * Everything comes from `dataPackageStore`, so it renders the same for
 * CSV-backed and server-side (remote) packages.
 */
export function DataOverviewPanel() {
  const globalStore = useGlobalStore();
  const overviewEntity = useGlobal((s) => s.overviewEntity);
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const entityNames = useDataPackage((s) => s.entityNames);
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  const loadError = useDataPackage((s) => s.error);

  const consumerIcons = useEntityIcons();
  const icons = useMemo<EntityIconMap>(
    () => ({ ...DEFAULT_ENTITY_ICONS, ...consumerIcons }),
    [consumerIcons],
  );
  const graph = useMemo(() => buildSchemaGraph(dataPackage), [dataPackage]);
  const rowCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const resource of dataPackage?.resources ?? []) {
      map.set(resource.name, resource['udi:row_count'] ?? 0);
    }
    return map;
  }, [dataPackage]);

  const select = useCallback(
    (entity: string) => globalStore.getState().setOverview(true, entity),
    [globalStore],
  );
  const close = useCallback(() => globalStore.getState().setOverview(false), [globalStore]);

  // Expansion is local so collapsing an item does not close the panel, and
  // re-syncs whenever something else names an entity (a count chip, a diagram
  // node, a relationship link). React's adjust-state-during-render pattern,
  // as used for the brush reset in DashboardCard.
  const [expanded, setExpanded] = useState<string[]>(overviewEntity ? [overviewEntity] : []);
  const [lastEntity, setLastEntity] = useState(overviewEntity);
  if (overviewEntity !== lastEntity) {
    setLastEntity(overviewEntity);
    if (overviewEntity) setExpanded([overviewEntity]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">Data</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={close}
          aria-label="Close data overview"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loadingPhase === 'error' ? (
        <div className="mx-3 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Couldn't load data package{loadError ? `: ${loadError}` : '.'}</span>
        </div>
      ) : entityNames.length === 0 ? (
        <div className="flex flex-col gap-2 px-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <SchemaDiagram graph={graph} icons={icons} selected={overviewEntity} onSelect={select} />
          <Accordion
            className="border-t px-3"
            value={expanded}
            onValueChange={(value) => setExpanded(value as string[])}
          >
            {entityNames.map((name) => {
              const Icon = icons[name] ?? FALLBACK_ENTITY_ICON;
              return (
                <AccordionItem key={name} value={name}>
                  <AccordionTrigger>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                        {(rowCounts.get(name) ?? 0).toLocaleString()}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EntityOverview entity={name} />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </ScrollArea>
      )}
    </div>
  );
}
