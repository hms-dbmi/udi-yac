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
import type { DataPackage } from '@/types/dataPackage';
import {
  buildJoinGroups,
  buildSchemaTree,
  countCrossEdges,
  type JoinGroup,
  type SchemaTreeNode,
} from '../utils/entityOverview';
import { EntityOverview } from './EntityOverview';

/** `many-to-one` → `N:1`; always three characters, which keeps the counts aligned. */
function shortCardinality(cardinality: string): string {
  const [from, to] = cardinality.split('-to-');
  const abbr = (side?: string) => (side === 'many' ? 'N' : '1');
  return `${abbr(from)}:${abbr(to)}`;
}

interface SchemaTreeRowsProps {
  nodes: SchemaTreeNode[];
  icons: EntityIconMap;
  selected: string | null;
  onSelect: (entity: string) => void;
  depth: number;
}

function SchemaTreeRows({ nodes, icons, selected, onSelect, depth }: SchemaTreeRowsProps) {
  return (
    <ul className={cn('flex flex-col', depth > 0 && 'pl-3')}>
      {nodes.map((node, i) => {
        const Icon = icons[node.name] ?? FALLBACK_ENTITY_ICON;
        const isLast = i === nodes.length - 1;
        return (
          <li key={node.name}>
            <button
              type="button"
              onClick={() => onSelect(node.name)}
              aria-label={`${node.name}, ${node.rowCount.toLocaleString()} rows`}
              className={cn(
                'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                selected === node.name && 'bg-accent font-medium text-udi-primary',
              )}
            >
              {depth > 0 && (
                <span aria-hidden className="shrink-0 font-mono text-muted-foreground/60">
                  {isLast ? '└─' : '├─'}
                </span>
              )}
              <Icon className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {/* Fixed-width cardinality keeps the counts in a column of their own. */}
              <span className="w-7 shrink-0 text-right text-[10px] text-muted-foreground">
                {node.cardinality ? shortCardinality(node.cardinality) : ''}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {node.rowCount.toLocaleString()}
              </span>
            </button>
            {/* No `otherEdges` branch: this renderer only runs when there are
                none — one demoted foreign key is what hands over to JoinList. */}
            {node.children.length > 0 && (
              <SchemaTreeRows
                nodes={node.children}
                icons={icons}
                selected={selected}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface JoinListProps {
  groups: JoinGroup[];
  icons: EntityIconMap;
  selected: string | null;
  onSelect: (entity: string) => void;
}

/**
 * Flat entity list with each entity's joins, used when the package is a graph
 * rather than a hierarchy.
 *
 * Nesting can only show one parent per entity. A junction table with four
 * parents would pick one arbitrarily and demote the other three to footnotes,
 * while those parents floated up as childless roots that read as disconnected.
 * Listing them instead demotes nothing and stays O(edges) rather than
 * degenerating as interconnection grows.
 *
 * Every entity gets a top-level row even when it declares no foreign keys, so
 * the map is a complete roll-call rather than only the entities that happen to
 * point at something.
 */
function JoinList({ groups, icons, selected, onSelect }: JoinListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {groups.map((group) => {
        const Icon = icons[group.entity] ?? FALLBACK_ENTITY_ICON;
        return (
          <li key={group.entity}>
            <button
              type="button"
              onClick={() => onSelect(group.entity)}
              aria-label={`${group.entity}, ${group.rowCount.toLocaleString()} rows`}
              className={cn(
                'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                selected === group.entity && 'bg-accent font-medium text-udi-primary',
              )}
            >
              <Icon className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{group.entity}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {group.rowCount.toLocaleString()}
              </span>
            </button>
            <ul className="flex flex-col">
              {group.edges.map((edge) => (
                <li key={`${edge.from}|${edge.to}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(edge.to)}
                    // The arrow is decorative, so without this the button would
                    // announce as just the target name — indistinguishable from
                    // that entity's accordion trigger.
                    aria-label={`${edge.from} joins ${edge.to}`}
                    className={cn(
                      'flex w-full items-center gap-1 rounded py-0.5 pl-4 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      selected === edge.to && 'text-udi-primary',
                    )}
                  >
                    <span aria-hidden>→</span>
                    <span className="min-w-0 flex-1 truncate">{edge.to}</span>
                    <span className="w-7 shrink-0 text-right text-[10px]">
                      {edge.cardinality ? shortCardinality(edge.cardinality) : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

interface SchemaMapProps {
  dataPackage: DataPackage | null;
  icons: EntityIconMap;
  selected: string | null;
  onSelect: (entity: string) => void;
}

/**
 * Package-level entity map, in whichever of two shapes fits the package.
 *
 * Neither is a box-and-line diagram: that encoded breadth as width, so a star
 * schema (pcx: four children of `Patient`) wanted 452px in a ~376px panel and got
 * clipped. Both renderers here are width-independent.
 *
 * A tree reads better when the package really is a hierarchy, but it can only
 * express one parent per entity. The moment any foreign key has to be demoted to
 * a footnote the nesting is telling a partial story, so the flat join list takes
 * over — which is the common case: HuBMAP's `datasets` references both `donors`
 * and `samples`.
 */
function SchemaMap({ dataPackage, icons, selected, onSelect }: SchemaMapProps) {
  const { roots, groups, isHierarchy } = useMemo(() => {
    const tree = buildSchemaTree(dataPackage);
    return {
      roots: tree,
      groups: buildJoinGroups(dataPackage),
      isHierarchy: countCrossEdges(tree) === 0,
    };
  }, [dataPackage]);

  // No declared relationships: the map would just repeat the accordion below it.
  if (groups.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <h3 className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        Relationships
      </h3>
      {isHierarchy ? (
        <SchemaTreeRows
          nodes={roots}
          icons={icons}
          selected={selected}
          onSelect={onSelect}
          depth={0}
        />
      ) : (
        <JoinList groups={groups} icons={icons} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}

/**
 * Data Overview: what is actually in the loaded data package. One accordion
 * item per entity (ranges for numeric fields, leading categories for
 * categorical ones, relationships, and the rows left after active filters),
 * below a tree of how the entities join.
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
  // re-syncs whenever something else names an entity (a count chip, a schema
  // tree row, a relationship link). React's adjust-state-during-render pattern,
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
          <SchemaMap
            dataPackage={dataPackage}
            icons={icons}
            selected={overviewEntity}
            onSelect={select}
          />
          <Accordion
            className="gap-3 border-t px-3 pb-3"
            value={expanded}
            onValueChange={(value) => setExpanded(value as string[])}
          >
            {entityNames.map((name) => {
              const Icon = icons[name] ?? FALLBACK_ENTITY_ICON;
              return (
                <AccordionItem key={name} value={name}>
                  {/*
                   * Sticky so the open entity's header — and its collapse
                   * control — stay reachable while scrolling a long field list.
                   * `h-9` fixes the offset that EntityOverview's own sticky
                   * Fields bar keys off (`top-9`).
                   */}
                  <AccordionTrigger
                    className="h-9"
                    headerClassName="sticky top-0 z-20 bg-background"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                        {(rowCounts.get(name) ?? 0).toLocaleString()}
                      </span>
                    </span>
                  </AccordionTrigger>
                  {/*
                   * overflow-visible (tailwind-merge drops the primitive's
                   * overflow-hidden): an overflow-hidden ancestor becomes the
                   * containing block for `position: sticky`, which would pin the
                   * Fields bar to the panel instead of the scroll viewport.
                   */}
                  <AccordionContent className="overflow-visible">
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
