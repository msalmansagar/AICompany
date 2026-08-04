// Section stepping for a tab that reveals its sections one at a time (mobile).
//
// Mirrors frontend/src/components/forms/scopedButtonNavigation.ts. Kept pure — no React, no
// react-hook-form — so the stepping and the gate are tested without a renderer.

import type { SectionDefinition, TabDefinition } from '@qdb/shared';

interface RuleMaps {
  visibilityMap: Map<string, boolean>;
  requiredMap: Map<string, boolean>;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Sections of a tab that a rule has not hidden, in display order. */
export function visibleSectionsOf(tab: TabDefinition, ruleState: RuleMaps): SectionDefinition[] {
  return [...tab.sections]
    .filter((section) => {
      const key = section.sectionId;
      return ruleState.visibilityMap.has(key) ? ruleState.visibilityMap.get(key) === true : true;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * The single section to show, as a list so the caller renders it the same way it renders all of
 * them. Clamped: a rule can hide the section the user is standing on, which would otherwise
 * leave the index past the end and render a tab with no content and no way forward.
 */
export function sectionsToRender(
  tab: TabDefinition,
  ruleState: RuleMaps,
  activeSectionIndex: number,
): SectionDefinition[] {
  const visible = visibleSectionsOf(tab, ruleState);
  if (!tab.revealsSectionsOneAtATime) return visible;
  if (visible.length === 0) return [];
  return [visible[Math.min(Math.max(activeSectionIndex, 0), visible.length - 1)]];
}

/**
 * Index to step to, or null when there is no visible section in that direction. Sections a rule
 * has hidden are stepped over in both directions.
 */
export function nextSectionIndex(
  tab: TabDefinition,
  ruleState: RuleMaps,
  activeSectionIndex: number,
  direction: 1 | -1,
): number | null {
  const visible = visibleSectionsOf(tab, ruleState);
  const target = activeSectionIndex + direction;
  return target >= 0 && target < visible.length ? target : null;
}

/**
 * True when every visible, required field in the section has a value.
 *
 * A field a rule has hidden never blocks, even when marked required — the user cannot fill in
 * what they cannot see. A field a rule has made required does block.
 */
export function isSectionComplete(
  section: SectionDefinition,
  values: Record<string, unknown>,
  ruleState: RuleMaps,
): boolean {
  for (const field of section.fields) {
    const key = field.fieldKey;
    const visible = ruleState.visibilityMap.has(key)
      ? ruleState.visibilityMap.get(key) === true
      : field.isVisibleDefault;
    const required = ruleState.requiredMap.has(key)
      ? ruleState.requiredMap.get(key) === true
      : field.isRequiredDefault;
    if (visible && required && !isFilled(values[key])) return false;
  }
  return true;
}
