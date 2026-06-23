import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Input,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type { LookupResult } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import { useLookupSearch } from '../../../hooks/useLookupSearch';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    width: '100%',
  },
  // Dropdown is rendered with position:fixed via inline style so no parent
  // overflow:hidden (section collapse wrapper, Card, etc.) can clip it.
  dropdown: {
    position: 'fixed',
    zIndex: 9999,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    maxHeight: '240px',
    overflowY: 'auto',
    paddingTop: '4px',
    paddingBottom: '4px',
    paddingLeft: '4px',
    paddingRight: '4px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    marginTop: '2px',
    marginBottom: '2px',
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    outlineStyle: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  optionSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  checkmark: {
    marginLeft: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase200,
  },
  clearButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0 2px',
    color: tokens.colorNeutralForeground3,
    fontSize: '14px',
    lineHeight: '1',
    ':hover': {
      color: tokens.colorNeutralForeground1,
    },
  },
});

interface LookupValue {
  id: string;
  displayName: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
}

export function LookupControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const { fieldValues, updateFieldValue } = useFormContext();
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });

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

  const { results, isSearching, searchError, search, loadInitial, clearResults } = useLookupSearch({
    entityName: lookupConfig?.entityLogicalName ?? '',
    displayAttribute: lookupConfig?.displayAttribute ?? 'name',
    valueAttribute: lookupConfig?.valueAttribute,
    maxResults: lookupConfig?.maxResults ?? 10,
    filterExpression: effectiveFilter,
  });

  const rawValue = fieldValues[field.schemaName] as LookupValue | null | undefined;
  const selectedLabel = rawValue?.displayName ?? '';
  const minChars = lookupConfig?.searchMinChars ?? 2;
  const displayValue = inputText || selectedLabel;

  function measureAndOpen(): void {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  }

  function openDropdown(): void {
    if (isReadonly) return;
    measureAndOpen();
    setIsOpen(true);
    if (!inputText) loadInitial();
  }

  // When open, keep dropdown anchored to the input even on scroll/resize.
  useEffect(() => {
    if (!isOpen) return;

    function onScroll(): void {
      measureAndOpen();
    }
    function onResize(): void {
      setIsOpen(false);
    }

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>): void {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const query = e.target.value;
    setInputText(query);
    if (!isOpen) {
      measureAndOpen();
      setIsOpen(true);
    }
    if (query.length >= minChars) {
      search(query);
    } else if (!query) {
      loadInitial();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  function handleSelect(result: LookupResult): void {
    updateFieldValue(field.schemaName, {
      id: result.id,
      displayName: result.displayName,
    } satisfies LookupValue);
    setInputText('');
    clearResults();
    setIsOpen(false);
  }

  function handleClear(e: React.MouseEvent): void {
    e.stopPropagation();
    updateFieldValue(field.schemaName, null);
    setInputText('');
    measureAndOpen();
    loadInitial();
    setIsOpen(true);
  }

  const showNoResults = !isSearching && !searchError && inputText.length >= minChars && results.length === 0;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onBlur={handleContainerBlur}
    >
      <Input
        id={inputId}
        className={styles.input}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={field.placeholder ?? 'Select or search...'}
        disabled={isReadonly}
        aria-required={isRequired}
        aria-describedby={errorId}
        aria-invalid={!!errorId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        input={{ onFocus: openDropdown }}
        contentAfter={
          rawValue ? (
            <button
              className={styles.clearButton}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              aria-label="Clear selection"
              tabIndex={-1}
            >
              âœ•
            </button>
          ) : undefined
        }
      />

      {isOpen && (
        <div
          className={styles.dropdown}
          role="listbox"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {isSearching && (
            <div className={styles.statusRow}>
              <Spinner size="tiny" />
              Searching...
            </div>
          )}

          {!isSearching && searchError && (
            <div className={styles.statusRow}>{searchError}</div>
          )}

          {!isSearching && showNoResults && (
            <div className={styles.statusRow}>No results found</div>
          )}

          {!isSearching &&
            results.map((result) => {
              const isSelected = result.id === rawValue?.id;
              return (
                <button
                  key={result.id}
                  role="option"
                  aria-selected={isSelected}
                  className={mergeClasses(
                    styles.option,
                    isSelected && styles.optionSelected,
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(result)}
                >
                  {result.displayName}
                  {isSelected && <span className={styles.checkmark}>âœ“</span>}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
