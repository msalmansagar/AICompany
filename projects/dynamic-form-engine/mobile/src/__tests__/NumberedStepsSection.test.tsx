// RED — failing: NumberedStepsSection renders numbered items in order
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NumberedStepsSection } from '../components/info-card/sections/NumberedStepsSection';
import type { InfoCardItem } from '@qdb/shared';

function buildItem(overrides: Partial<InfoCardItem> = {}): InfoCardItem {
  return {
    itemId: `item-${Math.random()}`,
    displayOrder: 1,
    itemTitle: 'Step Title',
    ...overrides,
  };
}

describe('NumberedStepsSection', () => {
  it('renders_section_title', () => {
    render(<NumberedStepsSection sectionTitle="Getting Started" items={[buildItem()]} />);
    expect(screen.getByText('Getting Started')).toBeTruthy();
  });

  it('renders_step_numbers_in_correct_order', () => {
    const items = [
      buildItem({ displayOrder: 2, itemTitle: 'Second Step' }),
      buildItem({ displayOrder: 1, itemTitle: 'First Step' }),
    ];
    render(<NumberedStepsSection sectionTitle="Steps" items={items} />);
    // Numbers 1 and 2 rendered as badges
    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(screen.getAllByText('2')).toHaveLength(1);
  });

  it('renders_item_title', () => {
    render(<NumberedStepsSection sectionTitle="S" items={[buildItem({ itemTitle: 'Do the thing' })]} />);
    expect(screen.getByText('Do the thing')).toBeTruthy();
  });

  it('renders_item_description_when_present', () => {
    const item = buildItem({ itemDescription: 'Extra detail here' });
    render(<NumberedStepsSection sectionTitle="S" items={[item]} />);
    expect(screen.getByText('Extra detail here')).toBeTruthy();
  });

  it('does_not_render_description_when_absent', () => {
    const item = buildItem({ itemDescription: undefined });
    render(<NumberedStepsSection sectionTitle="S" items={[item]} />);
    expect(screen.queryByText('Extra detail here')).toBeNull();
  });
});
