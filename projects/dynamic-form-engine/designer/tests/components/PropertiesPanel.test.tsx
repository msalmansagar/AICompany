// The properties rail used to occupy a fixed 320px of the work area at all times, showing
// "Select an element on the canvas…" whenever nothing was selected. It now yields that space
// back to the canvas instead of spending it on a message.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PropertiesPanel } from '@/designer/properties/PropertiesPanel';

interface MockState {
  selectedId: string | null;
  selectedType: string | null;
  [key: string]: unknown;
}

let mockState: MockState;

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (state: MockState) => unknown) => selector(mockState)),
}));

// The per-type panels have their own store dependencies and are covered by their own tests.
vi.mock('@/designer/properties/FormProperties', () => ({ FormProperties: () => <div>form panel</div> }));
vi.mock('@/designer/properties/TabProperties', () => ({ TabProperties: () => <div>tab panel</div> }));
vi.mock('@/designer/properties/SectionProperties', () => ({ SectionProperties: () => <div>section panel</div> }));
vi.mock('@/designer/properties/FieldProperties', () => ({ FieldProperties: () => <div>field panel</div> }));

function renderPanel() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <PropertiesPanel />
    </FluentProvider>,
  );
}

beforeEach(() => {
  mockState = { selectedId: null, selectedType: null };
});

describe('PropertiesPanel — nothing selected', () => {
  it('rendersNothing', () => {
    const { container } = renderPanel();

    expect(container.querySelector('[aria-label="Properties Panel"]')).toBeNull();
  });

  it('doesNotShowTheOldEmptyStateMessage', () => {
    renderPanel();

    expect(screen.queryByText(/Select an element on the canvas/i)).toBeNull();
  });
});

describe('PropertiesPanel — something selected', () => {
  it('showsTheRail_whenAFieldIsSelected', () => {
    mockState = { selectedId: 'field-1', selectedType: 'field' };

    const { container } = renderPanel();

    expect(container.querySelector('[aria-label="Properties Panel"]')).not.toBeNull();
    expect(screen.getByText('field panel')).toBeTruthy();
  });

  it('showsTheTabPanel_whenATabIsSelected', () => {
    mockState = { selectedId: 'tab-1', selectedType: 'tab' };

    renderPanel();

    expect(screen.getByText('Tab Properties')).toBeTruthy();
    expect(screen.getByText('tab panel')).toBeTruthy();
  });

  // The rail carries its own width now, so the screen does not reserve space for it.
  it('ownsItsOwnWidth_soTheScreenNeedNotReserveSpace', () => {
    mockState = { selectedId: 'tab-1', selectedType: 'tab' };

    const { container } = renderPanel();
    const rail = container.querySelector('[aria-label="Properties Panel"]') as HTMLElement;

    expect(rail.className).toBeTruthy();
    expect(rail.tagName.toLowerCase()).toBe('aside');
  });
});
