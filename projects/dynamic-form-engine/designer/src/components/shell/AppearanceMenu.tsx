// The appearance picker, opened from the palette button in the app bar.
//
// Inline SVG rather than an icon package: the designer does not depend on
// @fluentui/react-icons directly, and these two marks are the whole need.

import React, { useEffect, useRef } from 'react';
import { APPEARANCE_OPTIONS } from '@qdb/shared';
import { useAppearance } from '@/theme/AppearanceProvider';

interface AppearanceMenuProps {
  onDismiss: () => void;
}

function CheckMark(): React.ReactElement {
  return (
    <svg className="chk" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AppearanceMenu({ onDismiss }: AppearanceMenuProps): React.ReactElement {
  const { appearance, setAppearance } = useAppearance();
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on Escape or on a click outside. The trigger stops propagation on its
  // own click, so opening the menu does not immediately close it again.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onDismiss();
    }
    function onPointerDown(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onDismiss]);

  return (
    <div className="theme-menu" ref={menuRef} role="menu" aria-label="Appearance">
      <div className="tm-h">Appearance</div>
      {APPEARANCE_OPTIONS.map((option) => (
        <button
          key={option.name}
          type="button"
          className="theme-opt"
          role="menuitemradio"
          aria-checked={option.name === appearance}
          // Named explicitly: the label and description sit in nested spans beside a
          // decorative swatch, and the computed name came out empty in the tree.
          aria-label={option.label}
          onClick={() => {
            setAppearance(option.name);
            onDismiss();
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
  );
}
