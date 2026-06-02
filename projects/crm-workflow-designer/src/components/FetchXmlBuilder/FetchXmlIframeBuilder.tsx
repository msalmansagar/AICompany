import { useEffect, useRef, useState } from 'react';
import { validateFetchXml } from './fetchXmlFormatter';

interface FetchXmlIframeBuilderProps {
  clientUrl: string;
  objectTypeCode: number;
  initialFetchXml?: string;
  onChange: (fetchXml: string) => void;
  onError: (error: string) => void;
}

export function FetchXmlIframeBuilder({
  clientUrl,
  objectTypeCode,
  initialFetchXml,
  onChange,
  onError,
}: FetchXmlIframeBuilderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const iframeUrl =
    `${clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx` +
    `?entitytypecode=${objectTypeCode}&readonlymode=false`;

  useEffect(() => {
    if (!isLoaded || !initialFetchXml || !iframeRef.current?.contentWindow) return;

    try {
      iframeRef.current.contentWindow.postMessage(
        { type: 'SET_FETCHXML', fetchXml: initialFetchXml },
        clientUrl
      );
    } catch {
      // If postMessage fails, the iframe builder will start empty
    }
  }, [isLoaded, initialFetchXml, clientUrl]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      // Security: validate origin before accepting message
      if (event.origin !== clientUrl) return;

      const data = event.data as { type?: string; fetchXml?: string } | undefined;
      if (!data || data.type !== 'FETCHXML_UPDATED') return;

      const fetchXml = data.fetchXml ?? '';
      const validationError = validateFetchXml(fetchXml);
      if (validationError) {
        onError(`FetchXML from CRM builder is invalid: ${validationError}`);
        return;
      }

      onChange(fetchXml);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clientUrl, onChange, onError]);

  function handleIframeLoad(): void {
    setIsLoaded(true);
  }

  function handleIframeError(): void {
    onError('Failed to load CRM Advanced Filter page. Falling back to manual builder.');
  }

  return (
    <div style={containerStyle}>
      {!isLoaded && (
        <div style={loadingStyle}>
          Loading CRM filter builder...
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        style={iframeStyle(isLoaded)}
        title="CRM Advanced Filter Builder"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: 400,
  position: 'relative',
};

const loadingStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  color: '#6b7280',
};

function iframeStyle(isLoaded: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.2s',
  };
}
