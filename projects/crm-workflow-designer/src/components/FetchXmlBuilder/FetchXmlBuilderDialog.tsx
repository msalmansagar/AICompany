import { useState, useRef } from 'react';
import { ConditionBuilder, type ConditionBuilderHandle } from './ConditionBuilder';
import { validateFetchXml } from './fetchXmlFormatter';
import { hasRealCondition } from '@/services/routeFilter';

/**
 * The condition builder as a standalone dialog, for editing an existing route's query.
 *
 * The builder itself lives in ConditionBuilder, shared with the Route Configuration
 * screen. This file is the dialog chrome and the rules about what may be applied.
 */

interface FetchXmlBuilderDialogProps {
  open: boolean;
  entityLogicalName: string;
  objectTypeCode: number;
  clientUrl: string;
  initialFetchXml?: string;
  onApply: (fetchXml: string) => void;
  onDismiss: () => void;
}

export function FetchXmlBuilderDialog({
  open,
  entityLogicalName,
  objectTypeCode,
  clientUrl,
  initialFetchXml,
  onApply,
  onDismiss,
}: FetchXmlBuilderDialogProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const builderRef = useRef<ConditionBuilderHandle>(null);

  function handleApply(): void {
    // The iframe builder holds the live query inside the CRM control, so it is read
    // on demand rather than tracked as it changes.
    const fetchXml = builderRef.current?.read() ?? null;
    if (fetchXml === null) {
      setValidationError('Could not read the condition from the CRM builder. Add at least one condition, or switch to the manual builder.');
      return;
    }

    const error = validateFetchXml(fetchXml);
    if (error) {
      setValidationError(error);
      return;
    }

    // The engine rejects a non-fallback route whose filter carries no condition, so
    // the same rule is applied here with a message that says what to do about it.
    if (!hasRealCondition(fetchXml)) {
      setValidationError('Add at least one condition (choose a field, operator and value) before applying — or Cancel to keep this a fallback route.');
      return;
    }

    onApply(fetchXml);
    onDismiss();
  }

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div
        className="dialog"
        style={{ width: 'min(900px, 92vw)' }}
        role="dialog"
        aria-modal="true"
        aria-label="FetchXML filter builder"
      >
        <div className="dialog-head">
          <h2>FetchXML filter builder</h2>
        </div>

        <div className="dialog-body">
          <ConditionBuilder
            ref={builderRef}
            entityLogicalName={entityLogicalName}
            objectTypeCode={objectTypeCode}
            clientUrl={clientUrl}
            initialFetchXml={initialFetchXml}
            onReadyChange={setIsReady}
            onChange={() => setValidationError(null)}
          />

          {validationError && (
            <div className="notice error" style={{ marginTop: 10 }} role="alert">
              {validationError}
            </div>
          )}
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onDismiss}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={handleApply} disabled={!isReady}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
