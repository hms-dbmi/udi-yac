<script setup lang="ts">
// `defineProps` is a compile-time macro in <script setup>; importing it
// shadows the macro and trips TS 6's "Import declaration conflicts with
// local declaration" diagnostic. The macro is in scope automatically.
import { computed, inject } from 'vue';
import { cloneDeep } from 'lodash';
import { UDI_PALETTE_KEY } from './paletteInjectKey';
import type { ColDef } from 'ag-grid-community';
import { type ParsedUDIGrammar } from './Parser';
import type { ExtendedRowMapping } from './TableUtil';
import { timeColumns } from './temporal';
import {
  computeFieldDomains,
  getDomainLookupKey,
  mappingNeedsDomain,
} from './TableUtil';
import UDICellRenderer from './UDICellRenderer.vue';
defineExpose({
  UDICellRenderer,
});
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3'; // Vue Data Grid Component
import type { Domain, RowLayer, RowMapping } from './GrammarTypes';
import type { UDIPalette } from './Palette';
import { recordLink, type RecordUrlFn } from './recordUrl';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TableComponentProps {
  spec: ParsedUDIGrammar | null;
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  data: Record<string, any>[] | null;
  /**
   * Consumer-supplied color palette, forwarded to each cell renderer.
   * Explicit `| undefined` is needed because callers under
   * `exactOptionalPropertyTypes: true` (the Quasar dev typecheck) pass
   * `effectivePalette` which is `UDIPalette | undefined` — `palette?:
   * UDIPalette` alone would reject the explicit undefined.
   */
  palette?: UDIPalette | undefined;
  /** Fill the parent's height instead of the default fixed height. Mirrors
   *  UDIVis's `fillContainer`; requires the parent to have a definite height. */
  fillContainer?: boolean | undefined;
  /** Multiplier on the grid's text size and row height (1 = stock). */
  fontScale?: number | undefined;
  /** Row → its record's page; adds a leading link column. See UDIVis. */
  recordUrl?: RecordUrlFn | undefined;
}

const props = defineProps<TableComponentProps>();
const scale = computed(() => props.fontScale ?? 1);

// Palette fallback chain: own prop → UDIToolkitProvider's injected palette →
// undefined (cell renderers handle the DEFAULT_PALETTE fallback themselves).
const injectedPalette = inject(UDI_PALETTE_KEY, null);
const effectivePalette = computed(
  () => props.palette ?? injectedPalette?.value,
);

const representations = computed<RowLayer[] | null>(() => {
  if (!props.spec) return null;
  if (props.spec.representation.length === 0) {
    return null;
  }
  for (const representation of props.spec.representation) {
    if (representation.mark !== 'row') {
      throw new Error(
        'The representation must be a row layer in the table component for every layer',
      );
    }
  }
  return props.spec.representation as RowLayer[];
});

const allFields = computed(() => {
  if (!props.data) return [];
  if (props.data.length === 0) {
    return [];
  }
  const keys = Object.keys(props.data[0] ?? []);
  return keys;
});

const columnMappingLayers = computed<RowMapping[][]>(() => {
  // This will expand fields: "*" to include every possible field
  // and will populated empty column attributes with value from vield.
  if (!representations.value) return [];
  const columnMapping = [];
  for (const representation of representations.value) {
    const columnMappingLayer = [];
    if (!representation.mapping) {
      throw new Error('Mapping is required for the table component');
    }
    let mapping = cloneDeep(representation.mapping);
    if (!Array.isArray(mapping)) {
      mapping = [mapping];
    }
    for (const part of mapping) {
      if (part.field === '*') {
        for (const field of allFields.value) {
          columnMappingLayer.push({
            ...part,
            field: field,
            column: field,
          });
        }
      } else {
        if (!part.column) {
          part.column = part.field;
        }
        columnMappingLayer.push(part);
      }
    }
    columnMapping.push(columnMappingLayer);
  }

  return columnMapping;
});

interface LayeredRowMapping extends RowMapping {
  layer: string;
}

const flatColumnMapping = computed<LayeredRowMapping[]>(() => {
  if (columnMappingLayers.value.length === 0) return [];
  const flatColumnMapping: LayeredRowMapping[] = [];
  for (let i = 0; i < columnMappingLayers.value.length; i++) {
    const columnMappingLayer = columnMappingLayers.value[i];
    for (const columnMapping of columnMappingLayer) {
      flatColumnMapping.push({ layer: i.toString(), ...columnMapping });
    }
  }
  return flatColumnMapping;
});

const fieldDomains = computed<Map<string, Domain>>(() =>
  computeFieldDomains(flatColumnMapping.value, props.data),
);

