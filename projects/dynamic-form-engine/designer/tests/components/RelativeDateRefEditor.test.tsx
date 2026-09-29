// DFE-RULES-002: a maker composes "ten years from the end of this month"; the rule stores
// the token the runtime resolves. These tests pin the composition in both directions.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RelativeDateRefEditor, readRelativeDateRef } from '@/designer/properties/panels/RelativeDateRefEditor';

function renderEditor(value: string) {
  const onChange = vi.fn();
  render(
    <FluentProvider theme={webLightTheme}>
      <RelativeDateRefEditor value={value} onChange={onChange} />
    </FluentProvider>,
  );
  return onChange;
}

describe('RelativeDateRefEditor', () => {
  it('showsTheParts_ofAnExistingToken', () => {
    renderEditor('@monthEnd+10y');

    expect(screen.getByLabelText('Relative to')).toHaveValue('monthEnd');
    expect(screen.getByLabelText('Offset')).toHaveValue(10);
    expect(screen.getByLabelText('Offset unit')).toHaveValue('y');
  });

  it('emitsTheToken_whenTheAnchorChanges', () => {
    const onChange = renderEditor('@today');

    fireEvent.change(screen.getByLabelText('Relative to'), { target: { value: 'monthStart' } });

    expect(onChange).toHaveBeenCalledWith('@monthStart');
  });

  it('emitsTheToken_whenTheOffsetChanges', () => {
    const onChange = renderEditor('@monthEnd+1y');

    fireEvent.change(screen.getByLabelText('Offset'), { target: { value: '10' } });

    expect(onChange).toHaveBeenCalledWith('@monthEnd+10y');
  });

  it('emitsANegativeOffset', () => {
    const onChange = renderEditor('@today+18y');

    fireEvent.change(screen.getByLabelText('Offset'), { target: { value: '-18' } });

    expect(onChange).toHaveBeenCalledWith('@today-18y');
  });

  it('fallsBackToToday_forATokenItDoesNotDefine', () => {
    expect(readRelativeDateRef('@someday')).toEqual({ anchor: 'today', offset: 0, unit: 'd' });
  });
});
