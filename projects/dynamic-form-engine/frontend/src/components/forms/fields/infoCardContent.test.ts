import { describe, it, expect } from 'vitest';
import { parseInfoCardContent } from './infoCardContent';

const SAMPLE = JSON.stringify([
  { Order: 1, Label: 'Business understanding & deal preparation', icon: 'info' },
  { Order: 2, Label: 'Buyer outreach & offer management', icon: 'info' },
  { Order: 3, Label: 'Due diligence, negotiation & closing', icon: 'info' },
]);

describe('parseInfoCardContent', () => {
  it('parses a valid JSON array into items with all entries', () => {
    const result = parseInfoCardContent(SAMPLE);

    expect(result.mode).toBe('items');
    if (result.mode !== 'items') return;
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({
      order: 1,
      label: 'Business understanding & deal preparation',
      icon: 'info',
    });
  });

  it('sorts items ascending by Order', () => {
    const unordered = JSON.stringify([
      { Order: 3, Label: 'third', icon: 'info' },
      { Order: 1, Label: 'first', icon: 'info' },
      { Order: 2, Label: 'second', icon: 'info' },
    ]);

    const result = parseInfoCardContent(unordered);

    if (result.mode !== 'items') throw new Error('expected items mode');
    expect(result.items.map((i) => i.label)).toEqual(['first', 'second', 'third']);
  });

  it('renders legacy plain text as text mode', () => {
    const result = parseInfoCardContent('All fields are required before submission.');

    expect(result).toEqual({
      mode: 'text',
      text: 'All fields are required before submission.',
    });
  });

  it('falls back to text mode when the value is invalid JSON', () => {
    const broken = '[{ "Order": 1, "Label": "oops" '; // unterminated

    const result = parseInfoCardContent(broken);

    expect(result).toEqual({ mode: 'text', text: broken });
  });

  it('falls back to text mode for JSON that is not an array of objects', () => {
    expect(parseInfoCardContent('{"Order":1}').mode).toBe('text');
    expect(parseInfoCardContent('[1,2,3]').mode).toBe('text');
    expect(parseInfoCardContent('"just a quoted string"').mode).toBe('text');
  });

  it('normalizes missing/invalid fields safely', () => {
    const messy = JSON.stringify([
      { Label: 'no order', icon: 'warning' }, // missing Order → sinks last
      { Order: 1, icon: 'info' }, // missing Label → ''
      { Order: 2, Label: 'no icon' }, // missing icon → 'info'
    ]);

    const result = parseInfoCardContent(messy);

    if (result.mode !== 'items') throw new Error('expected items mode');
    expect(result.items[0]).toEqual({ order: 1, label: '', icon: 'info' });
    expect(result.items[1]).toEqual({ order: 2, label: 'no icon', icon: 'info' });
    // missing Order sinks to the bottom
    expect(result.items[2].label).toBe('no order');
    expect(result.items[2].icon).toBe('warning');
  });

  it('accepts lowercase keys leniently', () => {
    const lower = JSON.stringify([{ order: 5, label: 'lower', icon: 'success' }]);

    const result = parseInfoCardContent(lower);

    if (result.mode !== 'items') throw new Error('expected items mode');
    expect(result.items[0]).toEqual({ order: 5, label: 'lower', icon: 'success' });
  });

  it('treats empty/undefined content as empty text', () => {
    expect(parseInfoCardContent(undefined)).toEqual({ mode: 'text', text: '' });
    expect(parseInfoCardContent('')).toEqual({ mode: 'text', text: '' });
  });
});