const colDefs = computed<ColDef[]>(() => {
  if (flatColumnMapping.value.length === 0) {
    return [];
  }

  const mappingWithDomains: ExtendedRowMapping[] = flatColumnMapping.value.map(
    (mapping) => {
      const k = getDomainLookupKey(mapping);
      const domain = fieldDomains.value.get(k);
      if (domain !== undefined) {
        return { ...mapping, domain: domain };
      }
      // computeFieldDomains deliberately derives nothing for encodings that
      // never consult a scale, so a missing domain is expected for those.
      // Anything else missing one is a real bug and still throws.
      if (!mappingNeedsDomain(mapping)) {
        return { ...mapping };
      }
      throw new Error(
        `Domain not found for mapping ${JSON.stringify(mapping)}`,
      );
    },
  );

  // group the column mapping by the column name
  const groupedMapping = Object.groupBy(
    mappingWithDomains,
    (mapping) => mapping.column!,
  );

  const keys = Object.keys(groupedMapping);
  const dateColumns = props.spec ? timeColumns(props.spec) : undefined;
  return [
    ...recordLinkColumn(),
    ...keys.map((key) => ({
      headerName: key,
      field: key,
      cellRenderer: 'UDICellRenderer',
      cellRendererParams: {
        // pass the representation to the cell renderer
        udiColumnMapping: groupedMapping[key],
        // forward the consumer palette so cell colors match the charts
        palette: effectivePalette.value,
        // time columns, so cells show dates, years and ages, not raw numbers
        timeColumns: dateColumns,
      },
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      valueGetter: (params: any) => {
        // get the value from the data object
        const columnMapping = groupedMapping[key];
        if (!columnMapping) return null;
        if (columnMapping.length === 0) return null;
        const field =
          columnMapping[0]?.orderby ?? columnMapping[0]?.field ?? null;
        if (!field) return null;
        return params.data[field];
      },
      // valueGetter: (params: any) => {
      //   return params.data;
      // },
      // comparator: (a: any, b: any) => {
      //   // compare the values of the data object
      //   const columnMapping = groupedMapping[key];
      //   if (!columnMapping) return 0;
      //   if (columnMapping.length === 0) return 0;
      //   const field = columnMapping[0]?.field ?? null;
      //   if (!field) return 0;
      //   return a[field] - b[field];
      //   would have to look across all the relevant fields, and handle
      //   text fields, and order.
      // },
    })),
  ];
});

// A leading ↗ column linking each row to its record's page, when the host's
// recordUrl gives a link for any row (aggregated rows carry no record id, so an
// aggregated table gets no column).
function recordLinkColumn(): ColDef[] {
  const fn = props.recordUrl;
  const source = props.spec?.source[0]?.name ?? '';
  if (!fn || !props.data?.some((row) => recordLink(fn, row, source))) return [];
  return [
    {
      colId: '__udi_record_link',
      headerName: '',
      width: Math.round(36 * scale.value),
      pinned: 'left',
      sortable: false,
      resizable: false,
      suppressMovable: true,
      // Quartz's cell padding alone is wider than the column.
      cellStyle: { padding: 0, textAlign: 'center' },
      cellRenderer: (params: { data?: Record<string, unknown> }) => {
        const url = params.data && recordLink(fn, params.data, source);
        if (!url) return '';
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        // VS15: the text glyph, not a color emoji where the font falls back.
        a.textContent = '↗\uFE0E';
        a.ariaLabel = 'Open record';
        a.title = url;
        // Same color as a URL cell's link (UDICellRenderer).
        a.style.color = 'var(--udi-table-link, LinkText)';
        a.style.textDecoration = 'none';
        return a;
      },
    },
  ];
}

/*
 * ag-grid ships its own light theme and knows nothing about our palette, so a
 * table stayed white-on-white inside a dark host even once the marks followed
 * the theme. Map the palette's chrome onto the Theming API; with no chrome in
 * the palette the grid keeps ag-grid's stock Quartz look.
 *
 * The font is the exception: before ag-grid 36 the grid drew in the host
 * page's font, and 36 switched to Quartz's own stack (IBM Plex Sans, then
 * system fonts). Inherit, so a table still matches the page around it.
 */
const gridTheme = computed(() => {
  const palette = effectivePalette.value;
  const params: Record<string, string | number> = { fontFamily: 'inherit' };
  // A transparent table shows the cells scrolling under its pinned link
  // column, so a host that sets --udi-table-surface (what the table sits on)
  // gets that painted instead: the same look, but opaque.
  if (palette?.background === 'transparent') {
    params.backgroundColor = 'var(--udi-table-surface, transparent)';
  } else if (palette?.background != null) {
    params.backgroundColor = palette.background;
  }
  if (palette?.text != null) params.foregroundColor = palette.text;
  if (palette?.grid != null) params.borderColor = palette.grid;
  // Quartz's stock size is 14px for both body and header.
  if (scale.value !== 1) {
    params.fontSize = 14 * scale.value;
    params.headerFontSize = 14 * scale.value;
  }
  return themeQuartz.withParams(params);
});
</script>

<template>
  <ag-grid-vue
    :theme="gridTheme"
    :rowData="props.data"
    :columnDefs="colDefs"
    :style="props.fillContainer ? { height: '100%' } : { height: '500px' }"
    :rowHeight="Math.round(20 * scale)"
    :pagination="true"
    :paginationPageSize="100"
    :paginationPageSizeSelector="[25, 50, 100, 500]"
  >
  </ag-grid-vue>
</template>

<style scoped lang="scss"></style>
