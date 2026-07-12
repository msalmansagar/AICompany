// RED → GREEN: FormDiffViewer component tests.
//
// TDD mandate (DFE-ENH-001 Workstream H). These tests were written against the
// expected public API before the component was implemented.
//
// Vitest + React Testing Library + jsdom (environment configured in vite.config.ts).
// FluentProvider wrapper is required by Fluent UI v9 components.
// Test names follow MethodName_Scenario_ExpectedResult convention.
//
// Coverage:
//   - empty state when objects are identical
//   - accordion sections rendered per change area
//   - change count badge per area
//   - CREATE / REMOVE / UPDATE badge labels
//   - before/after value display
//   - custom labelResolver invoked and result rendered
//   - no "Before:" label for CREATE
//   - no "After:" label for REMOVE

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FormDiffViewer } from '@/components/FormDiffViewer';
import type { ReactNode } from 'react';

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function WithFluent({ children }: { children: ReactNode }) {
  return <FluentProvider theme={webLightTheme}>{children}</FluentProvider>;
}

function renderDiffViewer(before: object, after: object, labelResolver?: (path: string[]) => string) {
  return render(
    <WithFluent>
      <FormDiffViewer before={before} after={after} labelResolver={labelResolver} />
    </WithFluent>,
  );
}

// ─── Identical snapshots ──────────────────────────────────────────────────────

describe('FormDiffViewer — identical objects', () => {
  it('FormDiffViewer_IdenticalObjects_RendersEmptyStateMessage', () => {
    const snapshot = { name: 'Loan Form', version: 1 };

    renderDiffViewer(snapshot, snapshot);

    expect(screen.getByText('No changes detected between the two versions.')).toBeInTheDocument();
  });
});

// ─── Accordion structure ──────────────────────────────────────────────────────

describe('FormDiffViewer — accordion grouping', () => {
  it('FormDiffViewer_TwoChangedTopLevelKeys_RendersTwoAccordionSections', () => {
    const before = { name: 'Form A', status: 'draft' };
    const after  = { name: 'Form B', status: 'published' };

    renderDiffViewer(before, after);

    // The area label appears at minimum in the accordion header.
    // getAllByText handles duplicates when the label also appears in change-row text.
    expect(screen.getAllByText('name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('status').length).toBeGreaterThan(0);
  });

  it('FormDiffViewer_TwoChangesInOneArea_RendersCountBadgeWithTwo', () => {
    const before = { fields: { f1: { label: 'A' }, f2: { label: 'B' } } };
    const after  = { fields: { f1: { label: 'X' }, f2: { label: 'Y' } } };

    renderDiffViewer(before, after);

    // Two changes, both under the 'fields' area → count badge should show 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

// ─── Badge rendering ──────────────────────────────────────────────────────────

describe('FormDiffViewer — change kind badges', () => {
  it('FormDiffViewer_CreateChange_RendersPlusBadge', () => {
    const before = { name: 'Loan Form' };
    const after  = { name: 'Loan Form', description: 'New field' };

    renderDiffViewer(before, after);

    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('FormDiffViewer_RemoveChange_RendersMinusBadge', () => {
    const before = { name: 'Loan Form', description: 'Old field' };
    const after  = { name: 'Loan Form' };

    renderDiffViewer(before, after);

    expect(screen.getByText('−')).toBeInTheDocument();
  });

  it('FormDiffViewer_UpdateChange_RendersTildeBadge', () => {
    const before = { status: 'draft' };
    const after  = { status: 'published' };

    renderDiffViewer(before, after);

    expect(screen.getByText('~')).toBeInTheDocument();
  });
});

// ─── Before / after values ────────────────────────────────────────────────────

describe('FormDiffViewer — value display', () => {
  it('FormDiffViewer_UpdateChange_RendersBothBeforeAndAfterValues', () => {
    const before = { status: 'draft' };
    const after  = { status: 'published' };

    renderDiffViewer(before, after);

    expect(screen.getByText(/Before:.*"draft"/)).toBeInTheDocument();
    expect(screen.getByText(/After:.*"published"/)).toBeInTheDocument();
  });

  it('FormDiffViewer_CreateChange_OmitsBeforeValue', () => {
    const before = {};
    const after  = { theme: 'light' };

    renderDiffViewer(before, after);

    expect(screen.queryByText(/Before:/)).not.toBeInTheDocument();
    expect(screen.getByText(/After:/)).toBeInTheDocument();
  });

  it('FormDiffViewer_RemoveChange_OmitsAfterValue', () => {
    const before = { theme: 'light' };
    const after  = {};

    renderDiffViewer(before, after);

    expect(screen.getByText(/Before:/)).toBeInTheDocument();
    expect(screen.queryByText(/After:/)).not.toBeInTheDocument();
  });
});

// ─── Label resolver ───────────────────────────────────────────────────────────

describe('FormDiffViewer — labelResolver', () => {
  it('FormDiffViewer_WithLabelResolver_CallsResolverAndRendersResult', () => {
    const labelResolver = vi.fn((path: string[]) => `Custom: ${path.join('.')}`);
    const before = { status: 'draft' };
    const after  = { status: 'published' };

    renderDiffViewer(before, after, labelResolver);

    expect(labelResolver).toHaveBeenCalledWith(['status']);
    expect(screen.getByText('Custom: status')).toBeInTheDocument();
  });

  it('FormDiffViewer_WithoutLabelResolver_UsesDefaultPathJoin', () => {
    const before = { fields: { label: 'Name' } };
    const after  = { fields: { label: 'Full Name' } };

    renderDiffViewer(before, after);

    // Default label joins path segments with " → " (U+2192 arrow)
    expect(screen.getByText('fields → label')).toBeInTheDocument();
  });
});
