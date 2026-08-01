// Hands a generated file to the browser as a download.
//
// The object URL is revoked straight after the click: the blob for a large workbook stays in
// memory for the lifetime of the document otherwise, and the designer is a long-lived page.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadWorkbook(buffer: ArrayBuffer, fileName: string): void {
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
