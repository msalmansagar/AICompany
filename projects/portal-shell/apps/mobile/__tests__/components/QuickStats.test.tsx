// RED — failing tests written before implementation verification

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QuickStats } from '../../src/components/dashboard/QuickStats';
import type { RequestStats } from '../../src/hooks/useRequests';

jest.mock('../../src/i18n', () => ({
  t: (key: string) => key,
}));

const mockStats: RequestStats = {
  submitted: 5,
  underReview: 3,
  approved: 10,
};

describe('QuickStats', () => {
  it('renders_withStats_showsAllThreeCounts', () => {
    render(<QuickStats stats={mockStats} isLoading={false} testID="quick-stats" />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('renders_loading_showsSkeletons', () => {
    render(<QuickStats stats={null} isLoading testID="quick-stats" />);
    // Skeletons show as progressbar roles
    const skeletons = screen.getAllByRole('progressbar');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders_nullStats_showsSkeletons', () => {
    render(<QuickStats stats={null} isLoading={false} testID="quick-stats" />);
    const skeletons = screen.getAllByRole('progressbar');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });
});
