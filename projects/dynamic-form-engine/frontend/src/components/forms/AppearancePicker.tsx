// The appearance picker in the form header.
//
// Replaces the light/dark toggle this sat in: the design system offers four
// appearances rather than two, and a binary switch cannot express Glass or
// Vibrant. Light and Dark are still the first two choices, so nothing that was
// reachable before has been taken away.

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@fluentui/react-components';
import { PaintBrushRegular } from '@fluentui/react-icons';
import { APPEARANCE_OPTIONS } from '@qdb/shared';
import { useAppearance } from '../../theme/AppearanceProvider';

function CheckMark(): React.ReactElement {
  return (
    <svg className="chk" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AppearancePicker(): React.ReactElement {
  const { appearance, setAppearance } = useAppearance();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false);
    }
    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <Button
        appearance="subtle"
        icon={<PaintBrushRegular />}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Change appearance"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Change appearance"
      />
      {isOpen && (
        <div className="theme-menu" role="menu" aria-label="Appearance">
          <div className="tm-h">Appearance</div>
          {APPEARANCE_OPTIONS.map((option) => (
            <button
              key={option.name}
              type="button"
              className="theme-opt"
              role="menuitemradio"
              aria-checked={option.name === appearance}
              // Named explicitly: the label sits in nested spans beside a
              // decorative swatch, and the computed name comes out empty.
              aria-label={option.label}
              onClick={() => {
                setAppearance(option.name);
                setIsOpen(false);
              }}
            >
              <span className={`sw ${option.swatchClass}`} />
              <span className="tm-txt">
                <span className="tm-name">{option.label}</span>
                <span className="tm-desc">{option.description}</span>
              </span>
              <CheckMark />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
