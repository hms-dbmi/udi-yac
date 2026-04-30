import type { DataPackageState } from '@/features/data-package';

const FUNC_PATTERN = /\{(\w+)\((.*?)\)\}/g;

function parseArgs(rawArgs: string): string[] {
  if (!rawArgs.trim()) return [];
  return rawArgs.split(',').map((arg) => {
    const trimmed = arg.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}

type FuncHandler = (store: DataPackageState, args: string[]) => string;

const functionRegistry: Record<string, FuncHandler> = {
  entity_count(store) {
    return String(store.entityNames.length);
  },

  entity_names(store) {
    return store.entityNames.join(', ');
  },

  field_count(store, args) {
    const entity = args[0];
    if (!entity || !store.sourceFields) return '?';
    const fields = store.sourceFields[entity];
    return fields ? String(fields.length) : '?';
  },

  field_type(store, args) {
    const [entity, field] = args;
    if (!entity || !field) return '?';
    const domain = store.getDomainForField(entity, field);
    return domain ? domain.type : '?';
  },

  row_count(store, args) {
    const entity = args[0];
    if (!entity || !store.dataPackage?.resources) return '?';
    const resource = store.dataPackage.resources.find((r) => r.name === entity);
    return resource?.['udi:row_count'] != null ? String(resource['udi:row_count']) : '?';
  },

  sample_values(store, args) {
    const [entity, field] = args;
    if (!entity || !field) return '?';
    const domain = store.getDomainForField(entity, field);
    if (!domain) return '?';
    if (domain.type === 'interval') {
      const d = domain.domain as { min: number; max: number };
      return `${d.min} \u2013 ${d.max}`;
    }
    const d = domain.domain as { values: string[] };
    return d.values.slice(0, 5).join(', ');
  },
};

export type StructuredTextSegment =
  | { type: 'text'; content: string }
  | { type: 'value'; content: string }
  | { type: 'field_list'; entity: string; fields: string[] };

export function evaluateStructuredText(
  text: string,
  store: DataPackageState,
): StructuredTextSegment[] {
  const segments: StructuredTextSegment[] = [];
  let lastIndex = 0;

  // FUNC_PATTERN is a module-level /g regex; matchAll reads its lastIndex.
  // Reset before iterating so prior calls (including hasStructuredReferences,
  // which uses .test()) can't leak state into this match.
  FUNC_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(FUNC_PATTERN)) {
    const [fullMatch, funcName, rawArgs] = match;
    const matchIndex = match.index!;

    if (matchIndex > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, matchIndex) });
    }

    // field_names emits a structured field_list segment so the UI can render
    // a collapsible widget rather than a long comma-separated string. All
    // other functions resolve to flat text values via the handler registry.
    if (funcName === 'field_names') {
      try {
        const args = parseArgs(rawArgs);
        const entity = args[0] ?? '';
        const fields = (entity && store.sourceFields?.[entity]) || [];
        segments.push({ type: 'field_list', entity, fields });
      } catch {
        segments.push({ type: 'text', content: fullMatch });
      }
    } else {
      const handler = functionRegistry[funcName];
      if (handler) {
        try {
          const args = parseArgs(rawArgs);
          const result = handler(store, args);
          segments.push({ type: 'value', content: result });
        } catch {
          segments.push({ type: 'text', content: fullMatch });
        }
      } else {
        segments.push({ type: 'text', content: fullMatch });
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

export function hasStructuredReferences(text: string): boolean {
  FUNC_PATTERN.lastIndex = 0;
  const result = FUNC_PATTERN.test(text);
  // .test() advances lastIndex on a /g regex; reset so we don't poison the
  // shared FUNC_PATTERN state for later evaluateStructuredText calls.
  FUNC_PATTERN.lastIndex = 0;
  return result;
}
