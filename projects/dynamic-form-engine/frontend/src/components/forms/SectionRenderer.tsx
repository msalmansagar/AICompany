import { memo, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Card,
  CardHeader,
  makeStyles,
  mergeClasses,
  tokens,
  Button,
} from '@fluentui/react-components';
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
} from '@fluentui/react-icons';
import type { SectionDefinition } from '@qdb/shared';
import { ScopedButtonBar } from './ScopedButtonBar';
import { FieldRenderer } from './FieldRenderer';
import { DynamicIcon } from './DynamicIcon';
import { useFormContext } from '../../contexts/FormContext';
import { useDesignContext } from '../../contexts/DesignContext';
import { StyleEngine } from '../../theme/StyleEngine';

const useStyles = makeStyles({
  card: {
    width: '100%',
  },
  outlinedSection: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    width: '100%',
  },
  flatSection: {
    width: '100%',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  sectionDescription: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    marginTop: tokens.spacingVerticalXXS,
  },
  fieldsGrid: {
    display: 'grid',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    '@media (max-width: 600px)': {
      gridTemplateColumns: '1fr',
    },
  },
  collapseButton: {
    minWidth: 'auto',
    padding: tokens.spacingHorizontalXS,
  },
  collapseAnimated: {
    overflow: 'hidden',
    transition: 'max-height 0.3s ease, opacity 0.3s ease',
  },
  collapseInstant: {
    overflow: 'hidden',
  },
});

interface SectionRendererProps {
  section: SectionDefinition;
  isVisible: boolean;
  // Forwarded to FieldRenderer for interactive-grid lazy loading (ADR-ADD-003).
  isTabActive?: boolean;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildCollapsibleStyle(
  isCollapsed: boolean,
  collapseType: string,
): CSSProperties {
  // Animated: use max-height transition.
  // Skip animation when OS prefers reduced motion.
  if (collapseType !== 'Animated' || prefersReducedMotion()) {
    return { display: isCollapsed ? 'none' : 'block' };
  }

  return {
    maxHeight: isCollapsed ? '0px' : '2000px',
    opacity: isCollapsed ? 0 : 1,
    overflow: 'hidden',
    transition: 'max-height 0.3s ease, opacity 0.3s ease',
  };
}

function SectionRendererInner({ section, isVisible, isTabActive = false }: SectionRendererProps) {
  const styles = useStyles();
  const { ruleState, validationErrors } = useFormContext();
  const design = useDesignContext();

  const [isCollapsed, setIsCollapsed] = useState(section.isCollapsedByDefault);

  const sectionStyle = useMemo(
    () => StyleEngine.resolveSection(design, section.id),
    [design, section.id],
  );

  const sectionDesign = design.sectionDesigns[section.id];
  const collapseType = sectionDesign?.collapsibleStyle ?? 'None';
  const sectionStyleType = design.formDesign.sectionStyle;

  if (!isVisible) return null;

  const visibleFields = section.fields
    .filter((field) => {
      const fieldVisible =
        ruleState.fieldVisibility[field.id] ?? field.isVisible;
      return fieldVisible && !field.isHidden;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const gridColumns = sectionDesign?.columnLayout ?? section.columns ?? 1;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
  };

  const collapseStyle = buildCollapsibleStyle(isCollapsed, collapseType);

  function handleCollapseToggle() {
    setIsCollapsed((prev) => !prev);
  }

  const sectionHeader = (
    <div className={styles.cardHeader}>
      <div>
        <div className={styles.sectionTitle}>
          {/* DFE-FBE-001: section header icon (reuses the tab-icon DynamicIcon system, C-004). */}
          {section.iconName && <DynamicIcon iconName={section.iconName} size={20} />}
          {section.label}
        </div>
        {section.description && (
          <div className={styles.sectionDescription}>
            {section.description}
          </div>
        )}
      </div>
      {section.isCollapsible && (
        <Button
          appearance="transparent"
          className={styles.collapseButton}
          icon={isCollapsed ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
          onClick={handleCollapseToggle}
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed
              ? `Expand ${section.label}`
              : `Collapse ${section.label}`
          }
        />
      )}
    </div>
  );

  const fieldsGrid = (
    <div
      id={`section-${section.id}`}
      className={styles.fieldsGrid}
      style={gridStyle}
      role="group"
      aria-label={`${section.label} fields`}
    >
      {visibleFields.map((field) => {
        const isRequired =
          ruleState.fieldRequired[field.id] ?? field.isRequired;
        const isReadonly =
          ruleState.fieldReadonly[field.id] ?? field.isReadonly;
        const fieldErrors = validationErrors[field.id] ?? [];
        const errorMessage = fieldErrors[0];

        return (
          <div
            key={field.id}
            style={{
              gridColumn: `span ${Math.min(field.columnSpan, gridColumns)}`,
            }}
          >
            <FieldRenderer
              field={field}
              isVisible={true}
              isRequired={isRequired}
              isReadonly={isReadonly}
              error={errorMessage}
              isTabActive={isTabActive}
            />
          </div>
        );
      })}
      {/* DFE-BTN-001: section-scoped buttons, full width below the field grid. */}
      {section.buttons && section.buttons.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <ScopedButtonBar buttons={section.buttons} />
        </div>
      )}
    </div>
  );

  if (sectionStyleType === 'Card') {
    return (
      <Card
        className={mergeClasses(styles.card, sectionDesign?.cssClassName)}
        aria-label={section.label}
        style={sectionStyle}
      >
        <CardHeader header={sectionHeader} />
        <div style={collapseStyle}>{!isCollapsed && fieldsGrid}</div>
      </Card>
    );
  }

  if (sectionStyleType === 'Outlined') {
    return (
      <section
        className={mergeClasses(styles.outlinedSection, sectionDesign?.cssClassName)}
        aria-label={section.label}
        style={sectionStyle}
      >
        {sectionHeader}
        <div style={collapseStyle}>{!isCollapsed && fieldsGrid}</div>
      </section>
    );
  }

  return (
    <section
      className={mergeClasses(styles.flatSection, sectionDesign?.cssClassName)}
      aria-label={section.label}
      style={sectionStyle}
    >
      {sectionHeader}
      <div style={collapseStyle}>{!isCollapsed && fieldsGrid}</div>
    </section>
  );
}

// Default shallow prop comparison — no custom comparator.
// A custom comparator that checks only section.id + isVisible would silently skip
// re-renders when new props are added, and context changes (ruleState, validationErrors)
// already trigger re-renders independently of memo.
export const SectionRenderer = memo(SectionRendererInner);
