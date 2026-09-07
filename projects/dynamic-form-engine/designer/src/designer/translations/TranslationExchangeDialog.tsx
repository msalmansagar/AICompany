// Download the translation workbook for a form, and read a filled one back.
//
// Import is deliberately two steps. The check runs the same code as the apply with writing
// switched off, so the translator sees exactly what would change — and a workbook whose keys
// no longer resolve is refused here rather than half-applied.

import React, { useCallback, useContext, useRef, useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, ArrowUpload24Regular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import {
  createTranslationImportService,
  UnresolvedRecordsError,
  type ImportSummary,
} from '@/services/translations/TranslationImportService';
import type { ParsedTranslationWorkbook } from '@/services/translations/translationWorkbookParser';
import type { TranslationExport } from '@/services/translations/TranslationExportService';
import { downloadWorkbook } from '@/utils/downloadFile';

// exceljs is around a megabyte and only the two modules below pull it in. Loading them on
// demand keeps it out of the designer's first paint, which every user pays for, and into a
// chunk fetched by the few who open this dialog.
// The workbook code is split out so exceljs (~940 KB) stays out of the main bundle.
// In CRM every chunk is a SEPARATE web resource, so an environment whose solution
// predates this feature — or whose import was partial — simply does not have the
// file, and the dynamic import fails with a bare "Failed to fetch dynamically
// imported module: <url>". That names a URL and no cause, which is not something a
// maker can act on. These say what is actually missing and what to do about it.
const EXPORTER_WEB_RESOURCE = 'qdb_/form-designer/assets/TranslationExportService.js';
const PARSER_WEB_RESOURCE = 'qdb_/form-designer/assets/translationWorkbookParser.js';

async function loadChunk<T>(load: () => Promise<T>, webResourceName: string): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `This environment is missing the web resource "${webResourceName}", which the ` +
        `translation workbook needs. Import and publish the current Form Designer ` +
        `solution, then reload this page. (${detail})`,
    );
  }
}

const loadExporter = () =>
  loadChunk(() => import('@/services/translations/TranslationExportService'), EXPORTER_WEB_RESOURCE);
const loadParser = () =>
  loadChunk(() => import('@/services/translations/translationWorkbookParser'), PARSER_WEB_RESOURCE);

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  hint: { color: tokens.colorNeutralForeground3 },
  list: { margin: 0, paddingLeft: '20px' },
});

export interface TranslationExchangeDialogProps {
  isOpen: boolean;
  formId: string;
  formCode: string;
  onClose: () => void;
  /**
   * Routes into the normal publish flow. Importing only writes translation records — the
   * runtime keeps serving the JSON generated at the last publish until the form is published
   * again, which is the step that regenerates it for every language.
   */
  onPublish: () => void;
}

