import type { CSSProperties } from 'react';

export const field: CSSProperties = { marginBottom: 14 };

export const label: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#475569',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

export const select: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  color: '#1e293b',
  outline: 'none',
};

export const input: CSSProperties = {
  ...select,
};
