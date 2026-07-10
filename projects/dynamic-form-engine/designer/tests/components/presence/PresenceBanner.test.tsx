import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PresenceBanner } from '@/components/presence/PresenceBanner';
import type { ActiveEditor } from '@/services/presence/EditLockService';

function makeEditor(displayName: string): ActiveEditor {
  return { userId: `user-${displayName}`, displayName, openedAt: new Date() };
}

function renderBanner(editors: ActiveEditor[]) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <PresenceBanner editors={editors} />
    </FluentProvider>
  );
}

describe('PresenceBanner', () => {
  it('renders_nothing_whenNoEditors', () => {
    renderBanner([]);
    // The banner renders null — the status role must not be present
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders_editorName_whenSingleEditorPresent', () => {
    renderBanner([makeEditor('Alice')]);
    // The name appears in both the title and body; getAllByText confirms it is rendered
    expect(screen.getAllByText(/alice/i).length).toBeGreaterThan(0);
  });

  it('renders_multipleNames_whenMultipleEditorsPresent', () => {
    renderBanner([makeEditor('Alice'), makeEditor('Bob')]);
    // The comma-joined list appears in the Text body element
    const bodySpan = screen.getAllByText(/alice, bob/i);
    expect(bodySpan.length).toBeGreaterThan(0);
  });

  it('hasAccessibleRole_status_forScreenReaders', () => {
    renderBanner([makeEditor('Alice')]);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
