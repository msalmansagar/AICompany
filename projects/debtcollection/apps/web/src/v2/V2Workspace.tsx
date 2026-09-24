import { useWorkspaceVersion } from './version/WorkspaceVersionRoot.js';

/**
 * Workspace V2 — the redesigned presentation, under review beside V1.
 *
 * Everything V2 draws sits inside `.dcp-v2`, which is where its styles and tokens are scoped, so
 * nothing here can restyle V1. It reads through the same session, data modules, services and domain
 * as V1; it is a second presentation, never a second implementation.
 */
export function V2Workspace() {
  const { switchTo } = useWorkspaceVersion();
  return (
    <div className="dcp-v2" data-workspace-version="v2" data-testid="workspace-v2">
      <button type="button" className="v2-btn" onClick={() => switchTo('v1')} data-testid="switch-to-v1">
        Switch to V1
      </button>
    </div>
  );
}
