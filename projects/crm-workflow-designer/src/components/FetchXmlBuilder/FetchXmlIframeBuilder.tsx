import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

interface FetchXmlIframeBuilderProps {
  clientUrl: string;
  objectTypeCode: number;
  initialFetchXml?: string;
  onError: (error: string) => void;
}

/** Imperative handle: read the current query out of the builder on demand. */
export interface FetchXmlIframeHandle {
  readFetchXml: () => string | null;
}

/**
 * The OOB condition builder (ParticipatingQueryCondition.aspx) exposes a
 * same-origin query control with these two methods. It is reached via
 * `iframe.contentWindow.advFind.parentElement.children.advFind.control` — the
 * page does NOT support postMessage, so we call the control directly. This
 * mirrors the proven qdb_AdvanceFindJs.js technique used on the CRM form.
 */
interface QueryConditionControl {
  set_fetchXml: (fetchXml: string) => void;
  get_fetchXml: () => string | null;
}

const MAX_SEED_ATTEMPTS = 6;
const SEED_RETRY_MS = 2000;

export const FetchXmlIframeBuilder = forwardRef<FetchXmlIframeHandle, FetchXmlIframeBuilderProps>(
  function FetchXmlIframeBuilder({ clientUrl, objectTypeCode, initialFetchXml, onError }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const iframeUrl =
      `${clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
      `?entitytypecode=${objectTypeCode}&readonlymode=false`;

    // Reach the same-origin query-condition control inside the OOB page.
    const resolveControl = useCallback((): QueryConditionControl | null => {
      try {
        const frameWindow = iframeRef.current?.contentWindow as unknown as { advFind?: unknown } | undefined;
        const advFind = frameWindow?.advFind as
          | { parentElement?: { children?: { advFind?: { control?: unknown } } } }
          | undefined;
        const control = advFind?.parentElement?.children?.advFind?.control;
        return isQueryConditionControl(control) ? control : null;
      } catch {
        return null;
      }
    }, []);

    // Seed the builder with the existing FetchXML once its control is ready.
    // The control initialises asynchronously after the iframe loads, so retry.
    useEffect(() => {
      if (!isLoaded) return;
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      // Seeding is best-effort: pre-fill the existing FetchXML once the control
      // exists. If it isn't ready in time we simply leave the builder empty —
      // we do NOT fall back to the manual builder, because the control still
      // initialises shortly after and readFetchXml() reads it on Apply.
      const seed = (): void => {
        const control = resolveControl();
        if (control) {
          if (initialFetchXml) {
            try {
              control.set_fetchXml(initialFetchXml);
            } catch {
              // ignore — start empty
            }
          }
          return;
        }
        if (attempts++ < MAX_SEED_ATTEMPTS) {
          timer = setTimeout(seed, SEED_RETRY_MS);
        }
      };

      seed();
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [isLoaded, initialFetchXml, resolveControl, onError]);

    useImperativeHandle(
      ref,
      () => ({
        readFetchXml: (): string | null => {
          const control = resolveControl();
          if (!control) return null;
          try {
            return control.get_fetchXml() ?? null;
          } catch {
            return null;
          }
        },
      }),
      [resolveControl]
    );

    return (
      <div style={containerStyle}>
        {!isLoaded && <div style={loadingStyle}>Loading CRM condition builder…</div>}
        {/* No sandbox: the builder needs full same-origin CRM capabilities, and
            the control is only reachable when the frame is same-origin. */}
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          style={iframeStyle(isLoaded)}
          title="CRM Advanced Find Condition Builder"
          onLoad={() => setIsLoaded(true)}
          onError={() => onError('Failed to load the CRM condition builder. Falling back to manual builder.')}
        />
      </div>
    );
  }
);

function isQueryConditionControl(value: unknown): value is QueryConditionControl {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QueryConditionControl>;
  return typeof candidate.get_fetchXml === 'function' && typeof candidate.set_fetchXml === 'function';
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: 460,
  position: 'relative',
};

const loadingStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  color: 'var(--text-secondary)',
};

function iframeStyle(isLoaded: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    height: '100%',
    border: '1px solid var(--border)',
    borderRadius: 4,
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.2s',
  };
}
