import { useCallback, useEffect, useRef, useState } from 'react';
import { Puck, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import { config, setPreviewLanguage, type PreviewLanguage } from './blocks';
import { deriveSlug, findMissingArabic } from './authoring';
import {
  approveLatestVersion,
  createPage,
  createSite,
  duplicatePage,
  saveDraft,
  listPages,
  listSites,
  listVersions,
  loadLatestVersion,
  publishPage,
  restoreVersion,
  saveVersion,
  type PageSummary,
  type SiteSummary,
  type VersionSummary,
} from './dataverse';

const EMPTY_PAGE: Data = { root: { props: {} }, content: [], zones: {} };

type Notice = { text: string; tone: 'info' | 'ok' | 'bad' } | null;

export function App() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageSummary | null>(null);
  const [data, setData] = useState<Data>(EMPTY_PAGE);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [language, setLanguage] = useState<PreviewLanguage>('both');
  const [width, setWidth] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: 'Loading portals…', tone: 'info' });
  const autoSave = useRef<number | null>(null);

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
    setPreviewLanguage(language);
  }, [language]);

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
      setVersions(await listVersions(page.id));
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
    const titleEn = window.prompt('Page title (English)');
    if (!titleEn) return;

    // The slug is derived and then offered for editing, per FR-01.
    const slug = window.prompt('URL slug — edit if you want something else', deriveSlug(titleEn));
    if (!slug) return;
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
      setVersions(await listVersions(selected.id));
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

  /** Copies a page and its content into a new page (FR-07). */
  async function duplicate() {
    if (!selected || !site) return;
    const slug = window.prompt('Slug for the copy', deriveSlug(`${selected.slug} copy`));
    if (!slug) return;

    try {
      const id = await duplicatePage(selected, site.id, slug.trim());
      await refresh(site);
      await openPage({
        id,
        slug: slug.trim(),
        titleEn: `${selected.titleEn} (copy)`,
        titleAr: selected.titleAr,
        status: 'Draft',
        siteId: site.id,
      });
      setNotice({ text: `Copied to ${slug.trim()}.`, tone: 'ok' });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  /**
   * Auto-save (FR-06). Debounced, and it updates the working version rather
   * than creating one per pause — see saveDraft for why that reading of FR-62.
   */
  function scheduleAutoSave(next: Data) {
    if (!selected) return;
    if (autoSave.current !== null) window.clearTimeout(autoSave.current);

    autoSave.current = window.setTimeout(() => {
      void (async () => {
        try {
          const versionNumber = await saveDraft(selected.id, selected.slug, next);
          setVersions(await listVersions(selected.id));
          setNotice({ text: `Draft saved to version ${versionNumber}.`, tone: 'info' });
        } catch (error) {
          setNotice({ text: message(error), tone: 'bad' });
        }
      })();
    }, 2500);
  }

  /**
   * Copies a prior version forward (FR-63). Nothing is deleted, and the
   * restored content needs approval before it can go live — a rollback must not
   * be a way around FR-60.
   */
  async function restore(versionNumber: number) {
    if (!selected) return;
    setNotice({ text: `Restoring version ${versionNumber}…`, tone: 'info' });
    try {
      const created = await restoreVersion(selected.id, selected.slug, versionNumber);
      const latest = await loadLatestVersion(selected.id);
      setData((latest?.content as Data) ?? EMPTY_PAGE);
      setVersions(await listVersions(selected.id));
      setNotice({
        text: `Version ${versionNumber} restored as version ${created}. It needs approval before it goes live.`,
        tone: 'ok',
      });
    } catch (error) {
      setNotice({ text: message(error), tone: 'bad' });
    }
  }

  async function publish() {
    if (!selected) return;

    // FR-08: report untranslated fields before publish, but do not block.
    // Publishing English first is a legitimate choice; not knowing is not.
    const missing = findMissingArabic(data);
    if (missing.length > 0) {
      const list = missing.map((item) => `${item.block}.${item.field}`).join(', ');
      const proceed = window.confirm(
        `${missing.length} field(s) have no Arabic: ${list}\n\nPublish anyway?`,
      );
      if (!proceed) {
        setNotice({ text: `Publish cancelled. Missing Arabic: ${list}`, tone: 'bad' });
        return;
      }
    }

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
                {/* FR-67: an unpublished page is visibly marked. */}
                {selected.status !== 'Published' && <span className="draft">Draft</span>}
              </strong>

              <span className="actions">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as PreviewLanguage)}
                  title="Preview language"
                >
                  <option value="both">Both languages</option>
                  <option value="en">English only</option>
                  <option value="ar">العربية only</option>
                </select>

                <select
                  value={width ?? ''}
                  onChange={(event) =>
                    setWidth(event.target.value === '' ? null : Number(event.target.value))
                  }
                  title="Preview width"
                >
                  <option value="">Full width</option>
                  <option value="1280">Desktop 1280</option>
                  <option value="768">Tablet 768</option>
                  <option value="390">Mobile 390</option>
                </select>

                <button onClick={() => void duplicate()}>Duplicate</button>
                <button onClick={() => void approve()}>Approve</button>
                <button className="primary" onClick={() => void publish()}>
                  Publish
                </button>
              </span>
            </div>
            {versions.length > 1 && (
              <details className="history">
                <summary>Version history ({versions.length})</summary>
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}>
                      <span>
                        <strong>v{version.versionNumber}</strong> {version.label}
                      </span>
                      <button onClick={() => void restore(version.versionNumber)}>Restore</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div
              className="canvas"
              style={width ? { maxWidth: width, margin: '0 auto', width: '100%' } : undefined}
            >
              <Puck
                // Remounted when the preview language changes: Puck render
                // functions read it from module scope, so nothing re-renders
                // without this.
                key={language}
                config={config}
                data={data}
                onChange={(next) => scheduleAutoSave(next)}
                onPublish={(next) => void save(next)}
                headerTitle={`${selected.slug}${width ? ` — ${width}px` : ''}`}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
