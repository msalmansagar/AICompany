// RED — failing: DownloadListSection renders download buttons and note text
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { DownloadListSection } from '../components/info-card/sections/DownloadListSection';
import type { InfoCardItem } from '@qdb/shared';

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

function buildItem(overrides: Partial<InfoCardItem> = {}): InfoCardItem {
  return {
    itemId: `item-${Math.random()}`,
    displayOrder: 1,
    itemTitle: 'Document A',
    downloadUrl: 'https://example.com/doc.pdf',
    ...overrides,
  };
}

describe('DownloadListSection', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders_section_title', () => {
    render(<DownloadListSection sectionTitle="Resources" items={[buildItem()]} />);
    expect(screen.getByText('Resources')).toBeTruthy();
  });

  it('renders_item_title', () => {
    render(<DownloadListSection sectionTitle="S" items={[buildItem({ itemTitle: 'Policy Doc' })]} />);
    expect(screen.getByText('Policy Doc')).toBeTruthy();
  });

  it('renders_download_button_for_item_with_url', () => {
    render(<DownloadListSection sectionTitle="S" items={[buildItem()]} />);
    expect(screen.getByLabelText('Download Document A')).toBeTruthy();
  });

  it('does_not_render_download_button_when_no_url', () => {
    render(
      <DownloadListSection sectionTitle="S" items={[buildItem({ downloadUrl: undefined })]} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls_Linking_openURL_when_download_pressed', async () => {
    render(
      <DownloadListSection sectionTitle="S" items={[buildItem({ downloadUrl: 'https://x.com/f.pdf' })]} />,
    );
    fireEvent.press(screen.getByLabelText('Download Document A'));
    // openURL is called async
    await Promise.resolve();
    expect(Linking.openURL).toHaveBeenCalledWith('https://x.com/f.pdf');
  });

  it('renders_noteText_when_provided', () => {
    render(
      <DownloadListSection
        sectionTitle="S"
        items={[buildItem()]}
        noteText="Note: files expire after 30 days"
      />,
    );
    expect(screen.getByText('Note: files expire after 30 days')).toBeTruthy();
  });

  it('does_not_render_noteText_when_absent', () => {
    render(<DownloadListSection sectionTitle="S" items={[buildItem()]} />);
    expect(screen.queryByText(/Note:/)).toBeNull();
  });
});
