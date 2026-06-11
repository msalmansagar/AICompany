import React, { useCallback, useState } from 'react';
import {
  Button,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel, DesignerSectionModel } from '@/state/models/DesignerFormModel';
import type { DesignerStyleModel } from '@/state/models/DesignerStyleModel';

type Breakpoint = 'desktop' | 'tablet' | 'mobile';

const BREAKPOINT_WIDTHS: Record<Breakpoint, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 390,
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  topBarSpacer: {
    flex: 1,
  },
  breakpointSelector: {
    display: 'flex',
    gap: '4px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '6px',
    padding: '4px',
  },
  breakpointButton: {
    padding: '6px 14px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
  },
  breakpointButtonActive: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    boxShadow: tokens.shadow4,
    fontWeight: 600,
  },
  warning: {
    margin: '12px 20px',
    flexShrink: 0,
  },
  previewArea: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px',
  },
  previewFrame: {
    backgroundColor: '#ffffff',
    boxShadow: tokens.shadow64,
    overflow: 'auto',
    transition: 'width 0.3s ease',
  },
  tabStrip: {
    display: 'flex',
    borderBottom: '2px solid',
    marginBottom: '0',
  },
  tabButton: {
    padding: '10px 20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    borderBottom: '3px solid transparent',
    marginBottom: '-2px',
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#0078d4',
    color: '#0078d4',
  },
  sectionBox: {
    margin: '16px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
  },
  sectionHeader: {
    padding: '10px 14px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    fontWeight: 600,
    fontSize: '13px',
    color: '#444',
  },
  sectionBody: {
    padding: '14px',
  },
  fieldWrapper: {
    marginBottom: '0',
  },
  fieldLabel: {
    display: 'block',
    fontWeight: 500,
    marginBottom: '4px',
    fontSize: '13px',
    color: '#555',
  },
  fieldRequiredStar: {
    color: '#a4262c',
    marginLeft: '2px',
  },
  previewInput: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '6px 10px',
    fontSize: '13px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
  },
});

interface PreviewFieldProps {
  field: DesignerFieldModel;
  style: DesignerStyleModel;
}

