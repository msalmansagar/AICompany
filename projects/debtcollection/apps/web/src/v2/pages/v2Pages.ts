import type { ComponentType } from 'react';
import type { ViewRequest } from '../V2Workspace.js';
import { V2CasePage } from './case/V2CasePage.js';
import { V2HomePage } from './home/V2HomePage.js';
import { V2QueuePage } from './queue/V2QueuePage.js';
import { V2DeceasedPage, V2DisputesPage, V2LegalPage } from './queue/V2WorkoutQueuePages.js';

/**
 * The routes Workspace V2 draws natively. A route missing here is not missing from V2 — it renders
 * V1's view inside the V2 frame until its V2 page is added.
 */
export type V2Page = ComponentType<{ request: ViewRequest }>;

export const V2_PAGES: Readonly<Record<string, V2Page>> = {
  case: V2CasePage,
  myday: V2HomePage,
  queues: V2QueuePage,
  disputes: V2DisputesPage,
  legal: V2LegalPage,
  claims: V2DeceasedPage,
};
