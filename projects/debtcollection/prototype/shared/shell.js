/* =====================================================================
   Debt Collection Platform — application shell
   Header, sitemap, theming, role context, routing and the shared
   render helpers every page is built from.
   ===================================================================== */
"use strict";

/* ---------- primitives ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "QAR " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const moneyM = (n) => "QAR " + (Number(n || 0) / 1000000).toFixed(1) + "M";
const pct = (n) => Number(n || 0).toFixed(1) + "%";

/* ---------- sitemap ----------
   Every entry names the file that owns it, so a nav click crosses files
   transparently and a deep link lands on the right page. */
const SITEMAP = [
  {
    group: "Workspace", items: [
      { view: "myday", file: "01-workspace.html", label: "My Day", icon: "home" },
      { view: "queues", file: "01-workspace.html", label: "Work Queues", icon: "queue", count: 92 },
      { view: "cases", file: "01-workspace.html", label: "Collection Cases", icon: "case", count: 10 }
    ]
  },
  {
    group: "Customer", items: [
      { view: "customer", file: "02-case-360.html", label: "Customer & Loan 360", icon: "users" },
      { view: "case", file: "02-case-360.html", label: "Case Detail", icon: "doc" },
      { view: "intake", file: "02-case-360.html", label: "Delinquency Intake", icon: "refresh", roles: ["manager"] }
    ]
  },
  {
    group: "Strategy", items: [
      { view: "buckets", file: "03-strategy.html", label: "Segmentation Matrix", icon: "strategy" },
      { view: "rules", file: "03-strategy.html", label: "Strategy Rules", icon: "settings", roles: ["manager"] },
      { view: "actionplan", file: "03-strategy.html", label: "Action Plan", icon: "check" }
    ]
  },
  {
    group: "Engagement", items: [
      { view: "ptp", file: "04-engagement.html", label: "Promise to Pay", icon: "promise", count: 7 },
      { view: "comms", file: "04-engagement.html", label: "Communication", icon: "send" },
      { view: "templates", file: "04-engagement.html", label: "Template Library", icon: "letter" }
    ]
  },
  {
    group: "Workout & Exit", items: [
      { view: "disputes", file: "05-workout.html", label: "Disputes", icon: "dispute", count: 5 },
      { view: "restructure", file: "05-workout.html", label: "Restructuring", icon: "restructure" },
      { view: "legal", file: "05-workout.html", label: "Legal Hand-off", icon: "legal" },
      { view: "claims", file: "05-workout.html", label: "Deceased & Claims", icon: "shield" }
    ]
  },
  {
    group: "Oversight", items: [
      { view: "dashboards", file: "06-oversight.html", label: "Dashboards", icon: "chart" },
      { view: "mis", file: "06-oversight.html", label: "Portfolio MIS", icon: "trend", roles: ["manager", "rm"] },
      { view: "approvals", file: "06-oversight.html", label: "Approvals", icon: "approve", count: 4 },
      { view: "audit", file: "06-oversight.html", label: "Audit Trail", icon: "audit" }
    ]
  },
  {
    group: "Administration", items: [
      { view: "admin", file: "07-admin.html", label: "Configuration", icon: "settings", roles: ["manager"] }
    ]
  }
];

const THEMES = [
  { id: "light", name: "Light", desc: "Clean Fluent default" },
  { id: "dark", name: "Dark", desc: "Low-light, easy on eyes" },
  { id: "glass", name: "Glass", desc: "Frosted glassmorphism" },
  { id: "vibrant", name: "Vibrant", desc: "Bold gradient accents" }
];

/* =====================================================================
   DC — the shell namespace shared by all seven pages
   ===================================================================== */
