import { useCallback, useEffect, useState } from 'react';
import { Puck, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import { config } from './blocks';
import {
  createPage,
  listPages,
  loadLatestVersion,
  publishPage,
  saveVersion,
  type PageSummary,
} from './dataverse';

const EMPTY_PAGE: Data = { root: { props: {} }, content: [], zones: {} };

type Notice = { text: string; tone: 'info' | 'ok' | 'bad' } | null;

export function App() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageSummary | null>(null);
  const [data, setData] = useState<Data>(EMPTY_PAGE);
  const [notice, setNotice] = useState<Notice>({ text: 'Loading pages…', tone: 'info' });

  const refresh = useCallback(async () => {
    try {
      setPages(await listPages());
      setNotice(null);
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openPage(page: PageSummary) {
    setNotice({ text: `Opening ${page.slug}…`, tone: 'info' });
    try {
      const version = await loadLatestVersion(page.id);
      setSelected(page);
      setData((version?.content as Data) ?? EMPTY_PAGE);
      setNotice(
        version
          ? { text: `Editing ${page.slug}, version ${version.versionNumber}.`, tone: 'info' }
          : { text: `${page.slug} has no versions yet. This will be version 1.`, tone: 'info' },
      );
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  async function addPage() {
    const slug = window.prompt('URL slug, for example about-us');
    if (!slug) return;
    const titleEn = window.prompt('Title (English)') ?? slug;
    const titleAr = window.prompt('Title (العربية)') ?? '';

    try {
      const id = await createPage(slug.trim(), titleEn, titleAr);
      await refresh();
      await openPage({ id, slug: slug.trim(), titleEn, titleAr, status: 'Draft' });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  /** Every save creates a version; none is edited in place (FR-62). */
  async function save(next: Data) {
    if (!selected) return;
    setNotice({ text: 'Saving…', tone: 'info' });
    try {
      const versionNumber = await saveVersion(selected.id, selected.slug, next);
      setData(next);
      setNotice({ text: `Saved as version ${versionNumber}.`, tone: 'ok' });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  async function publish() {
    if (!selected) return;
    setNotice({ text: 'Publishing…', tone: 'info' });
    try {
      const result = await publishPage(selected.id, 'Published from the editor');
      setNotice({ text: `${result.message} Version ${result.versionNumber} is live.`, tone: 'ok' });
      await refresh();
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  return (
    <div className="shell">
      <aside>
        <div className="aside-head">
          <strong>Pages</strong>
          <button onClick={addPage}>New</button>
        </div>
        <ul>
          {pages.map((page) => (
            <li key={page.id}>
              <button
                className={selected?.id === page.id ? 'page selected' : 'page'}
                onClick={() => void openPage(page)}
              >
                <span className="slug">{page.slug}</span>
                <span className="status">{page.status}</span>
              </button>
            </li>
          ))}
          {pages.length === 0 && <li className="empty">No pages yet.</li>}
        </ul>
      </aside>

      <main>
        {notice && <p className={`notice ${notice.tone}`}>{notice.text}</p>}

        {!selected && <p className="hint">Choose a page, or create one.</p>}

        {selected && (
          <>
            <div className="toolbar">
              <strong>{selected.slug}</strong>
              <button className="primary" onClick={() => void publish()}>
                Publish
              </button>
            </div>
            <Puck
              config={config}
              data={data}
              onPublish={(next) => void save(next)}
              headerTitle={selected.slug}
            />
          </>
        )}
      </main>
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