export function TranslationExchangeDialog({
  isOpen,
  formId,
  formCode,
  onClose,
  onPublish,
}: TranslationExchangeDialogProps): React.ReactElement {
  const styles = useStyles();
  const crm = useContext(CrmContext);
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<readonly string[]>([]);
  const [exported, setExported] = useState<TranslationExport | null>(null);
  const [pending, setPending] = useState<ParsedTranslationWorkbook | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [checked, setChecked] = useState<ImportSummary | null>(null);
  const [applied, setApplied] = useState<ImportSummary | null>(null);

  const run = useCallback(async (label: string, work: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setError(null);
    setUnresolved([]);
    try {
      await work();
    } catch (thrown) {
      if (thrown instanceof UnresolvedRecordsError) setUnresolved(thrown.unresolved);
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(null);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!crm) return;
    void run('Building workbook…', async () => {
      const { createTranslationExportService } = await loadExporter();
      const result = await createTranslationExportService(crm.getWebApi()).exportForm(formId, formCode);
      downloadWorkbook(result.buffer, result.fileName);
      setExported(result);
    });
  }, [crm, formId, formCode, run]);

  const handleFileChosen = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setChecked(null);
      setApplied(null);
      setFileName(file.name);

      void run('Reading workbook…', async () => {
        const { parseTranslationWorkbook } = await loadParser();
        setPending(await parseTranslationWorkbook(await file.arrayBuffer()));
      });
    },
    [run],
  );

  const runImport = useCallback(
    (dryRun: boolean) => {
      if (!crm || !pending) return;
      void run(dryRun ? 'Checking…' : 'Applying…', async () => {
        const summary = await createTranslationImportService(crm.getWebApi()).apply(pending, { dryRun });
        if (dryRun) setChecked(summary);
        else setApplied(summary);
      });
    },
    [crm, pending, run],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Translations — {formCode}</DialogTitle>
          <DialogContent>
            {busy && <Spinner size="tiny" label={busy} />}

            {error && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {error}
                  {unresolved.length > 0 && (
                    <ul className={styles.list}>
                      {unresolved.slice(0, 10).map((entry) => (
                        <li key={entry}><Text size={200}>{entry}</Text></li>
                      ))}
                    </ul>
                  )}
                </MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.section}>
              <Text weight="semibold">1 — Download</Text>
              <Text size={200} className={styles.hint}>
                One row per translatable string, one column per language. The key columns are
                locked; fill in the language columns only.
              </Text>
              <div className={styles.row}>
                <Button
                  appearance="primary"
                  icon={<ArrowDownload24Regular />}
                  onClick={handleExport}
                  disabled={busy !== null || !crm}
                >
                  Download workbook
                </Button>
              </div>
              {exported && <ExportReport result={exported} />}
            </div>

            <div className={styles.section}>
              <Text weight="semibold">2 — Upload the filled workbook</Text>
              <Text size={200} className={styles.hint}>
                A blank cell is left alone — importing never deletes a translation.
              </Text>
              <div className={styles.row}>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChosen}
                  // Clearing the value first means picking the SAME path again still fires
                  // change. Without it, a translator who edits their file and re-picks it is
                  // silently checked against the copy read the first time.
                  onClick={(event) => { event.currentTarget.value = ''; }}
                  style={{ display: 'none' }}
                  aria-label="Filled translation workbook"
                />
                <Button
                  icon={<ArrowUpload24Regular />}
                  onClick={() => fileInput.current?.click()}
                  disabled={busy !== null}
                >
                  Choose file
                </Button>
                {fileName && <Text size={200}>{fileName}</Text>}
              </div>

              {pending && (
                <>
                  <Text size={200} className={styles.hint}>
                    {pending.rows.length} row(s) · {countFilledCells(pending)} cell(s) filled in ·
                    language(s): {pending.languages.join(', ')}
                  </Text>
                  <div className={styles.row}>
                    <Button onClick={() => runImport(true)} disabled={busy !== null}>
                      Check without saving
                    </Button>
                    <Button
                      appearance="primary"
                      onClick={() => runImport(false)}
                      disabled={busy !== null || checked === null}
                    >
                      Apply
                    </Button>
                  </div>
                  {checked && !applied && <ImportReport summary={checked} title="Would change" />}
                  {applied && <ImportReport summary={applied} title="Applied" />}
                  {applied && applied.created + applied.updated > 0 && (
                    <>
                      <MessageBar intent="success">
                        <MessageBarBody>
                          Saved. Publish to regenerate the form JSON for every language — until
                          then the runtime still serves the version from the last publish.
                          Publishing also makes any unpublished draft edits on this form live.
                        </MessageBarBody>
                        <MessageBarActions>
                          <Button appearance="primary" size="small" onClick={onPublish}>
                            Publish now
                          </Button>
                        </MessageBarActions>
                      </MessageBar>
                      <Text size={200} className={styles.hint}>
                        Once published, open the form and switch the language — it opens in the
                        default language, where these labels are meant to stay untranslated.
                      </Text>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function ExportReport({ result }: { result: TranslationExport }): React.ReactElement {
  return (
    <>
      <Text size={200}>
        {result.stringCount} string(s), language(s): {result.languages.join(', ') || 'none configured'}
        {result.changedCount > 0 && ` · ${result.changedCount} whose source changed`}
        {result.unverifiedCount > 0 && ` · ${result.unverifiedCount} unverifiable`}
      </Text>
      {result.skipped.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {result.skipped.length} table(s) could not be read, so the workbook is incomplete:{' '}
            {result.skipped.map((entry) => entry.entity).join(', ')}
          </MessageBarBody>
        </MessageBar>
      )}
    </>
  );
}

/** How many cells a translator has actually filled in — the number they can check against. */
function countFilledCells(workbook: ParsedTranslationWorkbook): number {
  return workbook.rows.reduce(
    (total, row) => total + workbook.languages.filter((code) => row.values[code]).length,
    0,
  );
}

function ImportReport({
  summary,
  title,
}: {
  summary: ImportSummary;
  title: string;
}): React.ReactElement {
  // "0 new, 0 updated" reads as failure. Say plainly that the file held nothing new, so a
  // translator does not go looking for a bug that is not there.
  if (summary.created + summary.updated === 0) {
    return (
      <Text size={200}>
        No changes — every filled cell already matches what is in CRM ({summary.unchanged} already
        current, {summary.blank} blank). If you edited the file, save it in Excel and choose it
        again.
      </Text>
    );
  }

  return (
    <Text size={200}>
      {title}: {summary.created} new, {summary.updated} updated, {summary.unchanged} already
      current, {summary.blank} blank cell(s) left untouched.
    </Text>
  );
}
