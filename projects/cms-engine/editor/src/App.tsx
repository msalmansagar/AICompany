import { useCallback, useEffect, useState } from 'react';
import { Puck, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import { config } from './blocks';
import {
  approveLatestVersion,
  createPage,
  createSite,
  listPages,
  listSites,
  loadLatestVersion,
  publishPage,
  saveVersion,
  type PageSummary,
  type SiteSummary,
} from './dataverse';

const EMPTY_PAGE: Data = { root: { props: {} }, content: [], zones: {} };

type Notice = { text: string; tone: 'info' | 'ok' | 'bad' } | null;

export function App() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageSummary | null>(null);
  const [data, setData] = useState<Data>(EMPTY_PAGE);
  const [notice, setNotice] = useState<Notice>({ text: 'Loading portals…', tone: 'info' });

  const refresh = useCallback(async (forSite: SiteSummary | null) => {
    if (!forSite) {
      setPages([]);
      return;
    }
    try {
      setPages(await listPages(forSite.id));
      setNotice(null);
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await listSites();
        setSites(loaded);
        const first = loaded[0] ?? null;
        setSite(first);
        if (first) await refresh(first);
        else setNotice({ text: 'No portals yet. Create one to start.', tone: 'info' });
      } catch (error) {
        setNotice({ text: message(error), tone: 'bad' });
      }
    })();
  }, [refresh]);

  async function chooseSite(id: string) {
    const next = sites.find((candidate) => candidate.id === id) ?? null;
    setSite(next);
    setSelected(null);
    setData(EMPTY_PAGE);
    await refresh(next);
  }

  async function addSite() {
    const key = window.prompt('Portal key, used in the URL, for example reyada');
    if (!key) return;
    const nameEn = window.prompt('Portal name') ?? key;
    const hostName = window.prompt('Host name, for example reyada.qdb.qa') ?? '';

    try {
      const id = await createSite(key.trim(), nameEn, hostName);
      const loaded = await listSites();
      setSites(loaded);
      await chooseSite(id);
      setNotice({ text: `Portal ${key.trim()} created.`, tone: 'ok' });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

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
    if (!site) {
      setNotice({ text: 'Create a portal before adding pages.', tone: 'bad' });
      return;
    }
    const slug = window.prompt('URL slug, for example about-us');
    if (!slug) return;
    const titleEn = window.prompt('Title (English)') ?? slug;
    const titleAr = window.prompt('Title (العربية)') ?? '';

    try {
      const id = await createPage(site.id, slug.trim(), titleEn, titleAr);
      await refresh(site);
      await openPage({ id, slug: slug.trim(), titleEn, titleAr, status: 'Draft', siteId: site.id });
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

  /**
   * Records an approval for the latest version. The plugin refuses a publish
   * without one (FR-60), and refuses it again if the approver turns out to be
   * the author — so this can legitimately fail for the person who just saved.
   */
  async function approve() {
    if (!selected) return;
    setNotice({ text: 'Recording approval…', tone: 'info' });
    try {
      const versionNumber = await approveLatestVersion(selected.id, selected.slug, 'standard');
      setNotice({ text: `Version ${versionNumber} approved on the standard route.`, tone: 'ok' });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  async function publish() {
    if (!selected) return;
    setNotice({ text: 'Publishing…', tone: 'info' });
    try {
      const result = await publishPage(selected.id, 'Published from the editor');
      setNotice({
        text: `${result.message} Version ${result.versionNumber} is live at ${site?.key}/${selected.slug}.`,
        tone: 'ok',
      });
      await refresh(site);
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  return (
    <div className="shell">
      <aside>
        <div className="aside-head">
          <strong>Portal</strong>
          <button onClick={addSite}>New</button>
        </div>
        <div className="site-picker">
          <select value={site?.id ?? ''} onChange={(event) => void chooseSite(event.target.value)}>
            {sites.length === 0 && <option value="">No portals</option>}
            {sites.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.nameEn}
              </option>
            ))}
          </select>
          {site?.hostName && <span className="host">{site.hostName}</span>}
        </div>

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
              <strong>
                {site?.key}/{selected.slug}
              </strong>
              <span className="actions">
                <button onClick={() => void approve()}>Approve</button>
                <button className="primary" onClick={() => void publish()}>
                  Publish
                </button>
              </span>
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