function PreviewField({ field, style }: PreviewFieldProps): React.ReactElement {
  const styles = useStyles();

  const inputStyle: React.CSSProperties = {
    borderRadius: `${style.borderRadius}px`,
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSizeBase}px`,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSizeBase}px`,
    display: style.labelPosition === 'above' ? 'block' : 'inline-block',
    minWidth: style.labelPosition === 'beside' ? '120px' : undefined,
    marginBottom: style.labelPosition === 'above' ? '4px' : '0',
    marginRight: style.labelPosition === 'beside' ? '8px' : '0',
  };

  const wrapperStyle: React.CSSProperties = {
    marginBottom: `${style.fieldSpacing}px`,
    display: style.labelPosition === 'beside' ? 'flex' : 'block',
    alignItems: style.labelPosition === 'beside' ? 'center' : undefined,
  };

  function renderInput(): React.ReactElement {
    const baseProps = {
      style: inputStyle,
      className: styles.previewInput,
      readOnly: true,
      tabIndex: -1,
      'aria-label': field.label,
    };

    switch (field.fieldType) {
      case 'textarea':
      case 'rich_text':
        return <textarea {...baseProps} rows={3} defaultValue={field.defaultValue ?? ''} />;
      case 'checkbox':
        return (
          <input
            type="checkbox"
            readOnly
            tabIndex={-1}
            aria-label={field.label}
            defaultChecked={field.defaultValue === 'true'}
          />
        );
      case 'dropdown':
        return (
          <select style={{ ...inputStyle, width: '100%' }} aria-label={field.label} tabIndex={-1}>
            {field.options.length > 0
              ? field.options.map(opt => <option key={opt.id} value={opt.value}>{opt.label}</option>)
              : <option>-- Select --</option>
            }
          </select>
        );
      case 'radio':
        return (
          <div>
            {field.options.length > 0
              ? field.options.map(opt => (
                  <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <input type="radio" readOnly name={field.id} tabIndex={-1} />
                    {opt.label}
                  </label>
                ))
              : <span style={{ color: '#999', fontSize: '12px' }}>No options defined</span>
            }
          </div>
        );
      case 'date':
        return <input type="date" {...baseProps} />;
      case 'datetime':
        return <input type="datetime-local" {...baseProps} />;
      case 'email':
        return <input type="email" {...baseProps} defaultValue={field.defaultValue ?? ''} />;
      case 'phone':
        return <input type="tel" {...baseProps} defaultValue={field.defaultValue ?? ''} />;
      case 'number':
      case 'decimal':
      case 'currency':
        return <input type="number" {...baseProps} defaultValue={field.defaultValue ?? ''} />;
      case 'file_upload':
      case 'document_upload':
        return (
          <div style={{ ...inputStyle, padding: '12px', border: '2px dashed #ccc', borderRadius: `${style.borderRadius}px`, textAlign: 'center', color: '#999', fontSize: '12px' }}>
            File upload area
          </div>
        );
      case 'lookup':
        return (
          <div style={{ ...inputStyle, display: 'flex', gap: '4px' }}>
            <input type="text" readOnly tabIndex={-1} style={{ flex: 1, borderRadius: `${style.borderRadius}px`, padding: '6px 10px', border: '1px solid #ccc', fontFamily: style.fontFamily }} placeholder={field.lookupConfig?.targetEntity ? `Search ${field.lookupConfig.targetEntity}...` : 'Lookup'} />
            <button type="button" tabIndex={-1} style={{ padding: '6px 10px', borderRadius: `${style.borderRadius}px`, border: '1px solid #ccc', backgroundColor: '#f5f5f5', cursor: 'default' }}>...</button>
          </div>
        );
      case 'multi_select':
        return (
          <select style={{ ...inputStyle, width: '100%' }} multiple size={Math.min(4, field.options.length || 2)} aria-label={field.label} tabIndex={-1}>
            {field.options.length > 0
              ? field.options.map(opt => <option key={opt.id} value={opt.value}>{opt.label}</option>)
              : <option>-- No options defined --</option>
            }
          </select>
        );
      case 'boolean': {
        const renderStyle = field.boolRenderStyle ?? 'toggle';
        if (renderStyle === 'radio') {
          return (
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'default' }}>
                <input type="radio" readOnly name={field.id} tabIndex={-1} />
                {field.trueLabel || 'Yes'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'default' }}>
                <input type="radio" readOnly name={field.id} tabIndex={-1} />
                {field.falseLabel || 'No'}
              </label>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" role="switch" readOnly tabIndex={-1} aria-label={field.label} defaultChecked={field.defaultValue === 'true'} />
            <span style={{ fontSize: '13px', color: '#555' }}>Toggle</span>
          </div>
        );
      }
      case 'repeating_grid':
      case 'interactive-grid': {
        const isInteractive = field.fieldType === 'interactive-grid';
        return (
          <div style={{ border: '1px solid #e0e0e0', borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: style.fontFamily }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f4f8' }}>
                  {isInteractive && (
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', fontWeight: 600, color: '#555', width: '32px' }}>
                      ☐
                    </th>
                  )}
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', fontWeight: 600, color: '#555' }}>Column 1</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', fontWeight: 600, color: '#555' }}>Column 2</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', fontWeight: 600, color: '#555' }}>Column 3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {isInteractive && <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }} />}
                  <td colSpan={3} style={{ padding: '12px 10px', color: '#999', fontSize: '11px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', fontStyle: 'italic' }}>
                    {isInteractive ? 'Data loads at runtime — configure columns in properties panel' : 'Rows added at runtime'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <input type="text" {...baseProps} defaultValue={field.defaultValue ?? ''} />;
    }
  }

  // Info-card is display-only — render the banner directly, no label wrapper.
  if (field.fieldType === 'info-card') {
    const cardStyleKey = (field.infoCardStyle ?? 'info') as 'info' | 'warning' | 'success' | 'error';
    const borderColours = { info: '#0078d4', warning: '#f7630c', success: '#107c10', error: '#d92b2b' };
    const bgColours = { info: '#eff6fc', warning: '#fff4e5', success: '#f0f9f0', error: '#fef0f0' };
    return (
      <div style={{
        marginBottom: `${style.fieldSpacing}px`,
        padding: '10px 14px',
        borderLeft: `4px solid ${borderColours[cardStyleKey]}`,
        backgroundColor: bgColours[cardStyleKey],
        borderRadius: `${style.borderRadius}px`,
        fontFamily: style.fontFamily,
      }}>
        {field.infoCardTitle && (
          <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: `${style.fontSizeBase}px` }}>
            {field.infoCardTitle}
          </div>
        )}
        {field.infoCardBody && (
          <div style={{ fontSize: `${style.fontSizeBase - 1}px`, color: '#444', lineHeight: '1.5' }}>
            {field.infoCardBody}
          </div>
        )}
        {!field.infoCardTitle && !field.infoCardBody && (
          <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
            Info banner — configure title and body in properties panel
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <label style={labelStyle}>
        {field.label || <span style={{ color: '#999', fontStyle: 'italic' }}>Unlabeled Field</span>}
        {field.isRequired && <span className={styles.fieldRequiredStar} aria-hidden="true">*</span>}
      </label>
      {renderInput()}
      {field.helpText && (
        <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontFamily: style.fontFamily }}>
          {field.helpText}
        </div>
      )}
    </div>
  );
}

interface PreviewSectionProps {
  section: DesignerSectionModel;
  fields: DesignerFieldModel[];
  style: DesignerStyleModel;
}

