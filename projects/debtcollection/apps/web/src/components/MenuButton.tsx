import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './primitives.js';

/**
 * A command that opens a short menu: the Case Workspace's Contact ▾ and More ▾.
 *
 * A disclosure button and a `menu` of `menuitem`s. Arrow keys move between items, Escape closes and
 * returns focus to the button, a click outside closes. An item is either a command or a link (a
 * `tel:` number), so a menu never pretends a link is a button or the other way round.
 */
export type MenuItem =
  | { id: string; label: string; onSelect: () => void; hint?: string }
  | { id: string; label: string; href: string; hint?: string };

export function MenuButton({ label, icon, items, testId }: {
  label: string;
  icon?: string;
  items: readonly MenuItem[];
  testId: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useCloseOnOutsideClick(root, isOpen, () => setOpen(false));
  const close = () => { setOpen(false); trigger.current?.focus(); };

  return (
    <div className="menu-button" ref={root}>
      <button
        type="button" ref={trigger} className="btn"
        aria-haspopup="menu" aria-expanded={isOpen} aria-controls={isOpen ? menuId : undefined}
        onClick={() => setOpen(open => !open)} data-testid={testId}
        disabled={items.length === 0} title={items.length === 0 ? 'Nothing is available here for this case.' : undefined}
      >
        {icon && <Icon name={icon} />}{label} <span aria-hidden="true">▾</span>
      </button>
      {isOpen && <MenuList id={menuId} items={items} onClose={close} testId={testId} />}
    </div>
  );
}

function MenuList({ id, items, onClose, testId }: { id: string; items: readonly MenuItem[]; onClose: () => void; testId: string }) {
  const list = useRef<HTMLUListElement | null>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(); }, []);
  return (
    <ul className="menu-list" role="menu" id={id} ref={list} onKeyDown={event => moveFocus(event, list.current, onClose)} data-testid={`${testId}-menu`}>
      {items.map(item => <li key={item.id} role="none"><MenuEntry item={item} onClose={onClose} testId={`${testId}-${item.id}`} /></li>)}
    </ul>
  );
}

function MenuEntry({ item, onClose, testId }: { item: MenuItem; onClose: () => void; testId: string }) {
  const content: ReactNode = <>{item.label}{item.hint && <span className="menu-hint">{item.hint}</span>}</>;
  if ('href' in item) {
    return <a role="menuitem" className="menu-item" href={item.href} onClick={onClose} data-testid={testId}>{content}</a>;
  }
  const select = () => { onClose(); item.onSelect(); };
  return <button type="button" role="menuitem" className="menu-item" onClick={select} data-testid={testId}>{content}</button>;
}

function moveFocus(event: KeyboardEvent<HTMLUListElement>, list: HTMLUListElement | null, onClose: () => void): void {
  if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const entries = [...(list?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
  const at = entries.indexOf(document.activeElement as HTMLElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  entries[(at + step + entries.length) % entries.length]?.focus();
}

function useCloseOnOutsideClick(root: { current: HTMLElement | null }, isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [isOpen, root, onClose]);
}
