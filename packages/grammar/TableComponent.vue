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
import {
  computeFieldDomains,
  getDomainLookupKey,
  mappingNeedsDomain,
} from './TableUtil';
import UDICellRenderer from './UDICellRenderer.vue';
defineExpose({
  UDICellRenderer,
});
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3'; // Vue Data Grid Component
import type { Domain, RowLayer, RowMapping } from './GrammarTypes';
import type { UDIPalette } from './Palette';

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
}

const props = defineProps<TableComponentProps>();

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
  return [
    ...keys.map((key) => ({
      headerName: key,
      field: key,
      cellRenderer: 'UDICellRenderer',
      cellRendererParams: {
        // pass the representation to the cell renderer
        udiColumnMapping: groupedMapping[key],
        // forward the consumer palette so cell colors match the charts
        palette: effectivePalette.value,
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
</script>

<template>
  <ag-grid-vue
    :rowData="props.data"
    :columnDefs="colDefs"
    :style="props.fillContainer ? { height: '100%' } : { height: '500px' }"
    :rowHeight="20"
    :pagination="true"
    :paginationPageSize="100"
    :paginationPageSizeSelector="[25, 50, 100, 500]"
  >
  </ag-grid-vue>
</template>

<style scoped lang="scss"></style>
