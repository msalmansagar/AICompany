import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from '../components/forms.js';

/**
 * Every action dialog opens as a right-docked side pane, in V1 and V2 alike (user instruction,
 * 2026-09-27). The placement is one stylesheet rule on the one `Dialog` primitive, so this test
 * pins the rule and the primitive rather than each dialog.
 */
const STYLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles');

function ruleFor(selector: string, file: string): string {
  const css = readFileSync(join(STYLES, file), 'utf8');
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`${selector} has no rule in ${file}`);
  return css.slice(start, css.indexOf('}', start));
}

afterEach(cleanup);

describe('action dialogs dock to the right', () => {
  it('styles the shared dialog as a full-height pane pushed to the right edge, never a centred modal', () => {
    const rule = ruleFor('.dialog', 'components.css');

    expect([rule.includes('margin-left: auto'), rule.includes('height: 100%'), rule.includes('slideIn'), rule.includes('margin: auto'), rule.includes('pop ')])
      .toEqual([true, true, true, false, false]);
  });

  it('fills the width on a narrow screen instead of leaving a sliver of scrim', () => {
    const css = readFileSync(join(STYLES, 'components.css'), 'utf8');

    expect(css).toMatch(/\.dialog, \.dialog\.lg \{ width: 100%; max-width: 100%; \}/);
  });

  it('renders every dialog through the one primitive, marked as a side pane', () => {
    render(<Dialog title="Log action" onClose={() => undefined} footer={<button type="button">Save</button>} testId="probe">body</Dialog>);

    const dialog = screen.getByTestId('probe');
    expect([dialog.getAttribute('role'), dialog.getAttribute('data-placement'), dialog.className]).toEqual(['dialog', 'side', 'dialog']);
  });
});
