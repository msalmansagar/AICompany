// RED — failing until DesignContext is implemented
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React, { useContext } from 'react';
import { DesignContext, DEFAULT_DESIGN_PAYLOAD, useDesignContext } from './DesignContext';

function DesignConsumer() {
  const design = useDesignContext();

  return (
    <div>
      <span data-testid="theme-code">{design.theme.themeCode}</span>
      <span data-testid="layout-type">{design.formDesign.layoutType}</span>
    </div>
  );
}

describe('DesignContext', () => {
  it('provides_defaultPayload_whenNoProviderWraps', () => {
    render(<DesignConsumer />);

    expect(screen.getByTestId('theme-code').textContent).toBe(
      DEFAULT_DESIGN_PAYLOAD.theme.themeCode,
    );
  });

  it('provides_customPayload_whenProviderWraps', () => {
    const customPayload = {
      ...DEFAULT_DESIGN_PAYLOAD,
      theme: {
        ...DEFAULT_DESIGN_PAYLOAD.theme,
        themeCode: 'corporate-qdb',
      },
    };

    render(
      <DesignContext.Provider value={customPayload}>
        <DesignConsumer />
      </DesignContext.Provider>,
    );

    expect(screen.getByTestId('theme-code').textContent).toBe('corporate-qdb');
  });

  it('provides_defaultLayoutType_fromDefaultPayload', () => {
    render(<DesignConsumer />);

    expect(screen.getByTestId('layout-type').textContent).toBe('SingleColumn');
  });
});

describe('useDesignContext', () => {
  it('returns_contextValue_fromNearestProvider', () => {
    let capturedValue: ReturnType<typeof useDesignContext> | null = null;

    function Capturer() {
      capturedValue = useDesignContext();
      return null;
    }

    render(
      <DesignContext.Provider value={DEFAULT_DESIGN_PAYLOAD}>
        <Capturer />
      </DesignContext.Provider>,
    );

    expect(capturedValue).toBe(DEFAULT_DESIGN_PAYLOAD);
  });
});
