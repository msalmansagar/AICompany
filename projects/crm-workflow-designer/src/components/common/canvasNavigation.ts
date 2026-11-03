import type { ReactFlowInstance } from '@xyflow/react';

type CameraApi = Pick<ReactFlowInstance, 'getNode' | 'setCenter' | 'getZoom'>;

/**
 * Pans the camera to a node at reading zoom. Selection is the caller's job —
 * the camera move is the same whether it came from search, the validation
 * panel's stepping, a route's target link, or anything else that says
 * "show me this step".
 *
 * The move starts on a short delay: callers select the node in the same
 * click, and the selection re-render landing mid-animation intermittently
 * cancelled the d3 transition — the camera simply never moved (CWFD-019
 * PR3; the validation stepper had the same latent flake). Letting the
 * commit finish first makes the pan reliable, and 60ms before a 400ms
 * glide is imperceptible.
 */
export function centerOnNode(rf: CameraApi, nodeId: string): boolean {
  const node = rf.getNode(nodeId);
  if (!node) return false;
  const width = node.measured?.width ?? 280;
  const height = node.measured?.height ?? 100;
  window.setTimeout(() => {
    void rf.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: Math.max(rf.getZoom(), 0.9),
      duration: 400,
    });
  }, 60);
  return true;
}
