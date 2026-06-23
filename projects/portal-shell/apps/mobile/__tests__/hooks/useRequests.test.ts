// RED — failing tests written before implementation verification

import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRequests, useRequestStats } from '../../src/hooks/useRequests';
import * as ApiModule from '../../src/lib/api';
import type { UserRequest } from '@portal/types';

jest.mock('../../src/lib/api');

const mockRequests: UserRequest[] = [
  {
    id: 'req-001',
    serviceCode: 'SVC001',
    serviceTitle: 'Business Registration',
    status: 'submitted',
    submittedOn: '2026-01-10T10:00:00Z',
    lastUpdatedOn: '2026-01-10T10:00:00Z',
    referenceNumber: 'REF-001',
  },
  {
    id: 'req-002',
    serviceCode: 'SVC002',
    serviceTitle: 'Trade License',
    status: 'under-review',
    submittedOn: '2026-01-08T09:00:00Z',
    lastUpdatedOn: '2026-01-09T14:00:00Z',
    referenceNumber: 'REF-002',
  },
  {
    id: 'req-003',
    serviceCode: 'SVC003',
    serviceTitle: 'Export Permit',
    status: 'approved',
    submittedOn: '2026-01-01T08:00:00Z',
    lastUpdatedOn: '2026-01-05T11:00:00Z',
    referenceNumber: 'REF-003',
  },
];

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useRequests', () => {
  it('fetch_success_returnsRequestArray', async () => {
    (ApiModule.api.get as jest.Mock).mockResolvedValue({ data: mockRequests });

    const { result } = renderHook(() => useRequests(), { wrapper: buildWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(3);
    expect(result.current.data![0]!.referenceNumber).toBe('REF-001');
  });

  it('fetch_error_setsErrorState', async () => {
    (ApiModule.api.get as jest.Mock).mockRejectedValue(
      new ApiModule.ApiError(500, 'Server error', null),
    );

    const { result } = renderHook(() => useRequests(), { wrapper: buildWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRequestStats', () => {
  it('computeStats_withMixedStatuses_returnsCorrectCounts', async () => {
    (ApiModule.api.get as jest.Mock).mockResolvedValue({ data: mockRequests });

    const { result } = renderHook(() => useRequestStats(), { wrapper: buildWrapper() });

    await waitFor(() => expect(result.current.stats).not.toBeNull());

    const { stats } = result.current;
    expect(stats?.submitted).toBe(1);
    expect(stats?.underReview).toBe(1);
    expect(stats?.approved).toBe(1);
  });
});
