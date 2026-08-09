import type { CSSProperties } from 'react';

export const field: CSSProperties = { marginBottom: 14 };

export const label: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

export const select: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
};

export const input: CSSProperties = {
  ...select,
};
