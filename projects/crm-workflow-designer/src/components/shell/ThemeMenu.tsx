import { useEffect, useRef } from 'react';
import { THEME_OPTIONS, type ThemeName } from '@/theme/ThemeProvider';

interface ThemeMenuProps {
  theme: ThemeName;
  onSelect: (theme: ThemeName) => void;
  onDismiss: () => void;
}

/**
 * The palette menu behind the header's theme button. Each option shows the
 * theme's own colours, because the names alone do not tell a maker what Glass
 * or Vibrant will look like.
 */
export function ThemeMenu({ theme, onSelect, onDismiss }: ThemeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onDismiss();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    // Deferred so the click that opened the menu does not immediately close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', closeOnOutsideClick));
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onDismiss]);

  return (
    <div className="theme-menu" ref={menuRef} role="menu" aria-label="Theme">
      <div className="tm-h">Theme</div>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.name}
          type="button"
          className="theme-opt"
          role="menuitemradio"
          aria-checked={theme === option.name}
          onClick={() => {
            onSelect(option.name);
            onDismiss();
          }}
        >
          <span className={`sw ${option.swatchClass}`} aria-hidden="true" />
          <span className="tm-txt">
            <span className="tm-name">{option.label}</span>
            <span className="tm-desc" style={{ display: 'block' }}>{option.description}</span>
          </span>
          <svg className="chk" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}
