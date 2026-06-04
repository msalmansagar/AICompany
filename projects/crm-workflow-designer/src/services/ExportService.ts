import { toPng, toSvg } from 'html-to-image';
import type { WorkflowDesignerState } from '@/store/workflowStore';

export class ExportService {
  exportJson(
    state: Pick<WorkflowDesignerState, 'process' | 'steps' | 'outcomes' | 'routes' | 'nodePositions'>
  ): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      process: state.process,
      steps: Object.values(state.steps),
      outcomes: Object.values(state.outcomes),
      routes: Object.values(state.routes),
      nodePositions: state.nodePositions,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `workflow-${state.process?.name ?? 'export'}.json`);
  }

  async exportPng(element: HTMLElement): Promise<void> {
    const dataUrl = await toPng(element, { cacheBust: true, pixelRatio: 2 });
    triggerDataUrlDownload(dataUrl, 'workflow-diagram.png');
  }

  async exportSvg(element: HTMLElement): Promise<void> {
    const dataUrl = await toSvg(element, { cacheBust: true });
    triggerDataUrlDownload(dataUrl, 'workflow-diagram.svg');
  }

  async exportPdf(element: HTMLElement): Promise<void> {
    const [jspdfModule, imageDataUrl] = await Promise.all([
      import('jspdf'),
      toPng(element, { cacheBust: true, pixelRatio: 2 }),
    ]);

    const { default: JsPDF } = jspdfModule;
    const pdf = new JsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imageDataUrl, 'PNG', 0, 0, pageWidth, pageHeight, '', 'FAST');
    pdf.save('workflow-diagram.pdf');
  }
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function triggerDataUrlDownload(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
