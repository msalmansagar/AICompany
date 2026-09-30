// Every place that stores an attribute logical name used to be a bare text box — a typo
// passed validation and failed silently at runtime. The picker offers what the entity
// actually has; these tests pin the loading behaviour around it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('AttributeCombobox type filter', () => {
  beforeEach(() => {
    clearAttributeCache();
    getAttributes.mockReset();
    getAttributes.mockResolvedValue([
      { logicalName: 'industrycode', displayName: 'Industry', attributeType: 'Picklist' },
      { logicalName: 'parentaccountid', displayName: 'Parent Account', attributeType: 'Lookup' },
    ]);
  });

  it('AttributeCombobox_PicklistOnlyFilter_HidesLookupAttribute', async () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <AttributeCombobox entityLogicalName="account" value="" onChange={() => {}} ariaLabel="Related column" attributeTypes={['Picklist']} />
      </FluentProvider>,
    );
    await waitFor(() => expect(getAttributes).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('combobox', { name: 'Related column' }));

    await waitFor(() => expect(screen.getByText('industrycode')).toBeInTheDocument());
    expect(screen.queryByText('parentaccountid')).toBeNull();
  });
});
