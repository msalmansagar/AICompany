import type { ComponentType } from 'react';
import type { ViewRequest } from '../V2Workspace.js';
import { V2CasePage } from './case/V2CasePage.js';

/**
 * The routes Workspace V2 draws natively. A route missing here is not missing from V2 — it renders
 * V1's view inside the V2 frame until its V2 page is added.
 */
export type V2Page = ComponentType<{ request: ViewRequest }>;

export const V2_PAGES: Readonly<Record<string, V2Page>> = {
  case: V2CasePage,
};
