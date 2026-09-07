// The runtime header was fixed markup — title, description, and the language and appearance
// controls. A maker could not add a word to it, and there was no footer at all.
//
// The text is plain, not HTML: accepting markup would need a sanitiser the form side does not
// have, and a banner authored by anyone with designer access reaches every user of the form.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FormBand } from '@qdb/shared';
import { FormBandRegion } from './FormBandRegion';

function renderBand(band?: FormBand) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FormBandRegion band={band} landmark="banner" label="Loan Application header" />
    </FluentProvider>
  );
}

describe('FormBandRegion', () => {
  // Every form published before bands existed carries no band at all.
  it('rendersNothing_whenNoBandIsConfigured', () => {
    const { container } = renderBand(undefined);

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('rendersNothing_whenTheBandIsEmpty', () => {
    const { container } = renderBand({});

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('rendersTheText', () => {
    renderBand({ text: 'Applications close on 31 March.' });

    expect(screen.getByText('Applications close on 31 March.')).toBeInTheDocument();
  });

  it('rendersTheImage', () => {
    renderBand({ imageUrl: 'https://example.com/banner.png' });

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/banner.png');
  });

  it('rendersTextAndImageTogether', () => {
    renderBand({ text: 'Closing soon', imageUrl: 'https://example.com/banner.png' });

    expect(screen.getByText('Closing soon')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('namesTheLandmark_soItIsNotAnnouncedUnlabelled', () => {
    renderBand({ text: 'Closing soon' });

    expect(screen.getByRole('banner')).toHaveAccessibleName('Loan Application header');
  });

  // Markup in the stored value is content, not instructions — it must reach the page as text.
  it('doesNotInterpretMarkupInTheText', () => {
    renderBand({ text: '<b>bold</b> and <script>alert(1)</script>' });

    expect(screen.getByText('<b>bold</b> and <script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:image/svg+xml;base64,PHN2Zy8+'],
    ['/relative/banner.png'],
  ])('refusesToRenderTheImage %s', unsafeUrl => {
    renderBand({ imageUrl: unsafeUrl });

    expect(screen.queryByRole('img')).toBeNull();
  });

  // Losing the words because a third-party picture failed would be the worse outcome.
  it('keepsTheText_whenTheImageUrlIsRejected', () => {
    renderBand({ text: 'Closing soon', imageUrl: 'javascript:alert(1)' });

    expect(screen.getByText('Closing soon')).toBeInTheDocument();
  });
});
