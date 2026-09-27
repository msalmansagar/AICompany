import { describe, it, expect, beforeEach } from 'vitest';
import { onStepPanelTabRequest, requestStepPanelTab, resetStepPanelBus } from './stepPanelBus';
import type { RequestablePanelTab } from './stepPanelBus';

describe('stepPanelBus', () => {
  beforeEach(() => resetStepPanelBus());

  it('should_deliver_a_request_to_the_mounted_panel', () => {
    const received: RequestablePanelTab[] = [];
    onStepPanelTabRequest((tab) => received.push(tab));
    requestStepPanelTab('assignment');
    expect(received).toEqual(['assignment']);
  });

  it('should_buffer_a_request_made_before_the_panel_mounts', () => {
    // The toolbar selects the step and asks for a tab in the same click —
    // the panel mounts one render later and must still land on that tab.
    requestStepPanelTab('sla');
    const received: RequestablePanelTab[] = [];
    onStepPanelTabRequest((tab) => received.push(tab));
    expect(received).toEqual(['sla']);
    // Consumed once — a remount must not replay it.
    const later: RequestablePanelTab[] = [];
    onStepPanelTabRequest((tab) => later.push(tab));
    expect(later).toEqual([]);
  });

  it('should_stop_delivering_after_unsubscribe', () => {
    const received: RequestablePanelTab[] = [];
    const unsubscribe = onStepPanelTabRequest((tab) => received.push(tab));
    unsubscribe();
    requestStepPanelTab('overview');
    expect(received).toEqual([]);
    // …and the missed request waits for the next panel.
    const next: RequestablePanelTab[] = [];
    onStepPanelTabRequest((tab) => next.push(tab));
    expect(next).toEqual(['overview']);
  });

  it('should_let_a_newer_subscriber_replace_an_older_one', () => {
    const first: RequestablePanelTab[] = [];
    const second: RequestablePanelTab[] = [];
    onStepPanelTabRequest((tab) => first.push(tab));
    onStepPanelTabRequest((tab) => second.push(tab));
    requestStepPanelTab('automation');
    expect(first).toEqual([]);
    expect(second).toEqual(['automation']);
  });
});