function PreviewSection({ section, fields, style }: PreviewSectionProps): React.ReactElement {
  const styles = useStyles();

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${section.columnCount}, 1fr)`,
    gap: `${style.fieldSpacing}px`,
  };

  return (
    <div className={styles.sectionBox} style={{ borderRadius: `${style.borderRadius}px` }}>
      {section.label && (
        <div className={styles.sectionHeader} style={{ fontFamily: style.fontFamily }}>
          {section.label}
        </div>
      )}
      <div className={styles.sectionBody} style={gridStyle}>
        {fields.length === 0 ? (
          <div style={{ color: '#bbb', fontSize: '12px', gridColumn: '1 / -1', textAlign: 'center', padding: '16px' }}>
            Empty section
          </div>
        ) : (
          fields.map(field => (
            <div
              key={field.id}
              style={{ gridColumn: field.columnSpan > 1 ? `span ${Math.min(field.columnSpan, section.columnCount)}` : undefined }}
            >
              <PreviewField field={field} style={style} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PreviewScreen(): React.ReactElement {
  const styles = useStyles();

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const form = useDesignerStore(s => s.form);
  const tabs = useDesignerStore(s => s.tabs);
  const sections = useDesignerStore(s => s.sections);
  const fields = useDesignerStore(s => s.fields);
  const tabOrder = useDesignerStore(s => s.tabOrder);
  const sectionOrder = useDesignerStore(s => s.sectionOrder);
  const fieldOrder = useDesignerStore(s => s.fieldOrder);
  const style = useDesignerStore(s => s.style);

  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [activeTabId, setActiveTabId] = useState<string | null>(tabOrder[0] ?? null);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const frameWidth = BREAKPOINT_WIDTHS[breakpoint];

  const activeTabSectionIds = activeTabId ? (sectionOrder[activeTabId] ?? []) : [];

  const formContainerStyle: React.CSSProperties = {
    fontFamily: style.fontFamily,
    backgroundColor: style.backgroundColor,
    minHeight: '100%',
  };

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">{form?.name ?? 'Preview'}</Text>
        <div className={styles.topBarSpacer} />
        <div className={styles.breakpointSelector} role="radiogroup" aria-label="Preview breakpoint">
          {(['desktop', 'tablet', 'mobile'] as Breakpoint[]).map(bp => (
            <button
              key={bp}
              type="button"
              role="radio"
              aria-checked={breakpoint === bp}
              className={`${styles.breakpointButton} ${breakpoint === bp ? styles.breakpointButtonActive : ''}`}
              onClick={() => setBreakpoint(bp)}
            >
              {bp.charAt(0).toUpperCase() + bp.slice(1)} ({BREAKPOINT_WIDTHS[bp]}px)
            </button>
          ))}
        </div>
      </div>

      <div className={styles.warning}>
        <MessageBar intent="warning">
          <MessageBarBody>
            Preview shows structure only. Business rules, validation, and submission are not evaluated.
          </MessageBarBody>
        </MessageBar>
      </div>

      <div className={styles.previewArea}>
        <div
          className={styles.previewFrame}
          style={{ width: Math.min(frameWidth, window.innerWidth - 48) }}
          role="main"
          aria-label={`Form preview at ${breakpoint} breakpoint`}
        >
          <div style={formContainerStyle}>
            {tabOrder.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>
                This form has no tabs. Add tabs in the designer.
              </div>
            ) : (
              <>
                {tabOrder.length > 1 && (
                  <div
                    className={styles.tabStrip}
                    style={{ borderBottomColor: style.primaryColor }}
                    role="tablist"
                  >
                    {tabOrder.map(tabId => {
                      const tab = tabs[tabId];
                      if (!tab) return null;
                      return (
                        <button
                          key={tabId}
                          type="button"
                          role="tab"
                          aria-selected={activeTabId === tabId}
                          className={`${styles.tabButton} ${activeTabId === tabId ? styles.tabButtonActive : ''}`}
                          style={{
                            color: activeTabId === tabId ? style.primaryColor : undefined,
                            borderBottomColor: activeTabId === tabId ? style.primaryColor : undefined,
                            fontFamily: style.fontFamily,
                          }}
                          onClick={() => setActiveTabId(tabId)}
                        >
                          {tab.label || 'Tab'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeTabSectionIds.map(sectionId => {
                  const section = sections[sectionId];
                  if (!section) return null;
                  const sectionFieldIds = fieldOrder[sectionId] ?? [];
                  const sectionFields = sectionFieldIds.map(id => fields[id]).filter((f): f is DesignerFieldModel => !!f);
                  return (
                    <PreviewSection
                      key={sectionId}
                      section={section}
                      fields={sectionFields}
                      style={style}
                    />
                  );
                })}

                <div style={{ padding: '16px', textAlign: 'right' }}>
                  <button
                    type="button"
                    tabIndex={-1}
                    style={{
                      padding: '8px 20px',
                      borderRadius: `${style.borderRadius}px`,
                      backgroundColor: style.buttonStyle === 'filled' ? style.primaryColor : 'transparent',
                      color: style.buttonStyle === 'filled' ? '#fff' : style.primaryColor,
                      border: style.buttonStyle === 'outline' ? `2px solid ${style.primaryColor}` : 'none',
                      fontFamily: style.fontFamily,
                      fontSize: `${style.fontSizeBase}px`,
                      cursor: 'default',
                    }}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
