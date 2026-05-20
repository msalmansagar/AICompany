import React, { memo, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Card,
  CardHeader,
  makeStyles,
  tokens,
  Button,
} from '@fluentui/react-components';
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
} from '@fluentui/react-icons';
import type { SectionDefinition } from '@dfe/shared';
import { FieldRenderer } from './FieldRenderer';
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

function SectionRendererInner({ section, isVisible }: SectionRendererProps) {
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
        <div className={styles.sectionTitle}>{section.label}</div>
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
            />
          </div>
        );
      })}
    </div>
  );

  if (sectionStyleType === 'Card') {
    return (
      <Card
        className={styles.card}
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
        className={styles.outlinedSection}
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
      className={styles.flatSection}
      aria-label={section.label}
      style={sectionStyle}
    >
      {sectionHeader}
      <div style={collapseStyle}>{!isCollapsed && fieldsGrid}</div>
    </section>
  );
}

// Memo comparator: only re-render when sectionId or relevant design slice changes.
function areSectionPropsEqual(
  prev: SectionRendererProps,
  next: SectionRendererProps,
): boolean {
  return prev.section.id === next.section.id && prev.isVisible === next.isVisible;
}

export const SectionRenderer = memo(SectionRendererInner, areSectionPropsEqual);
