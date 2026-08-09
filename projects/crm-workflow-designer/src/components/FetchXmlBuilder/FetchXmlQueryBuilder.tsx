import { useState } from 'react';
import { QueryBuilder, formatQuery } from 'react-querybuilder';
import 'react-querybuilder/dist/query-builder.css';
import type { RuleGroupType, Field } from 'react-querybuilder';
import { formatAsFetchXml, validateFetchXml } from './fetchXmlFormatter';
import type { AttributeOption } from '@/types/WorkflowTypes';

interface FetchXmlQueryBuilderProps {
  attributes: AttributeOption[];
  initialFetchXml?: string;
  onChange: (fetchXml: string) => void;
}

const defaultQuery: RuleGroupType = { combinator: 'and', rules: [] };

export function FetchXmlQueryBuilder({
  attributes,
  onChange,
}: FetchXmlQueryBuilderProps) {
  const [query, setQuery] = useState<RuleGroupType>(defaultQuery);
  const [previewXml, setPreviewXml] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const fields: Field[] = attributes.map((attr) => ({
    name: attr.schemaName,
    label: attr.displayName,
    inputType: mapAttributeType(attr.attributeType),
    valueEditorType: mapEditorType(attr.attributeType),
  }));

  function handleQueryChange(newQuery: RuleGroupType): void {
    setQuery(newQuery);
    const xml = formatAsFetchXml(newQuery);
    const error = validateFetchXml(xml);
    setValidationError(error);
    setPreviewXml(xml);
    if (!error) {
      onChange(xml);
    }
  }

  function handleManualChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    const xml = event.target.value;
    setPreviewXml(xml);
    const error = validateFetchXml(xml);
    setValidationError(error);
    if (!error) {
      onChange(xml);
    }
  }

  // Use formatQuery from react-querybuilder as fallback for display
  const generatedXml = formatQuery(query, 'json_without_ids');
  void generatedXml;

  return (
    <div style={containerStyle}>
      <div style={builderSectionStyle}>
        <p style={sectionLabelStyle}>Build filter conditions:</p>
        {fields.length === 0 ? (
          <p style={emptyStateStyle}>No attributes available for this entity.</p>
        ) : (
          <QueryBuilder
            fields={fields}
            query={query}
            onQueryChange={handleQueryChange}
          />
        )}
      </div>

      <div className="field">
        <label className="lbl" htmlFor="fetchxml-preview">FetchXML preview (editable)</label>
        <textarea
          id="fetchxml-preview"
          className={validationError ? 'fluent-input invalid' : 'fluent-input'}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
          value={previewXml}
          onChange={handleManualChange}
          rows={6}
          spellCheck={false}
          aria-label="FetchXML filter"
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'fetchxml-error' : undefined}
        />
        {validationError && (
          <span id="fetchxml-error" className="hint-inline" style={{ color: 'var(--error)' }}>
            {validationError}
          </span>
        )}
      </div>
    </div>
  );
}

function mapAttributeType(type: string): string {
  const numericTypes = ['Integer', 'Decimal', 'Double', 'Money', 'BigInt'];
  if (numericTypes.includes(type)) return 'number';
  if (type === 'DateTime') return 'date';
  return 'text';
}

function mapEditorType(type: string): 'text' | 'select' | 'checkbox' {
  if (type === 'Boolean') return 'checkbox';
  if (type === 'Picklist' || type === 'State' || type === 'Status') return 'select';
  return 'text';
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 16,
};

const builderSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text)',
  margin: 0,
};

const emptyStateStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-disabled)',
  fontStyle: 'italic',
};

