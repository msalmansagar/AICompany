/**
 * Foreground / background pairings for canvas chrome — edge labels and node chips.
 *
 * A pairing lives here rather than inline in a component because the *pairing* is
 * what has to stay legible, and a pairing named in one place can be contrast-checked
 * in one place. Every route label on the canvas was unreadable because independent
 * components each chose `var(--warning)` for both the fill and the text; neither the
 * compiler nor the test suite could see it, because each value was individually
 * valid. `surfacePairs.test.ts` resolves these against every theme in `tokens.css`
 * and fails when a pairing stops being readable.
 */

/** A background, the text drawn on it, and the outline around it. */
export interface SurfacePair {
  readonly background: string;
  readonly foreground: string;
  readonly border: string;
}

/** Which kind of route an edge label is describing. */
export type RouteLabelKind = 'fallback' | 'conditional' | 'plain';

/**
 * Route labels sit on a raised neutral surface rather than a semantic tint.
 *
 * A tinted fill was measured first and rejected: `--warning` on `--warning-bg`
 * reaches only 2.90:1 in the vibrant theme, below the 3:1 floor. On a neutral
 * raised surface the same colour reaches 3.19:1, because a raised surface is a
 * ground every theme already tunes its text colours against.
 */
const ROUTE_LABEL_PAIRS: Readonly<Record<RouteLabelKind, SurfacePair>> = {
  fallback: {
    background: 'var(--surface-raised)',
    foreground: 'var(--success)',
    border: 'var(--success)',
  },
  conditional: {
    background: 'var(--surface-raised)',
    foreground: 'var(--warning)',
    border: 'var(--warning)',
  },
  plain: {
    background: 'var(--surface-raised)',
    foreground: 'var(--text-secondary)',
    border: 'var(--border-strong)',
  },
};

/** The unaccented chip used for names inside a node, such as an assignee. */
export const NODE_NEUTRAL_CHIP: SurfacePair = {
  background: 'var(--neutral-chip)',
  foreground: 'var(--text)',
  border: 'var(--border-strong)',
};

/**
 * The colours for a route edge label.
 * @param kind which sort of route the label describes
 * @returns the background, foreground and border to draw it with
 */
export function routeLabelPair(kind: RouteLabelKind): SurfacePair {
  return ROUTE_LABEL_PAIRS[kind];
}

/**
 * Every pairing the contrast guard checks. A new pair must be registered here,
 * which is what stops the next one from going unmeasured.
 */
export const ALL_SURFACE_PAIRS: Readonly<Record<string, SurfacePair>> = {
  'route label · fallback': ROUTE_LABEL_PAIRS.fallback,
  'route label · conditional': ROUTE_LABEL_PAIRS.conditional,
  'route label · plain': ROUTE_LABEL_PAIRS.plain,
  'node chip · neutral': NODE_NEUTRAL_CHIP,
};
