// The form itself had no mark anywhere — tabs and sections carried qdb_icon_name, the form
// did not. FormMark renders whichever mark a maker configured, and nothing when neither is set.
//
// The URL guard is the load-bearing part: the value comes from a maker with designer access
// and lands in an <img src>, so anything that is not an absolute http(s) URL is dropped.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FormMark } from './FormMark';

vi.mock('./DynamicIcon', () => ({
  DynamicIcon: ({ iconName }: { iconName: string }) => <span data-testid="icon">{iconName}</span>,
}));

function renderMark(props: Partial<React.ComponentProps<typeof FormMark>> = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FormMark formTitle="Loan Application" {...props} />
    </FluentProvider>
  );
}

describe('FormMark', () => {
  // The assertion targets the provider's own element, not the render container — the
  // container always holds the FluentProvider wrapper regardless of what the mark renders.
  it('rendersNothing_whenNeitherIconNorImageIsSet', () => {
    const { container } = renderMark();

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('rendersTheIcon_whenOnlyAnIconIsSet', () => {
    renderMark({ iconName: 'DocumentBulletList' });

    expect(screen.getByTestId('icon')).toHaveTextContent('DocumentBulletList');
  });

  it('rendersTheImage_whenAnImageUrlIsSet', () => {
    renderMark({ imageUrl: 'https://example.com/logo.png' });

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  // A maker who supplies both has gone to the trouble of hosting a picture.
  it('prefersTheImage_overTheIcon', () => {
    renderMark({ imageUrl: 'https://example.com/logo.png', iconName: 'DocumentBulletList' });

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.queryByTestId('icon')).toBeNull();
  });

  it('namesTheImage_withTheFormTitle', () => {
    renderMark({ imageUrl: 'https://example.com/logo.png' });

    expect(screen.getByRole('img')).toHaveAccessibleName('Loan Application logo');
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:image/svg+xml;base64,PHN2Zy8+'],
    ['/relative/logo.png'],
    ['not a url at all'],
  ])('refusesToRender %s', unsafeUrl => {
    renderMark({ imageUrl: unsafeUrl });

    expect(screen.queryByRole('img')).toBeNull();
  });

  // A rejected URL must not swallow the icon — the form still gets the mark it can show.
  it('fallsBackToTheIcon_whenTheImageUrlIsRejected', () => {
    renderMark({ imageUrl: 'javascript:alert(1)', iconName: 'DocumentBulletList' });

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
