import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ToolbarIcon } from './ToolbarIcons';
import type { ToolbarIconName } from './ToolbarIcons';

/**
 * One command in a toolbar.
 *
 * `iconOnly` is what keeps the edit bar from overflowing: the toggles and
 * stepping commands shrink to their glyph while the primary actions keep
 * their words. The label always survives as the tooltip and the accessible
 * name, so nothing is lost — only the pixels.
 */
export function ToolbarButton({
  icon,
  label,
  title,
  onClick,
  disabled,
  active,
  tone = 'default',
  iconOnly = false,
  children,
}: {
  icon: ToolbarIconName;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  iconOnly?: boolean;
  children?: ReactNode;
}) {
  const className = [
    'cmd',
    active || tone === 'primary' ? 'primary' : '',
    tone === 'danger' ? 'danger' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={iconOnly ? label : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: iconOnly ? 0 : 6 }}
    >
      <ToolbarIcon name={icon} />
      {!iconOnly && <span>{label}</span>}
      {children}
    </button>
  );
}

export interface OverflowItem {
  icon: ToolbarIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

/**
 * The commands that do not earn permanent space. Everything stays reachable
 * in one click, and the bar stops scrolling sideways.
 */
export function ToolbarOverflow({ items, label = 'More commands' }: { items: OverflowItem[]; label?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  // The toolbar scrolls horizontally (overflow-x: auto), which clips any
  // absolutely-positioned child — so the menu is portalled to the body and
  // placed from the button rect instead.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onDocumentPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (!wrapRef.current?.contains(target) && !target.closest('[data-toolbar-menu]')) setIsOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <ToolbarButton
        icon="more"
        label={label}
        iconOnly
        active={isOpen}
        onClick={() => {
          const rect = wrapRef.current?.getBoundingClientRect();
          if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
          setIsOpen((open) => !open);
        }}
      />
      {isOpen && anchor && createPortal(
        <div role="menu" data-toolbar-menu style={{ ...menuStyle, top: anchor.top, right: anchor.right }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="btn sm"
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                item.onClick();
              }}
              style={{
                ...menuItemStyle,
                color: item.tone === 'danger' ? 'var(--error)' : 'var(--text)',
              }}
            >
              <ToolbarIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  minWidth: 190,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  boxShadow: '0 6px 18px color-mix(in srgb, var(--text) 22%, transparent)',
  padding: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 3000,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'flex-start',
  width: '100%',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
};
