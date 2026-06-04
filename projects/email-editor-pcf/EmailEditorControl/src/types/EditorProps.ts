/**
 * EditorProps.ts
 * Shared prop interfaces for the email editor component tree.
 */

import { MetadataService } from '../services/MetadataService';
import { Logger } from '../services/Logger';

export interface EmailEditorProps {
  readonly value: string;
  readonly rootEntityLogicalName: string;
  readonly sampleRecordId: string | null;
  readonly maxRelationshipDepth: number;
  readonly metadataService: MetadataService;
  readonly logger: Logger;
  readonly onChange: (next: string) => void;
}

export type PopupMode = 'field' | 'each' | 'if';

export interface PopupState {
  readonly open: boolean;
  readonly anchor: { readonly x: number; readonly y: number } | null;
  /** Breadcrumb of entity logical names walked so far */
  readonly entityPath: readonly string[];
  /** The Range covering the "." character that triggered the popup */
  readonly triggerRange: Range | null;
  readonly mode: PopupMode;
}

export const CLOSED_POPUP: PopupState = {
  open: false,
  anchor: null,
  entityPath: [],
  triggerRange: null,
  mode: 'field'
};
