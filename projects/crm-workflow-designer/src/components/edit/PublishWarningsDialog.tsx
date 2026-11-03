import type { Violation } from '@/services/ValidationService';

/**
 * The acknowledgement gate on publish (CWFD-016 B7).
 *
 * Errors block; warnings used to ride through in silence — the Loan process
 * published with 49 of them unremarked. Spec §21 asks that publishing over
 * warnings be possible "after acknowledgement", so they stop the publish
 * once, grouped by rule, and accepting them records what was accepted with
 * the published state.
 */
export function PublishWarningsDialog({
  warnings,
  onCancel,
  onPublishAnyway,
}: {
  warnings: Violation[];
  onCancel: () => void;
  onPublishAnyway: () => void;
}) {
  const groups = groupByCode(warnings);

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="dialog"
        style={{ width: 'min(620px, 94vw)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Publish with warnings"
      >
        <div className="dialog-head">
          <h2>Publish with warnings?</h2>
        </div>

        <div className="dialog-body" style={bodyStyle}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
            Nothing blocks this publish, but {warnings.length} warning
            {warnings.length === 1 ? '' : 's'} {warnings.length === 1 ? 'stands' : 'stand'}.
            Publishing records that you accepted {warnings.length === 1 ? 'it' : 'them'}.
          </p>

          <div style={listStyle}>
            {groups.map((group) => (
              <div key={group.code} style={groupRowStyle}>
                <span style={countStyle}>{group.items.length}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={groupTitleStyle}>{humanizeCode(group.code)}</div>
                  <div style={exampleStyle}>
                    {group.items[0]?.message}
                    {group.items.length > 1 && ` +${group.items.length - 1} more`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onCancel}>
            Go back and fix
          </button>
          <button type="button" className="btn primary" onClick={onPublishAnyway}>
            Publish anyway
          </button>
        </div>
      </div>
    </div>
  );
}

interface WarningGroup {
  code: string;
  items: Violation[];
}

function groupByCode(warnings: Violation[]): WarningGroup[] {
  const byCode = new Map<string, WarningGroup>();
  for (const warning of warnings) {
    const group = byCode.get(warning.code) ?? { code: warning.code, items: [] };
    group.items.push(warning);
    byCode.set(warning.code, group);
  }
  return [...byCode.values()].sort((a, b) => b.items.length - a.items.length);
}

function humanizeCode(code: string): string {
  const words = code.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '54vh',
  overflowY: 'auto',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const groupRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '8px 10px',
  background: 'var(--warning-bg)',
  border: '1px solid var(--warning)',
  borderRadius: 6,
};

const countStyle: React.CSSProperties = {
  background: 'var(--warning)',
  color: 'var(--text-on-primary)',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  padding: '1px 8px',
  flexShrink: 0,
};

const groupTitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text)',
};

const exampleStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--text-secondary)',
  marginTop: 2,
};
