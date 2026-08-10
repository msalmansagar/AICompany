/* =====================================================================
   Application shell — top bar, sitemap, hash routing, small helpers.
   Shared by every screen file so the chrome is identical across the app.
   ===================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n || 0).toLocaleString("en-US");

/** Sitemap. `file` is the html file; `id` is the hash within it. */
const SITEMAP = [
  { grp: "Author", items: [
    { id: "dashboard", file: "01-workspace.html", label: "Dashboard",   icon: "grid" },
    { id: "pages",     file: "01-workspace.html", label: "Pages",       icon: "pages" },
    { id: "page360",   file: "01-workspace.html", label: "Page detail", icon: "eye" },
    { id: "designer",  file: "02-designer.html",  label: "Designer",    icon: "design" },
  ]},
  { grp: "Content", items: [
    { id: "media",     file: "03-content.html",   label: "Media library", icon: "media" },
    { id: "icons",     file: "03-content.html",   label: "Icon library",  icon: "award" },
    { id: "i18n",      file: "03-content.html",   label: "Translations",  icon: "globe" },
  ]},
  { grp: "Design system", items: [
    { id: "tokens",    file: "04-design.html",    label: "Theme tokens",  icon: "palette" },
    { id: "registry",  file: "04-design.html",    label: "Components",    icon: "section" },
    { id: "builder",   file: "07-builder.html",   label: "Build component", icon: "wrench" },
  ]},
  { grp: "Structure", items: [
    { id: "nav",       file: "05-structure.html", label: "Navigation",    icon: "structure" },
  ]},
  { grp: "Governance", items: [
    { id: "review",    file: "06-governance.html", label: "Review queue", icon: "check" },
    { id: "versions",  file: "06-governance.html", label: "Versions",     icon: "history" },
    { id: "audit",     file: "06-governance.html", label: "Publish log",  icon: "shield" },
    { id: "roles",     file: "06-governance.html", label: "Roles",        icon: "user" },
  ]},
];

const Shell = {
  file: "",
  current: "",

  /** Builds chrome, wires routing, shows the first screen. */
  init(file, defaultScreen) {
    this.file = file;
    document.documentElement.dataset.theme = localStorage.getItem("qdb.cms.theme") || "light";

    this.renderSitemap();
    this.renderTopbar();
    // Restore before first paint so a collapsed rail does not flash open.
    this.toggleNav(localStorage.getItem("qdb.cms.nav") === "collapsed");

    window.addEventListener("hashchange", () => this.route());
    this.route(defaultScreen);
  },

  renderTopbar() {
    const bar = $(".topbar");
    if (!bar) return;
    bar.innerHTML = `
      <button class="waffle" id="navToggle" type="button"
        aria-label="Collapse navigation" aria-expanded="true"
        aria-controls="sitemap">${icon("grid", 18)}</button>
      <div class="product">QDB CMS Engine</div>
      <div class="env">org5869857f · Sandbox</div>
      <div class="sp"></div>
      <select id="localePick" title="Preview locale">
        <option value="en">Preview: English</option>
        <option value="ar">Preview: العربية</option>
      </select>
      <button class="btn" data-v="subtle" id="themeBtn"
        style="color:#fff;border-color:rgba(255,255,255,.3)">${icon("moon", 15)}</button>
      <div class="avatar">NA</div>`;

    $("#themeBtn").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("qdb.cms.theme", next);
      $("#themeBtn").innerHTML = icon(next === "dark" ? "sun" : "moon", 15);
    });
    $("#themeBtn").innerHTML = icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon", 15);

    $("#navToggle").addEventListener("click", () => this.toggleNav());
  },

  /**
   * Collapses the sitemap to an icon rail.
   *
   * State is persisted because the prototype is a set of separate documents —
   * without it every navigation would silently re-expand the rail and the
   * setting would feel broken rather than reset.
   */
  toggleNav(force) {
    const shell = $(".shell");
    const btn = $("#navToggle");
    if (!shell) return;

    const collapsed = force !== undefined
      ? force
      : shell.getAttribute("data-collapsed") !== "true";

    shell.setAttribute("data-collapsed", String(collapsed));
    localStorage.setItem("qdb.cms.nav", collapsed ? "collapsed" : "expanded");

    if (btn) {
      btn.setAttribute("aria-expanded", String(!collapsed));
      btn.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    }
  },

  renderSitemap() {
    const nav = $(".sitemap");
    if (!nav) return;
    nav.id = "sitemap";
    // title= is what makes the collapsed rail usable: an icon with no label is
    // a guessing game, and a tooltip costs nothing.
    nav.innerHTML = SITEMAP.map((g, gi) => `
      <div class="grp">${esc(g.grp)}</div>
      ${g.items.map(i => `
        <a href="${i.file === this.file ? "#" + i.id : i.file + "#" + i.id}"
           data-screen="${i.id}" data-group="${gi}" title="${esc(g.grp)} — ${esc(i.label)}">
          ${icon(i.icon, 17)}<span>${esc(i.label)}</span>
        </a>`).join("")}
    `).join("");
  },

  /** Shows the screen named in the hash; falls back to the file default. */
  route(fallback) {
    const id = (location.hash || "").replace("#", "") || fallback || "";
    const target = $("#" + CSS.escape(id));
    const screens = $$(".screen");

    screens.forEach(s => s.classList.remove("active"));
    (target || screens[0])?.classList.add("active");

    this.current = target ? id : (screens[0]?.id || "");
    $$(".sitemap a").forEach(a =>
      a.setAttribute("aria-current", a.dataset.screen === this.current ? "page" : "false"));

    // A file with no .screen sections (the designer, which Puck owns entirely)
    // leaves `current` empty. Querying "#" is a SyntaxError, and because that
    // threw from here it silently aborted everything after Shell.init in the
    // caller's script block — an invisible failure with a very confusing
    // symptom. Guard rather than assume every page is screen-based.
    const t = this.current ? $("#" + CSS.escape(this.current)) : null;
    const bar = $(".cmdbar .title");
    if (bar && t) bar.textContent = t.dataset.title || "";
    $(".scroll")?.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: this.current } }));
  },
};

/* ------------------------------------------------------------- helpers -- */

function toast(message) {
  $(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function drawer(title, bodyHtml) {
  const scrim = document.createElement("div");
  scrim.className = "drawer-scrim";
  scrim.innerHTML = `<div class="drawer">
    <div class="row" style="margin-bottom:14px">
      <h3>${esc(title)}</h3>
      <button class="btn" data-v="subtle" id="dxClose" style="margin-inline-start:auto">Close</button>
    </div>${bodyHtml}</div>`;
  document.body.appendChild(scrim);
  const close = () => scrim.remove();
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
  $("#dxClose", scrim).addEventListener("click", close);
  return scrim;
}

/** Status → pill tone, one place so every screen agrees. */
function statusTone(s) {
  return { "Published": "ok", "Draft": "", "In review": "warn", "Scheduled": "info" }[s] || "";
}
const statusPill = (s) => `<span class="pill" data-tone="${statusTone(s)}">${esc(s)}</span>`;
const langBadges = (list) => list.map(l => `<span class="lang-badge" data-l="${l}">${l}</span>`).join(" ");
