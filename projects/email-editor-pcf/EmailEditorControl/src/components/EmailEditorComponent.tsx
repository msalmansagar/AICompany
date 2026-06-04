/**
 * EmailEditorComponent.tsx
 * Root React component for the Email Editor PCF control.
 * Owns the popup state machine and wires together:
 *   EditorSurface ↔ FieldSelectorPopup ↔ PreviewPane
 */

import * as React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { EditorSurface } from './EditorSurface';
import { FieldSelectorPopup } from './FieldSelectorPopup';
import { PreviewPane } from './PreviewPane';
import { useEditorCursor } from '../hooks/useEditorCursor';
import { TokenEngine } from '../token/TokenEngine';
import { CLOSED_POPUP, EmailEditorProps, PopupState } from '../types/EditorProps';

export const EmailEditorComponent: React.FC<EmailEditorProps> = (props) => {
  const {
    value,
    rootEntityLogicalName,
    sampleRecordId,
    maxRelationshipDepth,
    metadataService,
    logger,
    onChange
  } = props;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [popup, setPopup] = useState<PopupState>(CLOSED_POPUP);
  const cursor = useEditorCursor(surfaceRef);
  const engine = useMemo(() => new TokenEngine(logger), [logger]);

  // ── Popup open ──────────────────────────────────────────────────────────

  const openPopup = useCallback(
    (triggerRange: Range) => {
      const rect = triggerRange.getBoundingClientRect();
      setPopup({
        open: true,
        anchor: { x: rect.left, y: rect.bottom + 4 },
        entityPath: [rootEntityLogicalName],
        triggerRange,
        mode: 'field'
      });
    },
    [rootEntityLogicalName]
  );

  const closePopup = useCallback(() => setPopup(CLOSED_POPUP), []);

  // ── Dot typed in editor ─────────────────────────────────────────────────

  const handleDotTyped = useCallback(
    (triggerRange: Range) => {
      cursor.saveSelection();
      openPopup(triggerRange);
    },
    [cursor, openPopup]
  );

  // ── Field selected from popup ───────────────────────────────────────────

  const handleFieldSelected = useCallback(
    (tokenSource: string) => {
      if (!popup.triggerRange) return;

      // Replace the "." that triggered the popup with the full token
      cursor.replaceRangeWithText(popup.triggerRange, tokenSource);

      const next = surfaceRef.current?.innerText ?? '';
      onChange(next);
      closePopup();
    },
    [popup.triggerRange, cursor, onChange, closePopup]
  );

  // ── Editor content change ───────────────────────────────────────────────

  const handleSurfaceChange = useCallback(
    (next: string) => onChange(next),
    [onChange]
  );

  // ── Popup drill navigation ──────────────────────────────────────────────

  const handleDrillDown = useCallback(
    (entityLogicalName: string) => {
      setPopup((prev) => ({
        ...prev,
        entityPath: [...prev.entityPath, entityLogicalName]
      }));
    },
    []
  );

  const handleDrillUp = useCallback(() => {
    setPopup((prev) => {
      if (prev.entityPath.length <= 1) return prev;
      return { ...prev, entityPath: prev.entityPath.slice(0, -1) };
    });
  }, []);

  // ── Validation banner ───────────────────────────────────────────────────

  const parseErrors = useMemo(() => engine.validate(value), [engine, value]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: '100%',
        fontFamily: 'Segoe UI, sans-serif',
        position: 'relative'
      }}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: '#605e5c' }}>
          Type <strong>.</strong> to insert a dynamic field token
        </span>
        {parseErrors.length > 0 && (
          <span
            style={{
              fontSize: '11px',
              color: '#a4262c',
              backgroundColor: '#fde7e9',
              padding: '2px 8px',
              borderRadius: '2px'
            }}
          >
            {parseErrors.length} template error{parseErrors.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Editor surface */}
      <EditorSurface
        ref={surfaceRef}
        value={value}
        onChange={handleSurfaceChange}
        onDotTyped={handleDotTyped}
        onEscape={closePopup}
      />

      {/* Field picker popup — portal-style, position:fixed */}
      {popup.open && popup.anchor && (
        <FieldSelectorPopup
          anchor={popup.anchor}
          entityPath={popup.entityPath}
          metadataService={metadataService}
          mode={popup.mode}
          maxDepth={maxRelationshipDepth}
          onDrillDown={handleDrillDown}
          onDrillUp={handleDrillUp}
          onSelect={handleFieldSelected}
          onClose={closePopup}
        />
      )}

      {/* Preview pane (collapsible) */}
      <PreviewPane
        template={value}
        rootEntity={rootEntityLogicalName}
        sampleRecordId={sampleRecordId}
        engine={engine}
        metadataService={metadataService}
      />
    </div>
  );
};
