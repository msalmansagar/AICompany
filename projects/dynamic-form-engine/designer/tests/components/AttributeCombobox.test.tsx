// Every place that stores an attribute logical name used to be a bare text box — a typo
// passed validation and failed silently at runtime. The picker offers what the entity
// actually has; these tests pin the loading behaviour around it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

const getAttributes = vi.fn();

vi.mock('@/app/App', () => ({ CrmContext: React.createContext<unknown>({ stub: true }) }));
vi.mock('@/services/MetadataService', () => ({
  MetadataService: class { getAttributes = getAttributes; },
}));

import { AttributeCombobox, clearAttributeCache } from '@/components/AttributeCombobox';

function renderPicker(entity: string) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <AttributeCombobox entityLogicalName={entity} value="" onChange={() => {}} ariaLabel="CRM Attribute" />
    </FluentProvider>,
  );
}

beforeEach(() => {
  clearAttributeCache();
  getAttributes.mockReset();
  getAttributes.mockResolvedValue([
    { logicalName: 'qdb_full_name', displayName: 'Full Name', attributeType: 'String' },
  ]);
});

describe('AttributeCombobox', () => {
  it('asksForTheEntitysAttributes', async () => {
    renderPicker('account');

    await waitFor(() => expect(getAttributes).toHaveBeenCalledWith('account'));
  });

  // A grid can hold ten columns, each with its own picker for the same entity. Ten identical
  // metadata requests is the cost that gets a picker reverted to a text box.
  it('sharesOneRequestAcrossPickersForTheSameEntity', async () => {
    renderPicker('account');
    renderPicker('account');
    renderPicker('account');

    await waitFor(() => expect(getAttributes).toHaveBeenCalledTimes(1));
  });

  it('loadsSeparatelyPerEntity', async () => {
    renderPicker('account');
    renderPicker('contact');

    await waitFor(() => expect(getAttributes).toHaveBeenCalledTimes(2));
    expect(getAttributes).toHaveBeenCalledWith('contact');
  });

  // A failure cached forever would leave the picker permanently empty after one blip.
  it('retriesAfterAFailedLoad', async () => {
    getAttributes.mockRejectedValueOnce(new Error('metadata down'));

    renderPicker('account');
    await waitFor(() => expect(getAttributes).toHaveBeenCalledTimes(1));

    renderPicker('account');
    await waitFor(() => expect(getAttributes).toHaveBeenCalledTimes(2));
  });

  it('isDisabledUntilAnEntityIsChosen_andSaysSo', () => {
    renderPicker('');

    const input = screen.getByRole('combobox', { name: 'CRM Attribute' });
    expect(input.hasAttribute('disabled')).toBe(true);
    expect(input.getAttribute('placeholder')).toMatch(/target entity first/i);
    expect(getAttributes).not.toHaveBeenCalled();
  });
});
