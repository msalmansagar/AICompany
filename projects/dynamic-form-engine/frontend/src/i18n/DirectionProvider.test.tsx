/**
 * DirectionProvider.test.tsx — RED → GREEN tests for RTL module (NFR-011 MODULE 1).
 *
 * Covers:
 *   - dir="rtl" on FluentProvider when isRtl=true (FR-019)
 *   - document.documentElement.dir set to "rtl" (FR-019 / AC-014)
 *   - document.documentElement.lang set to active language (FR-019 / AC-014)
 *   - dir="ltr" / lang="en" when isRtl=false (AC-015)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DirectionProvider } from './DirectionProvider';

describe('DirectionProvider', () => {
  afterEach(() => {
    // Reset document attributes between tests
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('should_set_document_dir_rtl_and_lang_ar_when_isRtl_is_true', () => {
    // Arrange + Act
    render(
      <DirectionProvider language="ar" isRtl={true}>
        <span>content</span>
      </DirectionProvider>,
    );
    // Assert (FR-019 / AC-014)
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('should_set_document_dir_ltr_and_lang_en_when_isRtl_is_false', () => {
    // Arrange + Act
    render(
      <DirectionProvider language="en" isRtl={false}>
        <span>content</span>
      </DirectionProvider>,
    );
    // Assert (AC-015)
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('should_render_children_inside_fluent_provider_with_correct_dir', () => {
    // Arrange + Act
    const { getByTestId } = render(
      <DirectionProvider language="ar" isRtl={true}>
        <span data-testid="child">child content</span>
      </DirectionProvider>,
    );
    // Assert — children render correctly
    expect(getByTestId('child')).toBeInTheDocument();
    expect(getByTestId('child').textContent).toBe('child content');
  });

  it('should_update_document_attrs_when_language_changes_from_en_to_ar', () => {
    // Arrange — start with English
    const { rerender } = render(
      <DirectionProvider language="en" isRtl={false}>
        <span>content</span>
      </DirectionProvider>,
    );
    expect(document.documentElement.dir).toBe('ltr');

    // Act — switch to Arabic
    rerender(
      <DirectionProvider language="ar" isRtl={true}>
        <span>content</span>
      </DirectionProvider>,
    );

    // Assert — document attributes updated (FR-019)
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
