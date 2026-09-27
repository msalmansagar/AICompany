import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceVersionRoot, useWorkspaceVersion } from '../v2/version/WorkspaceVersionRoot.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';

/**
 * One web resource, two presentations — and V1 is never lost.
 *
 * The two workspaces are stand-ins here, each with its own switch, so what is tested is the root's
 * contract: which one opens, that switching works both ways in place, that the choice survives a
 * reload, and that a failing V2 leaves V1 in front of the user.
 */

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function V1() {
  const { switchTo } = useWorkspaceVersion();
  return <div data-testid="v1">V1<button type="button" onClick={() => switchTo('v2')}>to v2</button></div>;
}

function V2() {
  const { switchTo } = useWorkspaceVersion();
  return <div data-testid="v2">V2<button type="button" onClick={() => switchTo('v1')}>to v1</button></div>;
}

function Broken(): never {
  throw new Error('V2 failed to render');
}

function renderRoot(options: { search?: string; storage?: Storage; broken?: boolean } = {}) {
  const storage = options.storage ?? memoryStorage();
  render(
    <WorkspaceVersionRoot
      search={options.search ?? ''}
      storage={storage}
      renderV1={() => <V1 />}
      renderV2={() => (options.broken ? <Broken /> : <V2 />)}
    />,
  );
  return storage;
}

afterEach(cleanup);

describe('opening the workspace', () => {
  it('opens V1 by default', () => {
    renderRoot();

    expect(screen.getByTestId('v1')).toBeTruthy();
  });

  it('opens V2 when the URL asks for it, and remembers it', () => {
    const storage = renderRoot({ search: '?ui=v2' });

    expect([Boolean(screen.queryByTestId('v2')), storage.getItem(VERSION_STORAGE_KEY)]).toEqual([true, 'v2']);
  });

  it('opens V1 for an invalid version', () => {
    renderRoot({ search: '?ui=v7' });

    expect(screen.getByTestId('v1')).toBeTruthy();
  });

  it('opens V1 for an invalid saved preference', () => {
    renderRoot({ storage: memoryStorage({ [VERSION_STORAGE_KEY]: 'beta' }) });

    expect(screen.getByTestId('v1')).toBeTruthy();
  });
});

describe('switching', () => {
  it('goes from V1 to V2 in place', async () => {
    renderRoot();

    await userEvent.click(screen.getByText('to v2'));

    expect([Boolean(screen.queryByTestId('v2')), Boolean(screen.queryByTestId('v1'))]).toEqual([true, false]);
  });

  it('goes from V2 back to V1 in place', async () => {
    renderRoot({ search: '?ui=v2' });

    await userEvent.click(screen.getByText('to v1'));

    expect([Boolean(screen.queryByTestId('v1')), Boolean(screen.queryByTestId('v2'))]).toEqual([true, false]);
  });

  it('keeps the choice across a reload', async () => {
    const storage = renderRoot();
    await userEvent.click(screen.getByText('to v2'));
    cleanup();

    renderRoot({ storage });

    expect(screen.getByTestId('v2')).toBeTruthy();
  });
});

describe('a V2 that fails', () => {
  it('shows V1 instead, and says why', () => {
    renderRoot({ search: '?ui=v2', broken: true });

    expect([Boolean(screen.queryByTestId('v1')), Boolean(screen.queryByTestId('v2-fallback-notice'))])
      .toEqual([true, true]);
  });
});
