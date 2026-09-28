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
    <ul className={cn('udi:flex udi:flex-col', depth > 0 && 'udi:pl-3')}>
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
                'udi:flex udi:w-full udi:items-center udi:gap-1 udi:rounded udi:px-1 udi:py-0.5 udi:text-left udi:text-xs udi:hover:bg-accent udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:focus-visible:outline-none',
                selected === node.name && 'udi:bg-accent udi:font-medium udi:text-udi-primary',
              )}
            >
              {depth > 0 && (
                <span
                  aria-hidden
                  className="udi:shrink-0 udi:font-mono udi:text-muted-foreground/60"
                >
                  {isLast ? '└─' : '├─'}
                </span>
              )}
              <Icon className="udi:size-3 udi:shrink-0 udi:text-muted-foreground" />
              <span className="udi:min-w-0 udi:flex-1 udi:truncate">{node.name}</span>
              {/* Fixed-width cardinality keeps the counts in a column of their own. */}
              <span className="udi:w-7 udi:shrink-0 udi:text-right udi:text-[10px] udi:text-muted-foreground">
                {node.cardinality ? shortCardinality(node.cardinality) : ''}
              </span>
              <span className="udi:shrink-0 udi:tabular-nums udi:text-muted-foreground">
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
    <ul className="udi:flex udi:flex-col udi:gap-1">
      {groups.map((group) => {
        const Icon = icons[group.entity] ?? FALLBACK_ENTITY_ICON;
        return (
          <li key={group.entity}>
            <button
              type="button"
              onClick={() => onSelect(group.entity)}
              aria-label={`${group.entity}, ${group.rowCount.toLocaleString()} rows`}
              className={cn(
                'udi:flex udi:w-full udi:items-center udi:gap-1 udi:rounded udi:px-1 udi:py-0.5 udi:text-left udi:text-xs udi:hover:bg-accent udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:focus-visible:outline-none',
                selected === group.entity && 'udi:bg-accent udi:font-medium udi:text-udi-primary',
              )}
            >
              <Icon className="udi:size-3 udi:shrink-0 udi:text-muted-foreground" />
              <span className="udi:min-w-0 udi:flex-1 udi:truncate">{group.entity}</span>
              <span className="udi:shrink-0 udi:tabular-nums udi:text-muted-foreground">
                {group.rowCount.toLocaleString()}
              </span>
            </button>
            <ul className="udi:flex udi:flex-col">
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
                      'udi:flex udi:w-full udi:items-center udi:gap-1 udi:rounded udi:py-0.5 udi:pl-4 udi:text-left udi:text-[11px] udi:text-muted-foreground udi:hover:bg-accent udi:hover:text-foreground udi:focus-visible:ring-3 udi:focus-visible:ring-ring/50 udi:focus-visible:outline-none',
                      selected === edge.to && 'udi:text-udi-primary',
                    )}
                  >
                    <span aria-hidden>→</span>
                    <span className="udi:min-w-0 udi:flex-1 udi:truncate">{edge.to}</span>
                    <span className="udi:w-7 udi:shrink-0 udi:text-right udi:text-[10px]">
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
    <div className="udi:px-3 udi:py-2">
      <h3 className="udi:mb-1 udi:text-[10px] udi:font-medium udi:tracking-wider udi:text-muted-foreground udi:uppercase">
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
    <div className="udi:flex udi:h-full udi:min-h-0 udi:flex-col">
      <div className="udi:flex udi:items-center udi:justify-between udi:px-3 udi:py-2">
        <h2 className="udi:text-sm udi:font-semibold">Data</h2>
        <Button
          variant="ghost"
          size="icon"
          className="udi:h-7 udi:w-7"
          onClick={close}
          aria-label="Close data overview"
        >
          <X className="udi:h-3.5 udi:w-3.5" />
        </Button>
      </div>

      {loadingPhase === 'error' ? (
        <div className="udi:mx-3 udi:flex udi:items-start udi:gap-1.5 udi:rounded-md udi:border udi:border-destructive/40 udi:bg-destructive/5 udi:px-2.5 udi:py-1.5 udi:text-xs udi:text-destructive">
          <AlertCircle className="udi:mt-0.5 udi:h-4 udi:w-4 udi:shrink-0" />
          <span>Couldn't load data package{loadError ? `: ${loadError}` : '.'}</span>
        </div>
      ) : entityNames.length === 0 ? (
        <div className="udi:flex udi:flex-col udi:gap-2 udi:px-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="udi:h-8 udi:animate-pulse udi:rounded udi:bg-muted" />
          ))}
        </div>
      ) : (
        <ScrollArea className="udi:min-h-0 udi:flex-1">
          <SchemaMap
            dataPackage={dataPackage}
            icons={icons}
            selected={overviewEntity}
            onSelect={select}
          />
          <Accordion
            className="udi:gap-3 udi:border-t udi:px-3 udi:pb-3"
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
                    className="udi:h-9"
                    headerClassName="udi:sticky udi:top-0 udi:z-20 udi:bg-background"
                  >
                    <span className="udi:flex udi:min-w-0 udi:flex-1 udi:items-center udi:gap-1.5">
                      <Icon className="udi:size-4 udi:shrink-0 udi:text-muted-foreground" />
                      <span className="udi:truncate">{name}</span>
                      <span className="udi:shrink-0 udi:text-xs udi:font-normal udi:tabular-nums udi:text-muted-foreground">
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
                  <AccordionContent className="udi:overflow-visible">
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
