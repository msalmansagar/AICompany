import { useCallback } from 'react';
import { ExportService } from '@/services/ExportService';
import { useWorkflowStore } from '@/store/workflowStore';

const exportService = new ExportService();

export function useExport() {
  const state = useWorkflowStore((s) => ({
    process: s.process,
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    nodePositions: s.nodePositions,
  }));

  const exportJson = useCallback(() => {
    exportService.exportJson(state);
  }, [state]);

  const exportPng = useCallback(async (element: HTMLElement) => {
    await exportService.exportPng(element);
  }, []);

  const exportSvg = useCallback(async (element: HTMLElement) => {
    await exportService.exportSvg(element);
  }, []);

  const exportPdf = useCallback(async (element: HTMLElement) => {
    await exportService.exportPdf(element);
  }, []);

  return { exportJson, exportPng, exportSvg, exportPdf };
}