const DC = {
  state: { role: "officer", theme: "light", navCollapsed: false, file: "", view: "", arg: "", views: {} },

  boot(config) {
    this.state.file = config.file;
    this.state.views = config.views;
    this.state.role = localStorage.getItem("dc-role") || "officer";
    this.state.theme = localStorage.getItem("dc-theme") || "light";
    document.documentElement.setAttribute("data-theme", this.state.theme);
    document.body.appendChild(el(this.shellHtml()));
    document.body.appendChild(el(`<div class="toast-wrap" id="toasts"></div>`));
    this.wireHeader();
    this.renderNav();
    window.addEventListener("hashchange", () => this.route());
    this.route(config.defaultView);
  },

  shellHtml() {
    const role = ROLES[this.state.role];
    return `<div class="app">
      <header class="app-header">
        <button class="waffle" id="navToggle" title="Show or hide navigation" aria-label="Toggle navigation">
          <svg width="18" height="18" viewBox="0 0 18 18"><g fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="15" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="15" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/></g></svg>
        </button>
        <div class="header-accent"></div>
        <div class="app-title"><span class="env">MSS Collections</span><span class="name">Debt Collection</span></div>
        <div class="header-spacer"></div>
        <div class="header-search">
          ${ic("search")}<input placeholder="Search customer, case or QID" aria-label="Search" id="globalSearch" />
        </div>
        <div class="role-pick" title="Prototype stand-in for the signed-in D365 security role">
          <span class="rp-lbl">Role</span>
          <select id="roleSel" aria-label="Active role">
            ${Object.values(ROLES).map(r => `<option value="${r.id}" ${r.id === this.state.role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select>
        </div>
        <button class="icon-btn" id="themeToggle" title="Change theme" aria-haspopup="true" aria-expanded="false">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5A7.5 7.5 0 001.5 9c0 3.6 3 5.5 5.7 5.1 1-.15 1.3-1.2.7-1.9-.6-.7-.2-1.7.7-1.7H12a4.5 4.5 0 004.5-4.5C16.5 3.9 13 1.5 9 1.5zM5 8a1 1 0 110-2 1 1 0 010 2zm2.6-2.6a1 1 0 110-2 1 1 0 010 2zm3.8 0a1 1 0 110-2 1 1 0 010 2zM13 8a1 1 0 110-2 1 1 0 010 2z" fill="currentColor"/></svg>
        </button>
        <div class="theme-menu" id="themeMenu" role="menu" aria-label="Theme">
          <div class="tm-h">Appearance</div>
          ${THEMES.map(t => `<button class="theme-opt ${t.id === this.state.theme ? "sel" : ""}" role="menuitemradio" data-set-theme="${t.id}">
            <span class="sw sw-${t.id}"></span>
            <span class="tm-txt"><span class="tm-name">${esc(t.name)}</span><span class="tm-desc">${esc(t.desc)}</span></span>
            <svg class="chk" width="16" height="16" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>`).join("")}
        </div>
        <button class="icon-btn" id="notifBtn" title="Notifications">${ic("bell")}</button>
        <div class="avatar" title="${esc(role.user)} — ${esc(role.name)}">${esc(role.initials)}</div>
      </header>
      <div class="body">
        <nav class="nav" id="nav" aria-label="Sitemap"></nav>
        <main class="content" id="content"></main>
      </div>
    </div>`;
  },

  wireHeader() {
    $("#navToggle").onclick = () => $("#nav").classList.toggle("collapsed");
    $("#roleSel").onchange = (e) => {
      this.state.role = e.target.value;
      localStorage.setItem("dc-role", this.state.role);
      location.reload();
    };
    const menu = $("#themeMenu");
    $("#themeToggle").onclick = (e) => { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", () => menu.classList.remove("open"));
    $$("[data-set-theme]").forEach(b => b.onclick = () => this.setTheme(b.dataset.setTheme));
    $("#notifBtn").onclick = () => toast("4 approvals and 2 SLA breaches need attention", "warn");
    $("#globalSearch").onkeydown = (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      toast(`Searching both CRMs for "${e.target.value.trim()}" — router fans out on QID`, "info");
    };
  },

  setTheme(id) {
    this.state.theme = id;
    localStorage.setItem("dc-theme", id);
    document.documentElement.setAttribute("data-theme", id);
    $$(".theme-opt").forEach(o => o.classList.toggle("sel", o.dataset.setTheme === id));
  },

  /** A nav entry is visible when it names no roles, or names the active one. */
  isVisible(item) { return !item.roles || item.roles.includes(this.state.role); },

  renderNav() {
    const nav = $("#nav");
    nav.innerHTML = SITEMAP.map(g => {
      const items = g.items.filter(i => this.isVisible(i));
      if (!items.length) return "";
      return `<div class="nav-group-label">${esc(g.group)}</div>` + items.map(i =>
        `<a class="nav-item" href="${i.file}#${i.view}" data-view="${i.view}">
           ${ic(i.icon)}<span>${esc(i.label)}</span>${i.count ? `<span class="nav-count">${i.count}</span>` : ""}
         </a>`).join("");
    }).join("");
  },

  route(fallback) {
    const raw = location.hash.replace(/^#/, "");
    const [view, arg] = raw.split("/");
    const target = this.state.views[view] ? view : (fallback || Object.keys(this.state.views)[0]);
    this.state.view = target;
    this.state.arg = arg || "";
    $$("#nav .nav-item").forEach(a => a.classList.toggle("active", a.dataset.view === target));
    this.renderView();
  },

  go(view, arg) {
    const entry = SITEMAP.flatMap(g => g.items).find(i => i.view === view);
    const hash = "#" + view + (arg ? "/" + arg : "");
    if (entry && entry.file !== this.state.file) { location.href = entry.file + hash; return; }
    location.hash = hash;
  },

  renderView() {
    const view = this.state.views[this.state.view];
    const content = $("#content");
    content.innerHTML = "";
    if (view.raw) { view.render(content, this.state.arg); return; }
    if (view.cmds) content.appendChild(this.cmdbar(view.cmds()));
    const scroll = el(`<div class="scroll"><div class="page"></div></div>`);
    const page = $(".page", scroll);
    if (view.title) {
      page.appendChild(el(`<div class="page-head"><div><h1>${esc(view.title)}</h1>
        ${view.sub ? `<div class="page-sub">${view.sub}</div>` : ""}</div></div>`));
    }
    content.appendChild(scroll);
    view.render(page, this.state.arg);
    labelizeGrid(page);
  },

  /* ---------- shared building blocks ---------- */

  /** @param {Array} buttons entries of {id,label,icon,kind,onClick} or "sep"/"spacer" */
  cmdbar(buttons) {
    const bar = el(`<div class="cmdbar"></div>`);
    buttons.forEach(b => {
      if (b === "sep") { bar.appendChild(el(`<div class="cmd-sep"></div>`)); return; }
      if (b === "spacer") { bar.appendChild(el(`<div class="cmd-spacer"></div>`)); return; }
      const btn = el(`<button class="cmd ${b.kind || ""}" ${b.disabled ? "disabled" : ""}>${ic(b.icon)}<span>${esc(b.label)}</span></button>`);
      btn.onclick = b.onClick || (() => toast(`${b.label} — demonstration only`, "info"));
      bar.appendChild(btn);
    });
    return bar;
  },

  /**
   * Builds a Dataverse-style grid.
   * @param {{columns:Array,rows:Array,onRow?:Function,empty?:string,footer?:string}} spec
   */
  grid(spec) {
    const wrap = el(`<div class="grid-wrap ${spec.auto ? "auto" : ""}"></div>`);
    const head = spec.columns.map(c => `<th class="${c.cls || ""}">${esc(c.label)}</th>`).join("");
    const body = spec.rows.length
      ? spec.rows.map((r, i) => `<tr data-i="${i}">${spec.columns.map(c => `<td class="${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")
      : `<tr class="empty-row"><td colspan="${spec.columns.length}">${esc(spec.empty || "Nothing to show")}</td></tr>`;
    wrap.appendChild(el(`<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${spec.footer || ""}</table>`));
    if (spec.onRow) {
      $$("tbody tr[data-i]", wrap).forEach(tr => {
        tr.style.cursor = "pointer";
        tr.onclick = () => spec.onRow(spec.rows[Number(tr.dataset.i)]);
      });
    }
    return wrap;
  },

  kpiRow(tiles) {
    return el(`<div class="kpi-row">${tiles.map(t => `<div class="kpi-tile ${t.tone || ""}">
      <div class="kpi-label">${esc(t.label)}</div>
      <div class="kpi-value">${esc(t.value)}</div>
      ${t.delta ? `<div class="kpi-delta ${t.dir || "flat"}">${esc(t.delta)}</div>` : ""}
    </div>`).join("")}</div>`);
  },

  card(title, hint, bodyHtml) {
    return el(`<div class="section-card"><h3>${esc(title)}</h3>${hint ? `<div class="hint">${hint}</div>` : ""}${bodyHtml}</div>`);
  },

  readGrid(pairs) {
    return `<div class="read-grid">${pairs.map(([k, v]) =>
      `<div class="read-pair"><span class="rk">${esc(k)}</span><span class="rv">${v}</span></div>`).join("")}</div>`;
  },

  /** Horizontal bar chart driven straight from an array — no chart library. */
  barChart(rows, opts = {}) {
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<div class="chart-bars">${rows.map(r => `<div class="chart-bar-row">
      <span class="bl">${esc(r.label)}</span>
      <span class="bt"><span class="bf" style="width:${Math.max(2, (r.value / max) * 100)}%;background:${r.color || "var(--primary)"}"></span></span>
      <span class="bv">${esc(opts.format ? opts.format(r.value) : r.value)}</span>
    </div>`).join("")}</div>`;
  },

  /** Column chart for time series or bucket distributions. */
  columnChart(rows, opts = {}) {
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<div class="chart-cols">${rows.map(r => `<div class="chart-col">
      <span class="col-val">${esc(opts.format ? opts.format(r.value) : r.value)}</span>
      <span class="col-bar" style="height:${Math.max(3, (r.value / max) * 100)}%;background:${r.color || "var(--primary)"}"></span>
      <span class="col-lbl">${esc(r.label)}</span>
    </div>`).join("")}</div>`;
  },

  /** Donut built from stroke-dasharray so it needs no plotting library. */
  donut(slices) {
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;
    let offset = 25;
    const arcs = slices.map(s => {
      const share = (s.value / total) * 100;
      const seg = `<circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="${s.color}" stroke-width="7"
        stroke-dasharray="${share.toFixed(2)} ${(100 - share).toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>`;
      offset = (offset - share + 100) % 100;
      return seg;
    }).join("");
    return `<div class="chart-svg-wrap">
      <svg width="150" height="150" viewBox="0 0 42 42" role="img" aria-label="Distribution">${arcs}</svg>
      <div class="chart-legend">${slices.map(s => `<div class="lg-row">
        <span class="dot" style="background:${s.color}"></span><span>${esc(s.label)}</span>
        <span class="lv">${esc(s.display != null ? s.display : s.value)}</span></div>`).join("")}</div>
    </div>`;
  },

  timeline(items) {
    return `<div class="timeline">${items.map(i => `<div class="tl-item">
      <div class="tl-dot ${i.tone || ""}">${ic(i.icon || "info")}</div>
      <div class="tl-body">
        <div class="tl-head"><span class="tl-title">${esc(i.title)}</span><span class="tl-when">${esc(i.when)}</span></div>
        <div class="tl-meta">${i.meta}</div>
        ${i.note ? `<div class="tl-note">${esc(i.note)}</div>` : ""}
      </div></div>`).join("")}</div>`;
  },

  dialog(spec) {
    const scrim = el(`<div class="scrim"><div class="dialog ${spec.wide ? "lg" : ""}">
      <div class="dialog-head"><h3>${esc(spec.title)}</h3><button class="close-x" aria-label="Close">✕</button></div>
      <div class="dialog-body">${spec.body}</div>
      <div class="dialog-foot">${(spec.actions || []).map((a, i) =>
        `<button class="btn ${a.kind || ""}" data-a="${i}">${esc(a.label)}</button>`).join("")}</div>
    </div></div>`);
    const close = () => scrim.remove();
    $(".close-x", scrim).onclick = close;
    scrim.onclick = (e) => { if (e.target === scrim) close(); };
    (spec.actions || []).forEach((a, i) => {
      $(`[data-a="${i}"]`, scrim).onclick = () => { close(); if (a.onClick) a.onClick(scrim); };
    });
    document.body.appendChild(scrim);
    return scrim;
  },

  panel(spec) {
    const scrim = el(`<div class="scrim"><div class="panel">
      <div class="panel-head"><h3>${esc(spec.title)}</h3><button class="close-x" aria-label="Close">✕</button></div>
      <div class="panel-body">${spec.body}</div>
      <div class="panel-foot">${(spec.actions || []).map((a, i) =>
        `<button class="btn ${a.kind || ""}" data-a="${i}">${esc(a.label)}</button>`).join("")}</div>
    </div></div>`);
    const close = () => scrim.remove();
    $(".close-x", scrim).onclick = close;
    scrim.onclick = (e) => { if (e.target === scrim) close(); };
    (spec.actions || []).forEach((a, i) => {
      $(`[data-a="${i}"]`, scrim).onclick = () => { close(); if (a.onClick) a.onClick(); };
    });
    document.body.appendChild(scrim);
    return scrim;
  },

  /** Pivot tabs that swap a body element without leaving the view. */
  pivot(host, tabs, initial) {
    const bar = el(`<div class="pivot">${tabs.map(t =>
      `<button class="pivot-tab" data-t="${t.id}">${esc(t.label)}${t.badge != null ? `<span class="badge">${t.badge}</span>` : ""}</button>`).join("")}</div>`);
    const body = el(`<div class="scroll"><div class="page"></div></div>`);
    host.appendChild(bar);
    host.appendChild(body);
    const show = (id) => {
      $$(".pivot-tab", bar).forEach(b => b.classList.toggle("active", b.dataset.t === id));
      const page = $(".page", body);
      page.innerHTML = "";
      tabs.find(t => t.id === id).render(page);
      labelizeGrid(page);
      body.scrollTop = 0;
    };
    $$(".pivot-tab", bar).forEach(b => b.onclick = () => show(b.dataset.t));
    show(initial || tabs[0].id);
  }
};

/* ---------- shared formatters ---------- */
const orgBadge = (org) => `<span class="org-badge ${org}">${org}</span>`;
const bucketPill = (id) => {
  const b = BUCKETS.find(x => x.id === id);
  return b ? `<span class="pill ${b.cls}">${esc(b.label)}</span>` : `<span class="pill muted">—</span>`;
};
const statusPill = (status) => `<span class="pill ${statusTone(status)}">${esc(status)}</span>`;

/** Maps a business status onto one of the shared pill tones. */
function statusTone(status) {
  const s = String(status).toLowerCase();
  if (/paid|kept|approved|resolved|accepted|healthy|completed|delivered|signed|linked/.test(s)) return "ok";
  if (/broken|rejected|breach|blocked|failed|suppressed|expired|lapsed/.test(s)) return "bad";
  if (/pending|review|draft|degraded|disputed|errors|open|due/.test(s)) return "warn";
  if (/new|follow|captured|proposed|hand-off/.test(s)) return "info";
  return "muted";
}

/** SLA is expressed in hours remaining; negative means already breached. */
function slaChip(hours) {
  if (hours === 0) return `<span class="pill muted plain">No SLA</span>`;
  if (hours < 0) return `<span class="sla-chip breach">${ic("warn")} Breached ${Math.abs(hours)}h</span>`;
  if (hours <= 8) return `<span class="sla-chip warn">${ic("history")} ${hours}h left</span>`;
  return `<span class="sla-chip">${ic("history")} ${hours}h left</span>`;
}

function toast(message, kind = "ok") {
  const node = el(`<div class="toast ${kind === "ok" ? "" : kind}"><span class="dot"></span><span>${esc(message)}</span></div>`);
  $("#toasts").appendChild(node);
  setTimeout(() => { node.style.transition = "opacity .3s"; node.style.opacity = "0"; setTimeout(() => node.remove(), 300); }, 2800);
}

/** Tags each cell with its column label so grids collapse into cards on small screens. */
function labelizeGrid(scope) {
  $$("table.grid", scope).forEach(table => {
    const heads = $$("thead th", table).map(th => th.textContent.trim());
    $$("tbody tr", table).forEach(tr => [...tr.children].forEach((td, i) => {
      if (heads[i]) td.setAttribute("data-label", heads[i]);
    }));
  });
}

/* ---------- dataset lookups ---------- */
const findCustomer = (id) => CUSTOMERS.find(c => c.id === id);
const findCase = (id) => CASES.find(c => c.id === id);
const findFacility = (id) => FACILITIES.find(f => f.id === id);
const customerName = (id) => (findCustomer(id) || {}).name || "—";
const casesFor = (customerId) => CASES.filter(c => c.customerId === customerId);
const facilitiesFor = (customerId) => FACILITIES.filter(f => f.customerId === customerId);
const actionsFor = (caseId) => ACTIONS.filter(a => a.caseId === caseId);
const ptpsFor = (caseId) => PTPS.filter(p => p.caseId === caseId);
const commsFor = (caseId) => COMMS.filter(c => c.caseId === caseId);
const auditFor = (ref) => AUDIT.filter(a => a.ref === ref);
const openCases = () => CASES.filter(c => !/closed/i.test(c.status));
