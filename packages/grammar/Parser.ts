import type {
  UDIGrammar,
  DataSource,
  DataTransformation,
  Representations,
  VisualizationTitle,
} from './GrammarTypes';

export interface ParsedUDIGrammar {
  source: DataSource[];
  transformation?: DataTransformation[];
  representation: Representations;
  title?: string | VisualizationTitle;
}

/**
 * Convenience function to simplify the specification
 * to ensure that source and representation are always arrays
 */
export function parseSpecification(spec: UDIGrammar): ParsedUDIGrammar {
  let { source, representation } = spec;
  const { transformation, title } = spec;
  if (!Array.isArray(source)) {
    source = [source];
  }
  if (!representation) {
    // Default repesentation
    representation = {
      mark: 'row',
      mapping: [
        {
          mark: 'text',
          encoding: 'text',
          field: '*',
          type: 'nominal',
        },
      ],
    };
  }
  if (!Array.isArray(representation)) {
    representation = [representation] as Representations;
  }

  // The parsed form is what the renderer sees, so anything it needs has to be
  // copied across explicitly — this builds a fresh object rather than spreading.
  const result: ParsedUDIGrammar = { source, representation };
  if (transformation) result.transformation = transformation;
  if (title) result.title = title;
  return result;
}
