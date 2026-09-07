// The toolbox colours a field-type icon by its group so a maker can find a type by
// hue. Those colours were named directly in the module, which meant they stayed put
// when the appearance changed — slate on a dark surface being the worst of it.
//
// They resolve through tokens now, and these hold that: a raw colour reintroduced
// here would not follow the appearance, and nothing else would notice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIELD_TYPE_VISUALS, GROUP_COLOR_VARS, type ColorGroup } from '@/designer/toolbox/fieldTypeVisuals';

const TOKENS_CSS = readFileSync(join(__dirname, '../../../shared/src/theme/tokens.css'), 'utf8');

const GROUPS = Object.keys(GROUP_COLOR_VARS) as ColorGroup[];

describe('toolbox group colours', () => {
  it('names_no_colour_of_its_own', () => {
    for (const value of Object.values(GROUP_COLOR_VARS)) {
      expect(value).toMatch(/^var\(--type-[a-z]+\)$/);
    }
  });

  it('covers_every_group_a_field_type_uses', () => {
    const used = new Set(Object.values(FIELD_TYPE_VISUALS).map((visual) => visual.group));

    for (const group of used) {
      expect(GROUP_COLOR_VARS[group]).toBeDefined();
    }
  });

  it('resolves_to_a_token_the_stylesheet_declares', () => {
    for (const group of GROUPS) {
      expect(TOKENS_CSS).toContain(`--type-${group}:`);
    }
  });

  it('restates_every_group_for_dark_so_none_keeps_a_light_mid_tone', () => {
    // The light values were picked against white. Dark must override all six, or the
    // ones left behind go muddy while their neighbours do not — which reads as a bug.
    const darkBlock = TOKENS_CSS.slice(TOKENS_CSS.indexOf(':root[data-theme="dark"] {'));

    for (const group of GROUPS) {
      expect(darkBlock).toContain(`--type-${group}:`);
    }
  });

  it('gives_the_simulated_form_its_own_paper_token_in_both_appearances', () => {
    // Preview's paper stays light in every appearance — it shows the end user's view,
    // not the maker's — but softens off pure white in dark.
    expect(TOKENS_CSS).toContain('--paper: #ffffff;');
    expect(TOKENS_CSS).toContain('--paper: #fbfbfa;');
  });

  it('gives_the_paper_a_foreground_too', () => {
    // A background without a foreground is what made the preview's labels render
    // near-white on near-white under a dark appearance — about 1.03:1.
    expect(TOKENS_CSS).toContain('--paper-fg:');
  });

  it('never_lets_the_paper_take_the_appearance_foreground', () => {
    // --paper-fg is declared once, at :root, and no appearance overrides it. If one
    // ever did, the island would go near-white again in that appearance only.
    const declarations = TOKENS_CSS.match(/--paper-fg:\s*[^;]+;/g) ?? [];

    expect(declarations).toHaveLength(1);
  });
});
