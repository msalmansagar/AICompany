import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { FetchXmlIframeBuilder, type FetchXmlIframeHandle } from './FetchXmlIframeBuilder';
import { FetchXmlQueryBuilder } from './FetchXmlQueryBuilder';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import type { AttributeOption } from '@/types/WorkflowTypes';

/**
 * The condition builder without any dialog around it.
 *
 * Extracted so it can be embedded in the Route Configuration screen rather than opened
 * as a second modal on top of the first. The path probe, the two builders and the
 * read-on-demand behaviour all live here; the hosts supply their own chrome and decide
 * what to do with the query.
 */

interface ConditionBuilderProps {
  entityLogicalName: string;
  objectTypeCode: number;
  clientUrl: string;
  initialFetchXml?: string;
  /** Raised whenever the builder becomes usable, so a host can gate its Save button. */
  onReadyChange?: (isReady: boolean) => void;
  /** Raised as the manual builder is edited. The iframe is read on demand instead. */
  onChange?: (fetchXml: string) => void;
  height?: number;
}

/** Reads the query out of whichever builder is showing. */
export interface ConditionBuilderHandle {
  read: () => string | null;
}

type BuilderPath = 'probing' | 'iframe' | 'query-builder';

const IFRAME_PROBE_TIMEOUT_MS = 3000;

export const ConditionBuilder = forwardRef<ConditionBuilderHandle, ConditionBuilderProps>(
  function ConditionBuilder(
    { entityLogicalName, objectTypeCode, clientUrl, initialFetchXml, onReadyChange, onChange, height },
    ref
  ) {
    const adapter = useCrmAdapter();
    const [builderPath, setBuilderPath] = useState<BuilderPath>('probing');
    const [currentFetchXml, setCurrentFetchXml] = useState(initialFetchXml ?? '');
    const [attributes, setAttributes] = useState<AttributeOption[]>([]);
    const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const iframeHandleRef = useRef<FetchXmlIframeHandle>(null);

    useEffect(() => {
      setCurrentFetchXml(initialFetchXml ?? '');
      probeIframePath();
      void loadAttributes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityLogicalName, objectTypeCode, clientUrl]);

    function probeIframePath(): void {
      setBuilderPath('probing');
      onReadyChange?.(false);
      const probeUrl =
        `${clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
        `?entitytypecode=${objectTypeCode}&readonlymode=false`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IFRAME_PROBE_TIMEOUT_MS);

      fetch(probeUrl, { method: 'HEAD', credentials: 'include', signal: controller.signal })
        .then((response) => {
          clearTimeout(timeoutId);
          setBuilderPath(response.ok ? 'iframe' : 'query-builder');
          // The manual builder needs nothing further to become usable; the iframe
          // reports its own readiness once the CRM page has actually loaded.
          if (!response.ok) onReadyChange?.(true);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          setBuilderPath('query-builder');
          onReadyChange?.(true);
        });
    }

    async function loadAttributes(): Promise<void> {
      if (!entityLogicalName) return;
      setIsLoadingAttributes(true);
      try {
        setAttributes(await adapter.getAttributes(entityLogicalName));
      } catch {
        setAttributes([]);
      } finally {
        setIsLoadingAttributes(false);
      }
    }

    const handleManualChange = useCallback(
      (xml: string): void => {
        setCurrentFetchXml(xml);
        onChange?.(xml);
      },
      [onChange]
    );

    useImperativeHandle(
      ref,
      () => ({
        read: (): string | null => {
          if (builderPath !== 'iframe') return currentFetchXml;
          return iframeHandleRef.current?.readFetchXml() ?? null;
        },
      }),
      [builderPath, currentFetchXml]
    );

    function handleIframeFailure(message: string): void {
      setNotice(message);
      setBuilderPath('query-builder');
      onReadyChange?.(true);
    }

    return (
      <div>
        {builderPath === 'probing' && (
          <div className="empty-state" style={{ minHeight: height ?? 320 }}>
            <span className="spinner" />
            <span>Loading the condition builder…</span>
          </div>
        )}

        {builderPath === 'iframe' && (
          <FetchXmlIframeBuilder
            ref={iframeHandleRef}
            clientUrl={clientUrl}
            objectTypeCode={objectTypeCode}
            initialFetchXml={initialFetchXml}
            onError={handleIframeFailure}
            onLoadedChange={(loaded) => onReadyChange?.(loaded)}
          />
        )}

        {builderPath === 'query-builder' &&
          (isLoadingAttributes ? (
            <div className="empty-state" style={{ minHeight: height ?? 320 }}>
              <span className="spinner" />
              <span>Loading fields…</span>
            </div>
          ) : (
            <FetchXmlQueryBuilder
              attributes={attributes}
              initialFetchXml={initialFetchXml}
              onChange={handleManualChange}
            />
          ))}

        {notice && (
          <div className="notice" style={{ marginTop: 8 }} role="status">
            {notice}
          </div>
        )}
      </div>
    );
  }
);
