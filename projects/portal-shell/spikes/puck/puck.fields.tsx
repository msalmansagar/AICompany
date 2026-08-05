import type { Field } from '@puckeditor/core';
import { ICON_OPTIONS, Icon } from './reyada.icons';
import { MEDIA_LIBRARY, findMedia } from './media.library';
import { COLOR_TOKEN_OPTIONS, SURFACE_TOKEN_OPTIONS, colorVar } from './theme.tokens';

/**
 * Reusable field builders for the Reyada configs.
 *
 * Each one replaces a free-text field that an editor could get wrong:
 *
 *   icon   text  → select from the icon registry      (no invalid names)
 *   media  text  → visual gallery picker              (no hand-typed CSS)
 *   colour text  → select of THEME TOKEN SLUGS        (no arbitrary hex)
 *
 * The colour case is the important one. Offering a colour picker would let any
 * value reach a QDB page; offering token slugs means only approved colours can
 * ever render, and a rebrand is a token-value change rather than a page edit.
 *
 * Inline styles are used here deliberately — these render in the EDITOR chrome,
 * not inside the Puck canvas, so they are not subject to the classNames rule
 * that applies to composable components.
 */

// ---------------------------------------------------------------- icon ----

export const iconField = (label: string): Field => ({
  type: 'select',
  label,
  options: ICON_OPTIONS,
});

// --------------------------------------------------------------- colour ---

export const colorField = (label: string): Field => ({
  type: 'select',
  label,
  options: COLOR_TOKEN_OPTIONS,
});

export const surfaceField = (label: string): Field => ({
  type: 'select',
  label,
  options: SURFACE_TOKEN_OPTIONS,
});

export { colorVar };

// ---------------------------------------------------------------- media ---

const SWATCH_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
  gap: 8,
};

const SWATCH_BASE: React.CSSProperties = {
  blockSize: 48,
  borderRadius: 6,
  cursor: 'pointer',
  border: '2px solid transparent',
  padding: 0,
  inlineSize: '100%',
  position: 'relative',
};

/**
 * Visual media picker.
 *
 * Stores the asset ID, never the CSS value — so replacing a placeholder
 * gradient with a real photograph later is a change to media.library.ts and
 * every stored page picks it up untouched.
 */
export const mediaField = (label: string): Field => ({
  type: 'custom',
  label,
  render: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const selected = findMedia(value);

    return (
      <div>
        <div style={SWATCH_GRID}>
          {MEDIA_LIBRARY.map((asset) => {
            const isSelected = asset.id === value;
            return (
              <button
                key={asset.id}
                type="button"
                title={`${asset.labelEn} — ${asset.labelAr}`}
                aria-label={asset.labelEn}
                aria-pressed={isSelected}
                onClick={() => onChange(asset.id)}
                style={{
                  ...SWATCH_BASE,
                  background: asset.value,
                  borderColor: isSelected ? '#0f6cbd' : 'transparent',
                  boxShadow: isSelected ? '0 0 0 2px rgba(15,108,189,0.25)' : 'none',
                }}
              />
            );
          })}
        </div>

        <div style={{ marginBlockStart: 8, fontSize: 12, color: '#5d6b7a' }}>
          {selected ? (
            <>
              {selected.labelEn} · <bdi>{selected.labelAr}</bdi>
            </>
          ) : value ? (
            <span style={{ color: '#c0392b' }}>Unknown asset: {value}</span>
          ) : (
            'No image selected'
          )}
        </div>
      </div>
    );
  },
});

// ------------------------------------------------------- icon preview -----

/**
 * Small helper so a config can show the chosen icon next to its select,
 * making a wrong choice visible without leaving the fields panel.
 */
export function IconPreview({ name }: { name: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <Icon name={name} size={16} />
      {name}
    </span>
  );
}
