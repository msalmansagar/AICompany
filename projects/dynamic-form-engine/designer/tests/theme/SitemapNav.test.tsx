// The sitemap must only offer destinations that mean something with nothing
// open. Most designer screens do not: the option set, lookup and field label
// editors need a selected field, and business rules, submission mapping and
// access policies need a loaded form. Offering one of those puts a dead end in
// the navigation, which is what this guards against.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesignerScreen } from '@/state/designerStore';
import { SitemapNav } from '@/components/shell/SitemapNav';

/** Screens that open onto something real without a form or field selected. */
const SELF_CONTAINED_SCREENS: readonly DesignerScreen[] = [
  'form-list',
  'rule-template-editor',
  'theme-editor',
];

function renderNav(currentScreen: DesignerScreen = 'form-list') {
  const onNavigate = vi.fn();
  render(<SitemapNav currentScreen={currentScreen} onNavigate={onNavigate} isCollapsed={false} />);
  return onNavigate;
}

describe('SitemapNav', () => {
  it('offers_only_screens_that_stand_on_their_own', async () => {
    const onNavigate = renderNav();

    for (const item of screen.getAllByRole('button')) {
      onNavigate.mockClear();
      await userEvent.click(item);
      expect(SELF_CONTAINED_SCREENS).toContain(onNavigate.mock.calls[0][0]);
    }
  });

  it('offers_every_self_contained_screen', async () => {
    const onNavigate = renderNav();

    const offered = new Set<DesignerScreen>();
    for (const item of screen.getAllByRole('button')) {
      onNavigate.mockClear();
      await userEvent.click(item);
      offered.add(onNavigate.mock.calls[0][0]);
    }

    expect([...offered].sort()).toEqual([...SELF_CONTAINED_SCREENS].sort());
  });

  it('marks_the_current_screen_for_assistive_technology', () => {
    renderNav('theme-editor');

    expect(screen.getByRole('button', { name: 'Themes & Styles' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'All Forms' })).not.toHaveAttribute('aria-current');
  });

  it('keeps_its_labels_reachable_when_collapsed', () => {
    // Collapsed, the label is visually hidden and only the icon remains, so the
    // title is what a pointer user and a screen reader are left with.
    render(<SitemapNav currentScreen="form-list" onNavigate={vi.fn()} isCollapsed />);

    expect(screen.getByRole('button', { name: 'All Forms' })).toHaveAttribute('title', 'All Forms');
  });
});
