import React from 'react';

/**
 * The CMS runtime renderer — see ADR-CMS-004.
 *
 * Visitors are served by this, not by Puck's <Render>, so a breaking change in
 * a 0.x dependency cannot reach a published page. Puck stays on the admin
 * surface only.
 *
 * This is the single implementation. The browser harness (`app/oqb`), the
 * bundle measurement (`bundle-test/runtime.tsx`) and the CI parity gate
 * (`renderTree.parity.test.tsx`) all import it — a gate that tested a copy
 * would prove nothing about what ships.
 *
 * Deliberately NOT reimplemented from Puck, because the CMS does not use them:
 *   resolveAllData    async/dynamic prop resolution
 *   transformProps    field-level prop transforms
 *   useRichtextProps  rich text (blocked on Q1 anyway)
 *   walkTree/zones    Puck's legacy zones mechanism — we use slots only
 *   migrate           Puck's shape-sniffing migrations; ours is schemaVersion
 */

type Block = { type: string; props: Record<string, unknown> };

/** Border shown around a block whose type has no definition. */
const UNKNOWN_BLOCK_STYLE = {
  border: '1px dashed #c0392b',
  padding: 8,
  fontSize: 12,
} as const;

export function renderTree(
  config: any,
  data: any,
  metadata: Record<string, unknown>,
): React.ReactNode {
  /**
   * A slot value is an array of blocks, but the component calls it as a
   * component — `<Content />` — so each slot becomes a render-prop accepting
   * the same className/style props Puck's slots accept.
   */
  const slotComponent = (blocks: Block[] | undefined) => {
    const Slot = (slotProps: any = {}) =>
      React.createElement(
        'div',
        { className: slotProps.className, style: slotProps.style },
        (blocks ?? []).map((block, index) => renderBlock(block, index)),
      );
    return Slot;
  };

  /** Replaces any slot-valued prop with its render-prop equivalent. */
  const resolveSlots = (definition: any, props: Record<string, unknown>) => {
    const resolved: Record<string, unknown> = { ...props };
    for (const [name, field] of Object.entries<any>(definition?.fields ?? {})) {
      if (field?.type === 'slot') resolved[name] = slotComponent(props[name] as Block[]);
    }
    return resolved;
  };

  function renderBlock(block: Block, key: number): React.ReactNode {
    const definition = config.components[block.type];
    // A missing definition must be visible, not silently skipped — the same
    // rule as the unknown-icon placeholder.
    if (!definition) {
      return React.createElement(
        'div',
        { key, style: UNKNOWN_BLOCK_STYLE },
        `Unknown block: ${block.type}`,
      );
    }
    return React.createElement(definition.render, {
      key,
      ...resolveSlots(definition, block.props ?? {}),
      puck: { isEditing: false, metadata },
    });
  }

  return React.createElement(config.root.render, {
    ...resolveSlots(config.root, data.root?.props ?? {}),
    puck: { isEditing: false, metadata },
  });
}

/**
 * Strips attributes React and dnd-kit generate non-deterministically, so a
 * comparison reflects real divergence rather than instance counters.
 */
export function normaliseHtml(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/ data-rfd-[a-z-]+="[^"]*"/g, '')
    .replace(/ id="[^"]*"/g, '')
    .trim();
}
