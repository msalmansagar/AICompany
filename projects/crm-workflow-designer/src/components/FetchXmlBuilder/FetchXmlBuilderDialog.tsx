import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Button,
  Spinner,
} from '@fluentui/react-components';
import { FetchXmlIframeBuilder, type FetchXmlIframeHandle } from './FetchXmlIframeBuilder';
import { FetchXmlQueryBuilder } from './FetchXmlQueryBuilder';
import { validateFetchXml } from './fetchXmlFormatter';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import type { AttributeOption } from '@/types/WorkflowTypes';

interface FetchXmlBuilderDialogProps {
  open: boolean;
  entityLogicalName: string;
  objectTypeCode: number;
  clientUrl: string;
  initialFetchXml?: string;
  onApply: (fetchXml: string) => void;
  onDismiss: () => void;
}

type BuilderPath = 'probing' | 'iframe' | 'query-builder';

const IFRAME_PROBE_TIMEOUT_MS = 3000;

export function FetchXmlBuilderDialog({
  open,
  entityLogicalName,
  objectTypeCode,
  clientUrl,
  initialFetchXml,
  onApply,
  onDismiss,
}: FetchXmlBuilderDialogProps) {
  const adapter = useCrmAdapter();
  const [builderPath, setBuilderPath] = useState<BuilderPath>('probing');
  const [currentFetchXml, setCurrentFetchXml] = useState(initialFetchXml ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<AttributeOption[]>([]);
  const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);
  const iframeHandleRef = useRef<FetchXmlIframeHandle>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentFetchXml(initialFetchXml ?? '');
    probeIframePath();
    loadAttributes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function probeIframePath(): void {
    setBuilderPath('probing');
    const probeUrl =
      `${clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
      `?entitytypecode=${objectTypeCode}&readonlymode=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IFRAME_PROBE_TIMEOUT_MS);

    fetch(probeUrl, {
      method: 'HEAD',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);
        setBuilderPath(response.ok ? 'iframe' : 'query-builder');
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setBuilderPath('query-builder');
      });
  }

  async function loadAttributes(): Promise<void> {
    if (!entityLogicalName) return;
    setIsLoadingAttributes(true);
    try {
      const attrs = await adapter.getAttributes(entityLogicalName);
      setAttributes(attrs);
    } catch {
      setAttributes([]);
    } finally {
      setIsLoadingAttributes(false);
    }
  }

  const handleFetchXmlChange = useCallback((xml: string): void => {
    setCurrentFetchXml(xml);
    const error = validateFetchXml(xml);
    setValidationError(error);
  }, []);

  function handleApply(): void {
    // The iframe builder holds the live query in the CRM control — read it on
    // demand. The manual builder keeps currentFetchXml current via onChange.
    let fetchXml = currentFetchXml;
    if (builderPath === 'iframe') {
      const read = iframeHandleRef.current?.readFetchXml() ?? null;
      if (read === null) {
        setValidationError('Could not read the condition from the CRM builder. Add at least one condition, or switch to the manual builder.');
        return;
      }
      fetchXml = read;
    }

    const error = validateFetchXml(fetchXml);
    if (error) {
      setValidationError(error);
      return;
    }
    onApply(fetchXml);
    onDismiss();
  }

  function handleIframeError(error: string): void {
    setValidationError(error);
    setBuilderPath('query-builder');
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onDismiss(); }}>
      <DialogSurface style={dialogSurfaceStyle}>
        <DialogTitle>FetchXML Filter Builder</DialogTitle>
        <DialogBody>
          {builderPath === 'probing' && (
            <div style={centerStyle}>
              <Spinner size="medium" label="Detecting available builder..." />
            </div>
          )}

          {builderPath === 'iframe' && (
            <FetchXmlIframeBuilder
              ref={iframeHandleRef}
              clientUrl={clientUrl}
              objectTypeCode={objectTypeCode}
              initialFetchXml={currentFetchXml}
              onError={handleIframeError}
            />
          )}

          {builderPath === 'query-builder' && (
            isLoadingAttributes ? (
              <div style={centerStyle}>
                <Spinner size="small" label="Loading entity attributes..." />
              </div>
            ) : (
              <FetchXmlQueryBuilder
                attributes={attributes}
                initialFetchXml={currentFetchXml}
                onChange={handleFetchXmlChange}
              />
            )
          )}

          {validationError && (
            <p style={errorStyle} role="alert">
              {validationError}
            </p>
          )}
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            onClick={handleApply}
            disabled={!!validationError || builderPath === 'probing'}
          >
            Apply
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}

const dialogSurfaceStyle: React.CSSProperties = {
  width: '700px',
  maxWidth: '90vw',
};

const centerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: 32,
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: 12,
  marginTop: 8,
};
