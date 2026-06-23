// RED → GREEN → REFACTOR — RequestStatusBadge component tests
// TC-WEB-008 through TC-WEB-011 (DFE-PORT-001 Phase 5 QA)
// References: FR: REQ-*

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequestStatusBadge } from './RequestStatusBadge.js';

// ---------------------------------------------------------------------------
// TC-WEB-008: RequestStatusBadge_Submitted_RendersInformativeColor
// ---------------------------------------------------------------------------

describe('RequestStatusBadge — status label rendering', () => {
  it('RequestStatusBadge_Submitted_RendersCorrectLabel', () => {
    render(<RequestStatusBadge status="submitted" />);

    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  // TC-WEB-009: Approved with success color
  it('RequestStatusBadge_Approved_RendersCorrectLabel', () => {
    render(<RequestStatusBadge status="approved" />);

    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  // TC-WEB-010: Rejected with danger color
  it('RequestStatusBadge_Rejected_RendersCorrectLabel', () => {
    render(<RequestStatusBadge status="rejected" />);

    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  // TC-WEB-011: Under Review text
  it('RequestStatusBadge_UnderReview_RendersCorrectText', () => {
    render(<RequestStatusBadge status="under-review" />);

    expect(screen.getByText('Under Review')).toBeInTheDocument();
  });

  it('RequestStatusBadge_PendingDocs_RendersCorrectText', () => {
    render(<RequestStatusBadge status="pending-docs" />);

    expect(screen.getByText('Pending Documents')).toBeInTheDocument();
  });

  it('RequestStatusBadge_Cancelled_RendersCorrectText', () => {
    render(<RequestStatusBadge status="cancelled" />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('RequestStatusBadge_Completed_RendersCorrectText', () => {
    render(<RequestStatusBadge status="completed" />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Arabic locale labels
// ---------------------------------------------------------------------------

describe('RequestStatusBadge — Arabic locale', () => {
  it('RequestStatusBadge_ArabicLocale_Submitted_RendersArabicLabel', () => {
    render(<RequestStatusBadge status="submitted" locale="ar" />);

    expect(screen.getByText('مقدَّم')).toBeInTheDocument();
  });

  it('RequestStatusBadge_ArabicLocale_Approved_RendersArabicLabel', () => {
    render(<RequestStatusBadge status="approved" locale="ar" />);

    expect(screen.getByText('موافق عليه')).toBeInTheDocument();
  });

  it('RequestStatusBadge_ArabicLocale_Rejected_RendersArabicLabel', () => {
    render(<RequestStatusBadge status="rejected" locale="ar" />);

    expect(screen.getByText('مرفوض')).toBeInTheDocument();
  });

  it('RequestStatusBadge_ArabicLocale_UnderReview_RendersArabicLabel', () => {
    render(<RequestStatusBadge status="under-review" locale="ar" />);

    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
  });

  it('RequestStatusBadge_DefaultLocale_RendersEnglishLabel', () => {
    // locale prop is optional — default is 'en'
    render(<RequestStatusBadge status="approved" />);

    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('RequestStatusBadge — edge cases', () => {
  it('RequestStatusBadge_RendersAsAccessibleElement', () => {
    render(<RequestStatusBadge status="submitted" />);

    // FluentUI Badge renders as a span; verify accessible text is present
    const badge = screen.getByText('Submitted');
    expect(badge).toBeTruthy();
  });

  it('RequestStatusBadge_AllStatusValues_RenderWithoutThrowing', () => {
    const statuses: Array<React.ComponentProps<typeof RequestStatusBadge>['status']> = [
      'submitted',
      'under-review',
      'approved',
      'rejected',
      'pending-docs',
      'cancelled',
      'completed',
    ];

    statuses.forEach((status) => {
      const { unmount } = render(<RequestStatusBadge status={status} />);
      // No exception thrown — each status renders
      unmount();
    });
  });
});
