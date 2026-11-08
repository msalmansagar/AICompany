// DFE-RULES-002 item 7: a maker chooses how an option field draws — list, cards or stars.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

const mockUpdateField = vi.fn();
const mockState = { navigateTo: vi.fn(), selectItem: vi.fn(), updateField: mockUpdateField };

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

import { DropdownFieldPanel } from '@/designer/properties/panels/DropdownFieldPanel';

function renderPanel(fieldType: string, radioRenderStyle: DesignerFieldModel['radioRenderStyle'] = null) {
  const field = { id: 'f1', fieldType, options: [], radioRenderStyle } as unknown as DesignerFieldModel;
  render(
    <FluentProvider theme={webLightTheme}>
      <DropdownFieldPanel field={field} />
    </FluentProvider>,
  );
}

function styleChoices(): Array<string | null> {
  return Array.from(screen.getByLabelText('Display style').querySelectorAll('option')).map(o => o.textContent);
}

describe('DropdownFieldPanel display style', () => {
  beforeEach(() => mockUpdateField.mockReset());

  it('offersDropdownOrRating_forADropdown', () => {
    renderPanel('dropdown');

    expect(styleChoices()).toEqual(['Dropdown', 'Rating (stars)']);
  });

  it('offersListCardsOrRating_forARadio', () => {
    renderPanel('radio');

    expect(styleChoices()).toEqual(['List', 'Cards', 'Rating (stars)']);
  });

  it('offersNoStyle_forAMultiSelect', () => {
    renderPanel('multi_select');

    expect(screen.queryByLabelText('Display style')).toBeNull();
  });

  it('savesRating_whenChosen', () => {
    renderPanel('dropdown');

    fireEvent.change(screen.getByLabelText('Display style'), { target: { value: 'rating' } });

    expect(mockUpdateField).toHaveBeenCalledWith('f1', { radioRenderStyle: 'rating' });
  });

  it('showsTheSavedStyle', () => {
    renderPanel('radio', 'cards');

    expect(screen.getByLabelText('Display style')).toHaveValue('cards');
  });
});
