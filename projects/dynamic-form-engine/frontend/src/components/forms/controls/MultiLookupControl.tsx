// DFE-FBE-002 — multi-select lookup. Reuses useLookupSearch; value is an array of
// { id, displayName }. Selected records show as removable chips; the dropdown toggles membership.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { LookupResult } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import { useLookupSearch } from '../../../hooks/useLookupSearch';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  container: { position: 'relative', width: '100%' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1,
    borderRadius: tokens.borderRadiusMedium, padding: '2px 8px', fontSize: tokens.fontSizeBase200,
  },
  chipRemove: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: tokens.colorBrandForeground1, fontSize: '13px', lineHeight: '1',
  },
  dropdown: {
    position: 'fixed', zIndex: 9999, backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16, maxHeight: '240px', overflowY: 'auto', padding: '4px',
  },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200,
  },
  option: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, margin: '2px 0',
    border: 'none', outline: 'none', borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left',
    fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  optionSelected: {
    backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

interface LookupValue {
  id: string;
  displayName: string;
}

export function MultiLookupControl({ field, inputId, isRequired, isReadonly, errorId }: ControlProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const { fieldValues, updateFieldValue } = useFormContext();
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const lookupConfig = field.lookupConfig;
  const dependsOnValue = lookupConfig?.dependsOnFieldId
    ? String(fieldValues[lookupConfig.dependsOnFieldId] ?? '')
    : undefined;
  const effectiveFilter = useMemo(() => {
    if (lookupConfig?.dependsOnFilterTemplate && dependsOnValue) {
      return lookupConfig.dependsOnFilterTemplate.replace('{value}', dependsOnValue);
    }
    return lookupConfig?.filterExpression;
  }, [lookupConfig?.dependsOnFilterTemplate, lookupConfig?.filterExpression, dependsOnValue]);

  const { results, isSearching, searchError, search, loadInitial } = useLookupSearch({
    entityName: lookupConfig?.entityLogicalName ?? '',
    displayAttribute: lookupConfig?.displayAttribute ?? 'name',
    valueAttribute: lookupConfig?.valueAttribute,
    maxResults: lookupConfig?.maxResults ?? 10,
    filterExpression: effectiveFilter,
  });

  const selected = (fieldValues[field.schemaName] as LookupValue[] | null | undefined) ?? [];
  const selectedIds = new Set(selected.map((s) => s.id));
  const minChars = lookupConfig?.searchMinChars ?? 2;

  function measureAndOpen(): void {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  }
  function openDropdown(): void {
    if (isReadonly) return;
    measureAndOpen();
    setIsOpen(true);
    if (!inputText) loadInitial();
  }

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => measureAndOpen();
    const onResize = () => setIsOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>): void {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) setIsOpen(false);
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const q = e.target.value;
    setInputText(q);
    if (!isOpen) { measureAndOpen(); setIsOpen(true); }
    if (q.length >= minChars) search(q);
    else if (!q) loadInitial();
  }
  function toggle(result: LookupResult): void {
    if (selectedIds.has(result.id)) {
      updateFieldValue(field.schemaName, selected.filter((s) => s.id !== result.id));
    } else {
      updateFieldValue(field.schemaName, [...selected, { id: result.id, displayName: result.displayName }]);
    }
  }
  function remove(id: string): void {
    updateFieldValue(field.schemaName, selected.filter((s) => s.id !== id));
  }

  const showNoResults = !isSearching && !searchError && inputText.length >= minChars && results.length === 0;

  return (
    <div ref={containerRef} className={styles.container} onBlur={handleBlur}>
      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((s) => (
            <span key={s.id} className={styles.chip}>
              {s.displayName}
              {!isReadonly && (
                <button
                  type="button"
                  className={styles.chipRemove}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => remove(s.id)}
                  aria-label={`Remove ${s.displayName}`}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <Input
        id={inputId}
        style={{ width: '100%' }}
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
        placeholder={field.placeholder ?? 'Search to add…'}
        disabled={isReadonly}
        aria-required={isRequired}
        aria-describedby={errorId}
        aria-invalid={!!errorId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        input={{ onFocus: openDropdown }}
      />

      {isOpen && (
        <div className={styles.dropdown} role="listbox" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {isSearching && <div className={styles.statusRow}><Spinner size="tiny" />Searching…</div>}
          {!isSearching && searchError && <div className={styles.statusRow}>{searchError}</div>}
          {!isSearching && showNoResults && <div className={styles.statusRow}>No results found</div>}
          {!isSearching && results.map((result) => {
            const isSel = selectedIds.has(result.id);
            return (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={isSel}
                className={mergeClasses(styles.option, isSel && styles.optionSelected)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(result)}
              >
                {result.displayName}
                {isSel && <span>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
