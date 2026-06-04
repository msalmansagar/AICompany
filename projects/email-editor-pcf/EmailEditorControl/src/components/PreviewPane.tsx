/**
 * PreviewPane.tsx
 * Renders the template against a sample record fetched from Dataverse.
 * Displays resolved token values inline — errors shown as highlighted spans.
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import { MetadataService } from '../services/MetadataService';
import { TokenEngine } from '../token/TokenEngine';
import { RenderContext } from '../token/TokenTypes';

export interface PreviewPaneProps {
  readonly template: string;
  readonly rootEntity: string;
  readonly sampleRecordId: string | null;
  readonly engine: TokenEngine;
  readonly metadataService: MetadataService;
}

type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly html: string };

export const PreviewPane: React.FC<PreviewPaneProps> = (props) => {
  const { template, rootEntity, sampleRecordId, engine, metadataService } = props;
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sampleRecordId || !rootEntity || !template.trim()) {
      setPreview({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setPreview({ status: 'loading' });

    (async () => {
      try {
        const entity = await metadataService.getEntity(rootEntity);
        const record = await metadataService.fetchRecord(
          entity.EntitySetName,
          sampleRecordId,
          [],
          []
        );

        if (cancelled) return;

        const context: RenderContext = {
          root: record,
          locale: navigator.language || 'en',
          currency: 'USD'
        };

        const rendered = engine.renderSource(template, context);
        setPreview({ status: 'ready', html: rendered });
      } catch (err) {
        if (!cancelled) {
          setPreview({
            status: 'error',
            message: err instanceof Error ? err.message : 'preview_failed'
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [template, rootEntity, sampleRecordId, engine, metadataService]);

  if (!sampleRecordId) return null;

  const containerStyle: React.CSSProperties = {
    marginTop: '8px',
    border: '1px solid #edebe9',
    borderRadius: '2px',
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: '13px'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    backgroundColor: '#f3f2f1',
    cursor: 'pointer',
    userSelect: 'none'
  };

  const bodyStyle: React.CSSProperties = {
    padding: '10px 12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: '#323130',
    maxHeight: '300px',
    overflowY: 'auto'
  };

  return (
    <div style={containerStyle}>
      <div
        style={headerStyle}
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((x) => !x); }}
      >
        <span>Preview {expanded ? '▲' : '▼'}</span>
        {preview.status === 'loading' && <span style={{ color: '#605e5c' }}>Loading…</span>}
        {preview.status === 'error' && <span style={{ color: '#a4262c' }}>Error</span>}
      </div>

      {expanded && (
        <div style={bodyStyle}>
          {preview.status === 'idle' && (
            <span style={{ color: '#605e5c' }}>
              No sample record configured. Set the sampleRecordId property.
            </span>
          )}
          {preview.status === 'loading' && (
            <span style={{ color: '#605e5c' }}>Fetching sample record…</span>
          )}
          {preview.status === 'error' && (
            <span style={{ color: '#a4262c' }}>{preview.message}</span>
          )}
          {preview.status === 'ready' && (
            /* Preview output is already HTML-escaped by the TokenRenderer.
               We set dangerouslySetInnerHTML here intentionally for rendered preview only.
               The template source is stored as plain text in the bound field — not rendered in UCI. */
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          )}
        </div>
      )}
    </div>
  );
};
