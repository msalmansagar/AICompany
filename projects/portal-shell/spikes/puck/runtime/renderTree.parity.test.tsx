import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core';

import { renderTree, normaliseHtml } from './renderTree';
import { reyadaConfig } from '../reyada.config';
import { reyadaData } from '../reyada.data';
import { portalConfig } from '../portal.config';
import { portalData } from '../portal.data';
import { landingConfig, loginConfig } from '../landing.puck';
import { landingData, loginData } from '../landing.puck.data';

/**
 * The merge gate behind ADR-CMS-004 and decision A-5 in phase-3-arch.md.
 *
 * Two renderers now exist: Puck's <Render> inside the editor canvas, and ours
 * at runtime. If they drift, an author previews one page and publishes a
 * different one — a class of defect no unit test on either renderer alone can
 * catch, because each is individually correct.
 *
 * So this renders the same tree through both and requires identical output,
 * across every page in the corpus and in both locales. A divergence fails the
 * build.
 */

type Corpus = { name: string; config: unknown; data: unknown };

const CORPUS: Corpus[] = [
  { name: 'reyada dashboard', config: reyadaConfig, data: reyadaData },
  { name: 'portal shell', config: portalConfig, data: portalData },
  { name: 'landing page', config: landingConfig, data: landingData },
  { name: 'login page', config: loginConfig, data: loginData },
];

const LOCALES = ['en', 'ar'] as const;

function renderThroughPuck(config: any, data: any, locale: string): string {
  return normaliseHtml(
    renderToStaticMarkup(
      React.createElement(Render, { config, data, metadata: { locale } }),
    ),
  );
}

function renderThroughOurs(config: any, data: any, locale: string): string {
  return normaliseHtml(
    renderToStaticMarkup(renderTree(config, data, { locale }) as React.ReactElement),
  );
}

/** Reports where output diverged, since a raw diff of 17k characters is unreadable. */
function describeDivergence(puckHtml: string, ourHtml: string): string {
  const limit = Math.max(puckHtml.length, ourHtml.length);
  let at = -1;
  for (let i = 0; i < limit; i++) {
    if (puckHtml[i] !== ourHtml[i]) { at = i; break; }
  }
  if (at === -1) return 'lengths differ with no differing character';
  const from = Math.max(0, at - 80);
  return [
    `first divergence at character ${at}`,
    `  puck: …${puckHtml.slice(from, at + 80)}`,
    `  ours: …${ourHtml.slice(from, at + 80)}`,
  ].join('\n');
}

describe('runtime renderer matches Puck', () => {
  for (const { name, config, data } of CORPUS) {
    for (const locale of LOCALES) {
      it(`produces identical output for ${name} in ${locale}`, () => {
        const puckHtml = renderThroughPuck(config, data, locale);
        const ourHtml = renderThroughOurs(config, data, locale);

        if (puckHtml !== ourHtml) {
          throw new Error(
            `Renderer divergence — ${name} (${locale}).\n` +
              `An author would preview one page and publish another.\n` +
              describeDivergence(puckHtml, ourHtml),
          );
        }
        expect(ourHtml).toBe(puckHtml);
      });
    }
  }

  it('renders non-trivial output, so an empty-vs-empty match cannot pass', () => {
    const html = renderThroughOurs(reyadaConfig, reyadaData, 'en');
    expect(html.length).toBeGreaterThan(5000);
  });

  /**
   * Deliberately not a parity assertion. Puck and our renderer are allowed to
   * differ on a block type that does not exist, because that never reaches a
   * published page — publish rejects an unresolvable block (FR-65, AC-65.1).
   * What matters is that ours does not silently drop it.
   */
  it('makes an unknown block type visible rather than dropping it', () => {
    const withUnknown = {
      ...(reyadaData as any),
      root: {
        props: {
          ...(reyadaData as any).root.props,
          heading: [{ type: 'BlockThatDoesNotExist', props: {} }],
        },
      },
    };
    const html = renderThroughOurs(reyadaConfig, withUnknown, 'en');
    expect(html).toContain('Unknown block: BlockThatDoesNotExist');
  });
});
