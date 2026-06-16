// RED — failing tests written before implementation verification

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '../../src/components/requests/StatusBadge';
import type { RequestStatus } from '@portal/types';

// Mock i18n so tests run without locale setup
jest.mock('../../src/i18n', () => ({
  t: (key: string) => key,
  getCurrentLocale: () => 'en',
  isCurrentLocaleRtl: () => false,
}));

describe('StatusBadge', () => {
  const statusCases: RequestStatus[] = [
    'submitted',
    'under-review',
    'approved',
    'rejected',
    'pending-docs',
  ];

  statusCases.forEach((status) => {
    it(`renders_${status}_withTranslationKey`, () => {
      render(<StatusBadge status={status} testID={`badge-${status}`} />);
      // The mocked t() returns the key — verify the right key is used
      expect(screen.getByTestId(`badge-${status}`)).toBeTruthy();
      expect(screen.getByText(`requests.status.${status}`)).toBeTruthy();
    });
  });
});
