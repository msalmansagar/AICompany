// The properties panel was a single column of every section a selection could have, so
// reaching type configuration — the grid column editor above all — meant scrolling past
// identity, placement, display and behaviour, and the editor then had only the leftover
// height to work in.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PropertyTabs } from '@/designer/properties/PropertyTabs';

function renderTabs(tabs: Parameters<typeof PropertyTabs>[0]['tabs']) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <PropertyTabs tabs={tabs} />
    </FluentProvider>,
  );
}

const GENERAL = { id: 'general', label: 'General', content: <div>identity fields</div> };
const CONFIG = { id: 'config', label: 'Config', content: <div>grid columns</div> };

describe('PropertyTabs', () => {
  it('showsATabPerGroup', () => {
    renderTabs([GENERAL, CONFIG]);

    expect(screen.getByRole('tab', { name: 'General' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Config' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('opensOnTheFirstGroup', () => {
    renderTabs([GENERAL, CONFIG]);

    expect(screen.getByText('identity fields')).toBeTruthy();
    expect(screen.queryByText('grid columns')).toBeNull();
  });

  it('showsAGroupWhenItsTabIsChosen', async () => {
    renderTabs([GENERAL, CONFIG]);

    await userEvent.click(screen.getByRole('tab', { name: 'Config' }));

    expect(screen.getByText('grid columns')).toBeTruthy();
  });

  // A text field has no type configuration and a display-only field takes no validation.
  // An empty tab invites a click that shows nothing.
  it('dropsAGroupWithNoContent', () => {
    renderTabs([
      GENERAL,
      { id: 'config', label: 'Config', content: null },
      { id: 'advanced', label: 'Advanced', content: <div>mapping</div> },
    ]);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: 'Config' })).toBeNull();
  });

  // A lone tab is decoration: it names the panel a second time and costs vertical space.
  it('drawsNoStripWhenOnlyOneGroupSurvives', () => {
    renderTabs([GENERAL, { id: 'config', label: 'Config', content: null }]);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('identity fields')).toBeTruthy();
  });

  it('rendersNothingWhenEveryGroupIsEmpty', () => {
    const { container } = renderTabs([{ id: 'general', label: 'General', content: null }]);

    expect(container.textContent).toBe('');
  });

  // The selection changes under the panel — moving from a lookup to a text field removes the
  // configuration group — and the remembered tab may no longer exist.
  it('fallsBackToTheFirstGroup_whenTheChosenOneDisappears', () => {
    const { rerender } = renderTabs([GENERAL, CONFIG]);

    rerender(
      <FluentProvider theme={webLightTheme}>
        <PropertyTabs tabs={[GENERAL, { id: 'config', label: 'Config', content: null }]} />
      </FluentProvider>,
    );

    expect(screen.getByText('identity fields')).toBeTruthy();
  });
});
