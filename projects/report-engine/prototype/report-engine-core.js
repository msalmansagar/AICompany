"use strict";
/* Report Engine — Runtime Viewer (RPT-ENG-001). Self-contained, no deps.
   Runs entirely inside CRM (ADR-RPT-011) — there is no middle tier to call. */

const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const NUMERIC = /^-?[\d,]*\.?\d+$/;
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

const state = {
  theme: localStorage.getItem("re-theme") || "light",
  callerName: "user",
  reports: [], view: "catalog", current: null
};

/* The one place the two shells differ. Both render a report through exactly the same code; the
   catalogue shows the chrome that belongs to browsing, and the single-report runtime does not.
   Keeping the difference to a handful of flags is the point — a fix to the report view reaches both,
   and neither can drift into showing what the other is meant to. */
const reportView = {
  showBack: true,          // "← Catalog" — meaningless where there is no catalogue to go back to
  showBreadcrumb: true,
  showChartMenu: true,     // re-charting is authoring, and authoring belongs in the Designer
  autoRun: false,          // a ribbon click is already the instruction to run
  contextRecordId: null,   // passed in, bound only where a parameter asks for it — never a silent filter
  contextEntityName: null  // the table the report was launched from
};

function toast(msg, kind){ const t=document.createElement("div"); t.className="toast "+(kind||""); t.textContent=msg; $("#toasts").appendChild(t); setTimeout(()=>t.remove(), 4200); }

/* ---------------- Busy tracking ----------------
   While an operation is in flight the viewer is LOCKED: a shield covers the surface and swallows
   pointer events, and Enter/Space/Escape are refused, so a second run or export cannot be started
   on top of the first. Running a report writes an audit record, so a double-fire is not just wasted
   work — it is a second row in the trail for one user action.

   Counts overlapping operations rather than toggling a flag: a chart render can start while an
   export is still building, and the first to finish must not unlock for the other. */
let busyDepth = 0;
let busyLabel = "Working…";
let busyRevealTimer = null;

/* Long enough that a fast round trip never flashes a modal; short enough to cover any real wait. */
const BUSY_VISIBLE_AFTER_MS = 180;

function paintBusy(){
  let bar = $("#busyBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "busyBar"; bar.className = "busy-bar"; document.body.appendChild(bar); }
  bar.classList.toggle("on", busyDepth > 0);
  busyDepth > 0 ? raiseShield() : dropShield();
}

function raiseShield(){
  let shield = $("#busyShield");
  if (!shield) { shield = document.createElement("div"); shield.id = "busyShield"; shield.className = "busy-shield"; document.body.appendChild(shield); }
  shield.innerHTML = `<div class="busy-panel"><span class="spinner"></span><span>${esc(busyLabel)}</span></div>`;
  if (busyRevealTimer) return;
  busyRevealTimer = setTimeout(() => { const s = $("#busyShield"); if (s) s.classList.add("visible"); }, BUSY_VISIBLE_AFTER_MS);
}

function dropShield(){
  clearTimeout(busyRevealTimer); busyRevealTimer = null;
  const shield = $("#busyShield");
  if (shield) shield.remove();
}

document.addEventListener("keydown", e => {
  if (busyDepth === 0) return;
  if (["Enter", " ", "Spacebar", "Escape"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
}, true);

/* A lock that never releases is worse than no lock: the viewer would be dead until a reload with no
   clue why. If an operation hangs, the watchdog unlocks and says so. */
const BUSY_WATCHDOG_MS = 45000;
let busyWatchdog = null;

async function withBusy(operation, label){
  busyDepth++;
  if (label) busyLabel = label;
  clearTimeout(busyWatchdog);
  busyWatchdog = setTimeout(() => {
    busyDepth = 0; paintBusy();
    toast(`Timed out waiting for ${busyLabel} — the screen was unlocked.`, "error");
  }, BUSY_WATCHDOG_MS);
  paintBusy();
  try { return await operation(); }
  finally {
    busyDepth = Math.max(0, busyDepth - 1);
    clearTimeout(busyWatchdog);
    if (busyDepth > 0) busyWatchdog = setTimeout(() => { busyDepth = 0; paintBusy(); }, BUSY_WATCHDOG_MS);
    paintBusy();
  }
}

/**
 * The same for a button, which also spins and stops accepting clicks. Exports matter most here:
 * generating a PDF fetches a 476 KB library web resource first, so the wait is real.
 */
async function withBusyButton(selector, label, operation){
  const button = typeof selector === "string" ? $(selector) : selector;
  const original = button ? button.innerHTML : null;
  if (button) { button.classList.add("busy"); button.disabled = true; button.innerHTML = `<span class="spinner sm"></span> ${label}`; }
  try { return await withBusy(operation, label); }
  finally {
    if (button && button.isConnected) { button.classList.remove("busy"); button.disabled = false; button.innerHTML = original; }
  }
}

/* ---------------- Dataverse access ----------------
   Two paths, and the split between them IS the audit guarantee (ADR-RPT-011):

   - CONFIGURATION — the catalog and report definitions — is read directly with Xrm.WebApi. These
     describe reports; they are not report output, so they need no execution record.
   - REPORT DATA goes exclusively through the qdb_RunReport Custom API, never a direct query,
     because that call is what writes qdb_reportexecutionlog. Querying the underlying rows from here
     would hand back the same data with no audit trail, which is precisely what routing retrieval
     through the plugin exists to prevent.

   Everything runs as the signed-in CRM user, so row-level security applies with no token to hold. */

/* Xrm arrives one of two ways: injected by the app shell when this page is hosted in a form,
   dashboard or sitemap area, or from ClientGlobalContext.js.aspx when it is opened on its own URL.
   Both are checked, and which one answered is reported by the self-check — a page that finds Xrm but
   no WebApi is a different problem from one that finds nothing at all. */
function findXrm(){
  const sources = [
    ["this frame", () => window.Xrm],
    ["parent frame", () => window.parent && window.parent.Xrm],
    ["top frame", () => window.top && window.top.Xrm]
  ];
  for (const [origin, get] of sources) {
    let candidate = null;
    try { candidate = get(); } catch (e) { continue; }   // cross-origin parents throw on access
    if (candidate && candidate.WebApi) return { xrm: candidate, origin };
  }
  return null;
}

function xrm(){
  const found = findXrm();
  if (!found) {
    throw new Error(
      "No Xrm context. Host this page in the app (sitemap area, dashboard or form), or ensure "
      + "ClientGlobalContext.js.aspx loaded — check the browser console for a 404 on that script.");
  }
  return found.xrm;
}

/* maxPageSize is a separate argument, not a $top in the query: Xrm.WebApi rejects $top, and the
   rejection surfaces as a thrown error rather than as ignored paging — which is how a lookup picker
   ended up silently degrading to a plain text box. */
async function dvRetrieveMultiple(logicalName, query, maxPageSize){
  const response = await xrm().WebApi.retrieveMultipleRecords(logicalName, query, maxPageSize);
  return response.entities || [];
}

/**
 * Runs a stored report through the audited Custom API and returns the shaped result.
 * Passing `drill` ({relationshipId, parentKey}) runs the related-record query behind a row instead;
 * the plugin builds that child query, so the browser never composes one of its own.
 */
async function runReportInCrm(reportId, parameterValues, drill){
  const request = {
    reportId: reportId,
    parametersJson: JSON.stringify(parameterValues || {}),
    format: "RUN",
    async: false,
    relationshipId: (drill && drill.relationshipId) || "",
    parentKey: (drill && drill.parentKey) || "",
    getMetadata: () => ({
      boundParameter: null, operationType: 0, operationName: "qdb_RunReport",
      parameterTypes: {
        reportId:       { typeName: "Edm.String",  structuralProperty: 1 },
        parametersJson: { typeName: "Edm.String",  structuralProperty: 1 },
        format:         { typeName: "Edm.String",  structuralProperty: 1 },
        async:          { typeName: "Edm.Boolean", structuralProperty: 1 },
        relationshipId: { typeName: "Edm.String",  structuralProperty: 1 },
        parentKey:      { typeName: "Edm.String",  structuralProperty: 1 }
      }
    })
  };

  const response = await xrm().WebApi.online.execute(request);
  const output = await response.json();

  /* Two error shapes reach here and only one was handled. The API's own failures arrive as
     errorCode/errorMessage, but a plugin that throws — an invalid column, a refused access list —
     comes back carrying OData's { error: { code, message } }. That shape has no errorCode, so it
     fell through to JSON.parse(undefined) and the user saw a parser complaint instead of the
     reason. C-1 defect 2 turned on exactly this: the real message existed and never reached the
     person who needed it. */
  if (output.error) throw new Error(output.error.message || output.error.code || "The report engine refused the request.");
  if (output.errorCode) throw new Error(output.errorMessage || output.errorCode);
  if (!response.ok) throw new Error(`The report engine returned ${response.status}.`);
  if (typeof output.resultJson !== "string") {
    throw new Error("The report engine returned no result.");
  }
  return JSON.parse(output.resultJson);
}

const coded = (row, attr) => row[attr] == null ? null : { code: row[attr], label: row[attr + FORMATTED] };

async function fetchCatalog(){
  const rows = await dvRetrieveMultiple("qdb_reportdefinition",
    "?$select=qdb_reportdefinitionid,qdb_name,qdb_reportcode,qdb_description,qdb_mainentitylogicalname,qdb_status"
    + "&$orderby=qdb_name&$top=200");
  return rows.map(r => ({
    id: r.qdb_reportdefinitionid, name: r.qdb_name, reportCode: r.qdb_reportcode,
    description: r.qdb_description, mainEntityLogicalName: r.qdb_mainentitylogicalname,
    status: coded(r, "qdb_status")
  }));
}

async function fetchDefinition(id){
  const parent = `?$filter=_qdb_reportdefinitionid_value eq ${id}`;
  const [definition, parameters, filters, relationships, formulas, transformations, layouts] = await Promise.all([
    xrm().WebApi.retrieveRecord("qdb_reportdefinition", id,
      "?$select=qdb_reportdefinitionid,qdb_name,qdb_reportcode,qdb_description,"
      + "qdb_mainentitylogicalname,qdb_isgoverned,qdb_rowlimit"),
    dvRetrieveMultiple("qdb_reportparameter", parent
      + "&$select=qdb_reportparameterid,qdb_parametername,qdb_label,qdb_paramtype,qdb_isrequired,"
      + "qdb_defaultvalue,qdb_defaultsource,qdb_lookuptargetentity"
      + "&$orderby=qdb_displayorder"),
    /* Filtering happens in the plugin, so the viewer never needed the filters — but a runtime-prompt
       filter names both the column it filters and the parameter that fills it, and that pairing is
       what lets a parameter offer the values its column can actually hold. */
    dvRetrieveMultiple("qdb_reportfilter", parent
      + "&$select=qdb_fieldalias,qdb_value,qdb_isruntimeprompt&$orderby=qdb_sequence"),
    dvRetrieveMultiple("qdb_reportrelationship", parent
      + "&$select=qdb_reportrelationshipid,qdb_opentype,qdb_parentkey,qdb_childalias,qdb_childkey"),
    dvRetrieveMultiple("qdb_reportformula", parent
      + "&$select=qdb_formulaalias,qdb_expression,qdb_evaluationorder&$orderby=qdb_evaluationorder"),
    dvRetrieveMultiple("qdb_reporttransformation", parent
      + "&$select=qdb_transformtype,qdb_configjson,qdb_steporder,qdb_enabled&$orderby=qdb_steporder"),
    dvRetrieveMultiple("qdb_reportlayout", parent + "&$select=qdb_layouttype,qdb_themecolor,qdb_layoutjson")
  ]);

  return {
    id: definition.qdb_reportdefinitionid,
    name: definition.qdb_name,
    reportCode: definition.qdb_reportcode,
    description: definition.qdb_description,
    mainEntityLogicalName: definition.qdb_mainentitylogicalname,
    isGoverned: definition.qdb_isgoverned,
    parameters: parameters.map(p => ({
      parameterName: p.qdb_parametername, label: p.qdb_label, paramType: coded(p, "qdb_paramtype"),
      isRequired: p.qdb_isrequired, defaultValue: p.qdb_defaultvalue,
      // Where the value comes from: typed by the user, or taken from the launch context.
      defaultSource: coded(p, "qdb_defaultsource"),
      lookupTargetEntity: p.qdb_lookuptargetentity
    })),
    filters: filters.map(f => ({
      fieldAlias: f.qdb_fieldalias, value: f.qdb_value, isRuntimePrompt: f.qdb_isruntimeprompt
    })),
    relationships: relationships.map(r => ({
      id: r.qdb_reportrelationshipid, openType: coded(r, "qdb_opentype"),
      parentKey: r.qdb_parentkey, childAlias: r.qdb_childalias, childKey: r.qdb_childkey
    })),
    formulas: formulas.map(f => ({
      formulaAlias: f.qdb_formulaalias, expression: f.qdb_expression, evaluationOrder: f.qdb_evaluationorder
    })),
    // Dispatched on the label, as the retired pipeline did — the numeric codes are 100000000-based
    // and easy to get wrong, while the label is stable and readable.
    transformations: transformations.map(t => ({
      transformType: t["qdb_transformtype@OData.Community.Display.V1.FormattedValue"],
      configJson: t.qdb_configjson, stepOrder: t.qdb_steporder, enabled: t.qdb_enabled !== false
    })),
    layout: readLayout(layouts[0])
  };
}

/**
 * The designer stores the whole layout object as JSON and the type separately. The JSON is the
 * richer source — it carries groupBy, chart type and card icon — so it wins where present, with the
 * stored option-set label as the fallback for reports saved before the JSON existed.
 */
/* ---------- fonts ----------
   Kept identical to the copy in report-designer.html on purpose: the designer is a standalone page
   and does not load this file, so the two cannot share the function. If one changes the other must,
   or type will look different in the designer from how it prints. */
const FONT_WEIGHT_VALUES = { Light: 300, Regular: 400, Semibold: 600, Bold: 700 };
const DEFAULT_TEXT_COLOUR = "#201f1e";

function fontCss(font) {
  if (!font) return "";
  const parts = [];
  if (font.family && font.family !== "Theme default") parts.push(`font-family:${font.family}`);
  if (font.size && font.size !== "Default") parts.push(`font-size:${font.size}px`);
  if (font.weight && font.weight !== "Default") parts.push(`font-weight:${FONT_WEIGHT_VALUES[font.weight] || 400}`);
  if (font.italic) parts.push("font-style:italic");
  if (font.underline) parts.push("text-decoration:underline");
  if (font.color && font.color !== DEFAULT_TEXT_COLOUR) parts.push(`color:${font.color}`);
  return parts.join(";");
}

/**
 * Maps a column to the font it was given on the canvas.
 *
 * Keyed by attribute and by lower-cased label because a result column identifies itself by alias at
 * run time and by attribute in the design, and the two agree for most reports but not all.
 */
function designFontLookup(layout) {
  const design = layout && layout.canvasDesign;
  const lookup = {};
  if (!design) return lookup;
  for (const table of design.tables || []) {
    for (const column of table.columns || []) {
      if (!column.font || column.placeholder) continue;
      if (column.attr) lookup[column.attr] = column.font;
      if (column.label) lookup[String(column.label).toLowerCase()] = column.font;
      if (column.name) lookup[String(column.name).toLowerCase()] = column.font;
    }
  }
  return lookup;
}

function readLayout(record){
  if (!record) return { type: "Tabular Report" };
  let parsed = {};
  try { parsed = JSON.parse(record.qdb_layoutjson || "{}"); } catch (e) { parsed = {}; }
  return Object.assign(
    { type: record["qdb_layouttype@OData.Community.Display.V1.FormattedValue"] || "Tabular Report" },
    parsed,
    { themeColor: record.qdb_themecolor || parsed.themeColor });
}

/* ---------------- catalog ---------------- */
async function loadCatalog(){
  const c = $("#content");
  c.innerHTML = `<div class="cmdbar"><b>Report Catalog</b><div class="header-spacer" style="flex:1"></div><button class="btn" id="reload">↻ Refresh</button></div><div class="page"><div class="empty"><span class="spinner"></span> Loading reports…</div></div>`;
  $("#reload").onclick = () => withBusyButton("#reload", "Refreshing…", loadCatalog);
  try {
    state.reports = await fetchCatalog();
    renderCatalog();
  } catch(e){ c.querySelector(".page").innerHTML = errorState(e.message); }
}
function renderCatalog(){
  const cards = state.reports.map(r => `
    <div class="card" data-open="${r.id}">
      <div class="code">${esc(r.reportCode||"REPORT")}</div>
      <h3>${esc(r.name)}</h3>
      <div class="desc">${esc(r.description||"")}</div>
      <div class="foot"><span class="chip">${esc(r.mainEntityLogicalName||"—")}</span>${r.status?`<span class="chip">${esc(r.status.label||r.status.code)}</span>`:""}</div>
    </div>`).join("");
  $("#content .page").innerHTML = state.reports.length ? `<div class="card-grid">${cards}</div>` : errorState("No reports found for this user.");
  document.querySelectorAll("[data-open]").forEach(el => el.onclick = () => withBusy(() => openReport(el.dataset.open)));
}

/* ---------------- run a report ---------------- */
async function openReport(id){
  state.view="run";
  const c=$("#content");
  const backButton = reportView.showBack ? `<button class="btn" id="back">← Catalog</button>` : "";
  c.innerHTML = `<div class="cmdbar">${backButton}<div class="header-spacer" style="flex:1"></div></div><div class="page"><div class="empty"><span class="spinner"></span> Loading report…</div></div>`;
  if (reportView.showBack) $("#back").onclick = loadCatalog;
  try {
    const def = await fetchDefinition(id);
    state.current = { def, result:null };
    renderRun();
    if (reportView.autoRun && canRunWithoutInput(def)) await runReport();
  } catch(e){
    // Shown in place, in both shells. The old behaviour offered "back to catalog", which reads as a
    // working page in a runtime that has no catalogue.
    c.innerHTML = openFailureHtml("That report could not be opened.", String(e && e.message || e));
  }
}

/* Auto-running is right when the report can actually run. If a required parameter has no value,
   running immediately either errors or returns something meaningless and the user is given no clue
   why — so show the filters and wait for them instead. */
function canRunWithoutInput(def){
  return (def.parameters || []).every(p => {
    if (!p.isRequired) return true;
    // A bound parameter needs no typing, but only counts if the launch context actually supplied it.
    if (isContextBound(p)) return !!contextValuePreview(p);
    return p.defaultValue !== null && p.defaultValue !== "";
  });
}

function renderRun(){
  const { def } = state.current;
  const params = def.parameters||[];
  const paramFields = params.map(p => {
    const label = `${esc(p.label||p.parameterName)} ${p.isRequired?'<span class="req">*</span>':''}`;

    /* A context-bound parameter is not shown at all. It is not the user's to set, and a read-only box
       holding a raw guid is noise in a filter panel. What the report is scoped by is stated once, by
       the chip in the header, in words rather than as an id. */
    if (isContextBound(p)) return "";

    return `<div class="field"><label>${label}</label>${parameterControl(p)}</div>`;
  }).join("");
  const rels = (def.relationships||[]).filter(r => r.childKey);
  const backButton = reportView.showBack ? `<button class="btn" id="back">← Catalog</button>` : "";
  const chartMenu = reportView.showChartMenu
    ? `<div class="menu-wrap"><button class="btn" id="chartBtn">📊 Chart ▾</button>
        <div class="menu" id="chartMenu">${["column","bar","line","pie"].map(t=>`<button data-chart="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}</div></div>`
    : "";
  const breadcrumb = reportView.showBreadcrumb ? `<div class="crumb">Report Catalog / <b>${esc(def.name)}</b></div>` : "";
  /* Say so when the launch context is carried. A report whose scope depends on where it was opened
     from, with nothing on screen admitting it, is the kind of quietly-wrong that nobody reports as a
     bug — they just distrust the numbers. */
  const scopeChip = reportView.contextRecordId ? `<span class="chip">Opened from a record</span>` : "";

  /* Three states, and they must match what is actually about to happen. Showing "Running…" whenever
     auto-run is merely ENABLED left a spinner turning forever on a report that had already decided
     it could not run — the one state that looks like progress and is in fact a dead end. */
  const missingRequired = (params || []).filter(p =>
    p.isRequired && (isContextBound(p) ? !contextValuePreview(p) : !p.defaultValue));
  const emptyPrompt = missingRequired.length
    ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>
       <div><b>This report needs ${esc(missingRequired.map(p => p.label || p.parameterName).join(", "))}.</b></div>
       <div style="color:var(--text-secondary); max-width:460px; margin-top:6px">${
         missingRequired.some(isContextBound)
           ? "It is scoped to a record, so open it from a record rather than from a list."
           : "Fill the parameters above, then press Run report."}</div>`
    : reportView.autoRun
      ? `<span class="spinner"></span> Running…`
      : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4h16v16H4zM4 9h16M9 9v11"/></svg>
         <div>Press <b>Run report</b> to load data.</div>`;

  $("#content").innerHTML = `
    <div class="cmdbar">
      ${backButton}
      <button class="btn primary" id="run">▶ Run report</button>
      <div class="menu-wrap"><button class="btn" id="exportBtn">⬇ Export ▾</button>
        <div class="menu" id="exportMenu">${Object.keys(EXPORT_FORMATS).map(f=>`<button data-export="${f}">${esc(EXPORT_FORMATS[f].label)}</button>`).join("")}</div></div>
      ${chartMenu}
      <div class="header-spacer" style="flex:1"></div>
    </div>
    <div class="page">
      ${breadcrumb}
      <h2 style="margin:2px 0 6px">${esc(def.name)}</h2>
      <div class="meta-row"><span><b>Code:</b> ${esc(def.reportCode||"—")}</span><span><b>Entity:</b> ${esc(def.mainEntityLogicalName||"—")}</span>
        ${def.isGoverned?'<span class="chip">Governed</span>':''}${rels.length?`<span class="chip">${rels.length} drill-path${rels.length>1?"s":""}</span>`:''}${scopeChip}</div>
      ${params.length?`<div class="panel"><h4>Parameters</h4><div class="fields">${paramFields}</div></div>`:''}
      <div id="chartHost"></div>
      <div id="resultHost"><div class="empty">${emptyPrompt}</div></div>
    </div>`;
  if (reportView.showBack) $("#back").onclick = () => withBusy(loadCatalog);
  $("#run").onclick = () => withBusyButton("#run", "Running…", runReport);
  wireMenu("#exportBtn","#exportMenu", b => exportReport(b.dataset.export));
  // Pickers fill in after paint; a failure to load options must not stop the report rendering.
  populateParameterOptions(def).catch(e => console.error("[ReportEngine] option load failed", e));
  if (reportView.showChartMenu) {
    wireMenu("#chartBtn","#chartMenu", b => withBusyButton("#chartBtn", "Charting…", async () => chartReport(b.dataset.chart)));
  }
}

/* A parameter can take its value from the launch context instead of from the user. The sources are
   the ones qdb_defaultsource has always defined — the column existed and nothing ever read it, so a
   report configured to scope itself to the current record silently ignored that instruction and
   returned the unscoped set. */
let businessUnitIdPromise = null;

function currentUserId(){
  try { return String(xrm().Utility.getGlobalContext().userSettings.userId).replace(/[{}]/g, ""); }
  catch(e){ return null; }
}

/* The business unit is not on the global context, so it costs one read of the signed-in user.
   Cached for the life of the page — it cannot change while a report is open. */
function currentBusinessUnitId(){
  if (businessUnitIdPromise) return businessUnitIdPromise;
  const userId = currentUserId();
  businessUnitIdPromise = userId
    ? xrm().WebApi.retrieveRecord("systemuser", userId, "?$select=_businessunitid_value")
        .then(row => row["_businessunitid_value"] || null).catch(() => null)
    : Promise.resolve(null);
  return businessUnitIdPromise;
}

const CONTEXT_SOURCES = {
  CurrentUser: () => currentUserId(),
  CurrentBusinessUnit: () => currentBusinessUnitId(),
  CurrentRecordId: () => reportView.contextRecordId,
  CurrentEntityContext: () => reportView.contextEntityName
};

const parameterSource = p => (p.defaultSource && (p.defaultSource.label || p.defaultSource.code)) || "Static";
const isContextBound = p => Object.prototype.hasOwnProperty.call(CONTEXT_SOURCES, parameterSource(p));

/** What a bound parameter will resolve to, as far as is known without a server call. */
function contextValuePreview(parameter){
  switch (parameterSource(parameter)) {
    case "CurrentRecordId": return reportView.contextRecordId;
    case "CurrentUser": return currentUserId();
    case "CurrentEntityContext": return reportView.contextEntityName;
    case "CurrentBusinessUnit": return "(your business unit)";
    default: return null;
  }
}

async function contextParameterValues(def){
  const values = {};
  for (const parameter of (def.parameters || [])) {
    if (!isContextBound(parameter)) continue;
    const resolved = await CONTEXT_SOURCES[parameterSource(parameter)]();
    if (resolved) values[parameter.parameterName] = String(resolved).replace(/[{}]/g, "");
  }
  return values;
}

/* The control a parameter is offered as follows its declared type, so an author choosing "Choice" or
   "Boolean" in the designer gets a list or a toggle rather than a free-text box that quietly accepts
   anything. */
const parameterChoices = parameter => String(parameter.defaultValue || "")
  .split(/[|,]/).map(choice => choice.trim()).filter(Boolean);

/* Above this many rows a picker stops being a list and becomes a haystack, so it is offered as a
   type-ahead instead — the same choice the designer already makes for its own entity pickers. */
const DROPDOWN_ROW_LIMIT = 200;

/* Metadata does not go through Xrm.WebApi: it resolves a logical name to a record collection, and
   EntityDefinitions is neither, so it answers "the entity cannot be found". Read it off the Web API
   on the signed-in session instead. $top is rejected on these endpoints — never add paging. */
async function readMetadata(path){
  const url = `${xrm().Utility.getGlobalContext().getClientUrl()}/api/data/v9.2/${path}`;
  const response = await fetch(url, { headers: { Accept: "application/json", "OData-Version": "4.0" } });
  if (!response.ok) throw new Error(`metadata ${response.status}`);
  return response.json();
}

/** The column a runtime-prompt filter fills from this parameter — the anchor for everything below. */
function filterFieldForParameter(definition, parameter){
  const filter = (definition.filters || []).find(f =>
    f.isRuntimePrompt && String(f.value || "").toLowerCase() === String(parameter.parameterName || "").toLowerCase());
  return filter ? filter.fieldAlias : null;
}

/* Where a parameter's options come from, in priority order:
     1. values the author typed into Default — an explicit, curated list always wins
     2. the option set of the column the parameter filters
     3. rows of the table that column points at
   Deriving from the column means the values offered are exactly the values it can hold, with nothing
   to configure and nothing that can drift out of step with the schema. */
async function parameterOptionSource(definition, parameter){
  const typed = parameterChoices(parameter);
  if (typed.length) return { kind: "list", options: typed.map(v => ({ value: v, label: v })) };

  const field = filterFieldForParameter(definition, parameter);
  const entity = definition.mainEntityLogicalName;
  if (!field || !entity) return { kind: "none" };

  const attribute = await readMetadata(
    `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${field}')?$select=AttributeType`);

  if (/Picklist|State|Status/i.test(attribute.AttributeType)) {
    const picklist = await readMetadata(
      `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${field}')`
      + `/Microsoft.Dynamics.CRM.${attribute.AttributeType}AttributeMetadata?$select=LogicalName&$expand=OptionSet`);
    const options = ((picklist.OptionSet || {}).Options || []).map(o => ({
      value: String(o.Value), label: (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value)
    }));
    return { kind: "list", options };
  }

  if (/Lookup|Customer|Owner/i.test(attribute.AttributeType)) {
    const lookup = await readMetadata(
      `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${field}')`
      + `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`);
    const target = parameter.lookupTargetEntity || (lookup.Targets || [])[0];
    if (!target) return { kind: "none" };
    return await lookupRowOptions(target);
  }
  return { kind: "none" };
}

/** Rows of the target table, capped — and honest about the cap rather than silently truncating. */
async function lookupRowOptions(target){
  const meta = await readMetadata(
    `EntityDefinitions(LogicalName='${target}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`);
  // One more than the limit, so "is there more than fits in a list" is answerable without counting.
  const rows = await dvRetrieveMultiple(target,
    `?$select=${meta.PrimaryIdAttribute},${meta.PrimaryNameAttribute}&$orderby=${meta.PrimaryNameAttribute}`,
    DROPDOWN_ROW_LIMIT + 1);
  const options = rows.slice(0, DROPDOWN_ROW_LIMIT).map(r => ({
    value: r[meta.PrimaryIdAttribute], label: r[meta.PrimaryNameAttribute] || "(no name)"
  }));
  return { kind: rows.length > DROPDOWN_ROW_LIMIT ? "typeahead" : "list", options, target };
}

function parameterControl(parameter){
  const name = esc(parameter.parameterName);
  const declaredType = (parameter.paramType && parameter.paramType.label) || "Text";

  if (/^bool/i.test(declaredType)) {
    // Sends "true" only when on; the DOM sweep skips an empty value, so off means "not supplied".
    return `<label class="toggle"><input type="checkbox" data-param="${name}" data-param-boolean value="true">
      <span class="track"></span><span class="tlabel">Yes</span></label>`;
  }

  /* Options come from the server, so the control is painted now and filled when they arrive. The
     host carries the name; nothing inside it is a data-param until there is something real to pick,
     so a half-loaded picker cannot contribute a value to a run. */
  if (/choice|lookup/i.test(declaredType)) {
    return `<span data-param-host="${name}" data-param-multi="${/multi/i.test(declaredType) ? "1" : ""}">
      <input class="fluent-input" placeholder="Loading options…" disabled></span>`;
  }

  const inputType = /date/i.test(declaredType) ? "date" : /number/i.test(declaredType) ? "number" : "text";
  return `<input data-param="${name}" type="${inputType}" value="${esc(parameter.defaultValue||"")}" placeholder="${esc(declaredType)}"/>`;
}

/* Fills every picker on screen. Each is resolved independently so one unreadable column cannot stop
   the others, and a failure says so in the control rather than leaving it on "Loading…" forever. */
/* A type-ahead shows names but a filter needs ids, so the mapping is kept here and applied on read.
   Putting ids in the datalist instead would show the user raw guids to choose between. */
const lookupLabelToValue = new Map();

async function populateParameterOptions(definition){
  const hosts = [...document.querySelectorAll("[data-param-host]")];
  await Promise.all(hosts.map(async host => {
    const name = host.dataset.paramHost;
    const multiple = host.dataset.paramMulti === "1";
    const parameter = (definition.parameters || []).find(p => p.parameterName === name);
    try {
      const source = await parameterOptionSource(definition, parameter);
      if (source.kind === "typeahead") {
        lookupLabelToValue.set(name, new Map(source.options.map(o => [o.label, o.value])));
      }
      host.innerHTML = optionControlHtml(name, source, multiple);
    } catch (error) {
      /* Degrading to a text box keeps the report usable, but doing it silently made a broken picker
         indistinguishable from a parameter that was always meant to be typed. The reason travels
         with the control. */
      const reason = String((error && error.message) || error);
      console.error("[ReportEngine] could not load options for " + name, error);
      host.innerHTML = `<input class="fluent-input" data-param="${esc(name)}"
        placeholder="type a value — options unavailable" title="${esc(reason)}"/>`;
    }
  }));
}

function optionControlHtml(name, source, multiple){
  if (source.kind === "none") {
    return `<input class="fluent-input" data-param="${esc(name)}" placeholder="type a value"/>`;
  }
  const options = source.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");

  /* Past a couple of hundred rows a list is unusable, so it becomes a type-ahead over a datalist.
     The typed text is the label, so the id is resolved back on read — see controlValue. */
  if (source.kind === "typeahead") {
    const listId = `opts_${esc(name)}`;
    const byLabel = source.options.map(o => `<option value="${esc(o.label)}"></option>`).join("");
    return `<input class="fluent-input" data-param="${esc(name)}" data-param-lookup list="${listId}"
        placeholder="start typing — more than ${DROPDOWN_ROW_LIMIT} to choose from"/>
      <datalist id="${listId}">${byLabel}</datalist>`;
  }
  return `<select class="fluent-select" data-param="${esc(name)}"${multiple ? " multiple" : ""}>
    ${multiple ? "" : `<option value="">(any)</option>`}${options}</select>`;
}

/* A checkbox reports the same .value whether ticked or not, and a multi-select reports only its
   first selection — so reading .value alone silently sent "true" for an untouched toggle and
   dropped every choice after the first. */
function controlValue(control){
  if (control.hasAttribute("data-param-boolean")) return control.checked ? "true" : "";
  if (control.multiple) return [...control.selectedOptions].map(o => o.value).filter(Boolean).join(",");
  if (control.hasAttribute("data-param-lookup")) {
    // The user picked a name; the filter needs the id. An unrecognised name filters nothing rather
    // than being sent through as text and matching no record for reasons nobody can see.
    const byLabel = lookupLabelToValue.get(control.dataset.param);
    return (byLabel && byLabel.get(control.value.trim())) || "";
  }
  return control.value;
}

async function collectParams(){
  const values = {};
  document.querySelectorAll("[data-param]").forEach(control => {
    const value = controlValue(control);
    if (value !== "") values[control.dataset.param] = value;
  });
  // Context wins over anything sitting in the DOM: a bound parameter is not the user's to set.
  return Object.assign(values, await contextParameterValues(state.current.def));
}

async function runReport(){
  const { def } = state.current;
  const host = $("#resultHost"); host.innerHTML = `<div class="empty"><span class="spinner"></span> Running…</div>`;
  const startedAt = Date.now();
  try {
    // The plugin returns stored columns; computed ones are derived here, then shaped (ADR-RPT-011).
    // Transformations run last so they can format a formula's output too.
    const executed = await runReportInCrm(def.id, await collectParams());
    const result = applyTransformations(applyFormulas(executed, def.formulas), def.transformations);
    result.elapsedMs = Date.now() - startedAt;
    state.current.result = result;
    renderResult(result);
    toast(`${result.rowCount} row${result.rowCount===1?"":"s"} returned`, "success");
  } catch(e){ host.innerHTML = errorState(e.message); toast(e.message,"error"); }
}

/* ---------- reading direction ----------
   The Style & Language tab has offered Arabic and Urdu, both marked right-to-left, for as long as
   it has existed, and the runtime contained no direction handling whatsoever — a grep for rtl
   returned one hit, inside the entity name qdb_repo*rtl*ayout. C-2 recorded the consequence: the
   settings dialog told authors reports render in multiple languages over a product that could not.

   Kept as a set rather than a test for "ar" because Urdu is in the same list, and a report set to
   Urdu must not quietly render left to right. */
const RTL_LANGUAGES = new Set(["ar", "ur", "he", "fa"]);

const reportLanguage = () =>
  ((state.current && state.current.def && state.current.def.layout) || {}).primaryLang || "en";

/** One source of truth for direction: the screen and every exporter must agree, or a report reads
    one way on screen and the other way in the file the user actually sends on. */
const isReportRtl = () => RTL_LANGUAGES.has(reportLanguage());

/**
 * Marks the rendered report with its language and reading direction.
 *
 * Direction is set on the host rather than per element so it applies to everything inside —
 * tables, headers, charts and anything added later — and so a report that is not right-to-left
 * says so explicitly rather than inheriting whatever the surrounding page happens to be.
 */
function applyReportDirection(host){
  if (!host) return;
  host.setAttribute("lang", reportLanguage());
  host.setAttribute("dir", isReportRtl() ? "rtl" : "ltr");
}

function renderResult(result){
  const layout = state.current.def.layout;
  const laidOut = renderLayout(result, layout);

  // Anything other than a plain table renders in its designed layout. The grid stays the fallback:
  // it is also the only view that can offer drilldown, so a layout that renders nothing falls back
  // rather than leaving the user with an empty page.
  if (laidOut) {
    $("#resultHost").innerHTML = `
      <div class="meta-row"><span><b>${result.rowCount}</b> rows</span>
        <span class="chip">${esc(layout.type)}</span>
        ${result.truncated?'<span class="chip" style="color:var(--warning)">truncated at row limit</span>':''}
        <span>${result.elapsedMs||0} ms</span>
        <button class="btn" id="asGrid" style="margin-left:auto">Show as grid</button></div>
      <div class="report-paper">${laidOut}</div>`;
    $("#asGrid").onclick = () => renderGrid(result);
    applyReportDirection($("#resultHost"));
    applyConditionalFormatting($("#resultHost"), result, layout.conditionalFormatting);
    return;
  }

  renderGrid(result);
}

function renderGrid(result){
  const rels = (state.current.def.relationships||[]).filter(r => r.childKey && r.parentKey);
  const cols = result.columns;
  const drillCol = rels.length ? rels[0] : null;
  const hasKey = drillCol && cols.some(c => c.alias===drillCol.parentKey);
  /* The grid is what most reports actually render through — the designed layouts are the exception —
     so the fonts chosen on the canvas have to be honoured here or they reach almost nobody. A result
     column names itself by alias at run time and by attribute in the design; the lookup carries both
     plus the label, because the three agree for most reports and not all. */
  const gridFont = designFontLookup(state.current.def.layout);
  const gridFontOf = c => {
    const css = fontCss(gridFont[c.alias] || gridFont[String(c.label || "").toLowerCase()]);
    return css ? ` style="${css}"` : "";
  };
  const head = cols.map(c=>`<th${gridFontOf(c)}>${esc(c.label||c.alias)}</th>`).join("") + (hasKey?`<th>Related</th>`:"");
  const rows = result.rows.map(row => {
    const tds = cols.map(c => { const cell=row.cells[c.alias]||{}; const t=cell.text==null?"":cell.text; const num=NUMERIC.test(t.replace(/[^\d.,-]/g,""))&&t!==""; return `<td class="${num?"num":""}"${gridFontOf(c)}>${esc(t)}</td>`; }).join("");
    const key = hasKey ? (row.cells[drillCol.parentKey]||{}).text : null;
    const drill = hasKey ? `<td><button class="drillbtn" data-drill="${esc(key)}">${esc(drillLabel(drillCol))} ↗</button></td>` : "";
    return `<tr>${tds}${drill}</tr>`;
  }).join("");
  $("#resultHost").innerHTML = `
    <div class="meta-row"><span><b>${result.rowCount}</b> rows</span>${result.truncated?'<span class="chip" style="color:var(--warning)">truncated at row limit</span>':''}<span>${result.elapsedMs||0} ms</span></div>
    <div class="grid-wrap"><table class="res"><thead><tr>${head}</tr></thead><tbody>${rows||`<tr><td colspan="${cols.length+1}" style="text-align:center;color:var(--text-secondary);padding:24px">No rows.</td></tr>`}</tbody></table></div>`;
  document.querySelectorAll("[data-drill]").forEach(b => b.onclick = () => drilldown(drillCol, b.dataset.drill));
  applyConditionalFormatting($("#resultHost"), result, (state.current.def.layout || {}).conditionalFormatting);
  // The grid is the path most reports render through, so direction has to be applied here too —
  // putting it only in renderResult would leave it invisible for exactly the common case.
  applyReportDirection($("#resultHost"));
}
function drillLabel(rel){ return (rel.openType&&rel.openType.label)==="OpenSubReport" ? "Sub-report" : (rel.childAlias||"Related"); }

// The child query is built and run by the plugin, not here — that is what keeps the drilldown
// audited. The browser only says which relationship to follow and from which row.
async function drilldown(rel, parentKey){
  openModal(`<div class="m-head"><b>Drilldown — ${esc(drillLabel(rel))}</b>
      <button class="icon-btn" style="color:var(--text-secondary)" onclick="closeModal()">✕</button></div>
    <div class="m-body"><div class="empty"><span class="spinner"></span> Loading related records…</div></div>`);

  try {
    const result = await runReportInCrm(state.current.def.id, {}, { relationshipId: rel.id, parentKey });
    const head = result.columns.map(c => `<th>${esc(c.label || c.alias)}</th>`).join("");
    const rows = result.rows.map(row =>
      `<tr>${result.columns.map(c => `<td>${esc((row.cells[c.alias] || {}).text || "")}</td>`).join("")}</tr>`).join("");

    $("#modal .m-body").innerHTML = `
      <div class="meta-row"><b>${esc(result.reportName)}</b><span>${result.rowCount} row${result.rowCount===1?"":"s"}</span></div>
      <div class="grid-wrap"><table class="res"><thead><tr>${head}</tr></thead><tbody>${rows
        || `<tr><td colspan="${result.columns.length}" style="text-align:center;color:var(--text-secondary);padding:20px">No related rows.</td></tr>`}</tbody></table></div>`;
  } catch (error) {
    $("#modal .m-body").innerHTML = errorState(error.message);
  }
}

/* ---------------- exports ----------------
   Produced in the browser (ADR-RPT-011): the rows are already here, so a round trip would buy
   nothing but a dependency.

   CSV and PNG need no library. Excel and PDF do, and those are loaded ON DEMAND from script web
   resources in this same solution — never a CDN. A bank's org should not need an outbound request to
   render a report, on-premise may have no internet at all, and CSP would block it anyway. Loading
   them lazily also means simply reading a report downloads none of the ~700 KB. */

const EXPORT_LIBRARIES = {
  xlsx:  { src: "qdb_reportengine_xlsx.js",              ready: () => !!window.XLSX },
  jspdf: { src: "qdb_reportengine_jspdf.js",             ready: () => !!(window.jspdf && window.jspdf.jsPDF) },
  table: { src: "qdb_reportengine_jspdf_autotable.js",   ready: () => !!(window.jspdf && window.jspdf.jsPDF
             && typeof window.jspdf.jsPDF.API.autoTable === "function") },
  // The heaviest of the four and the least often needed, so it is worth its own entry rather than
  // being folded into the jsPDF one: an English-only org never downloads it.
  arabicFont: { src: "qdb_reportengine_arabicfont.js",   ready: () => !!window.QdbReportEngineArabicFont }
};

const loadedLibraries = {};

/** Injects a script web resource once, resolving when the library has registered itself. */
function loadLibrary(key){
  const library = EXPORT_LIBRARIES[key];
  if (library.ready()) return Promise.resolve();
  if (loadedLibraries[key]) return loadedLibraries[key];

  loadedLibraries[key] = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Relative to this web resource, so it resolves inside the org whatever the host org is called.
    script.src = library.src;
    script.onload = () => library.ready()
      ? resolve()
      : reject(new Error(`${library.src} loaded but did not register — is the web resource published?`));
    script.onerror = () => reject(new Error(`Could not load ${library.src}. Deploy the export libraries with deploy-webresources.mjs.`));
    document.head.appendChild(script);
  });

  // A failed load must not be cached, or one blip disables the format for the whole session.
  loadedLibraries[key] = loadedLibraries[key].catch(error => { delete loadedLibraries[key]; throw error; });
  return loadedLibraries[key];
}

const EXPORT_FORMATS = {
  csv:   { label: "CSV",   run: exportCsv },
  excel: { label: "Excel", run: exportExcel },
  pdf:   { label: "PDF",   run: exportPdf },
  image: { label: "PNG",   run: exportPng }
};

async function exportReport(fmt){
  const result = state.current && state.current.result;
  if (!result) { toast("Run the report first.", "error"); return; }

  const format = EXPORT_FORMATS[fmt];
  if (!format) { toast(`No exporter for ${fmt}.`, "error"); return; }

  await withBusyButton("#exportBtn", `${format.label}…`, async () => {
    try {
      await format.run(result, exportBaseName());
      toast(`${format.label} downloaded`, "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

const exportBaseName = () => {
  const def = state.current.def;
  return String(def.reportCode || def.name || "report").replace(/[^\w.-]+/g, "_").slice(0, 80);
};

/** Header labels plus each row's display text — what the user sees is what they export. */
function exportRows(result){
  return {
    head: result.columns.map(c => c.label || c.alias),
    body: result.rows.map(row => result.columns.map(c => (row.cells[c.alias] || {}).text ?? ""))
  };
}

function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

/** RFC 4180 quoting, with a BOM so Excel opens UTF-8 correctly. */
function exportCsv(result, baseName){
  const { head, body } = exportRows(result);
  const quote = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [head.map(quote).join(",")]
    .concat(body.map(row => row.map(quote).join(","))).join("\r\n");

  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), baseName + ".csv");
}

async function exportExcel(result, baseName){
  await loadLibrary("xlsx");
  const { head, body } = exportRows(result);
  const sheet = XLSX.utils.aoa_to_sheet([head].concat(body));

  // Width by longest value, capped — an unbounded column is worse than a truncated one.
  sheet["!cols"] = head.map((label, i) =>
    ({ wch: Math.min(60, Math.max(10, ...body.map(r => String(r[i] ?? "").length), String(label).length + 2)) }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Report");

  // Excel reads column A first from whichever edge the sheet starts at, so an Arabic report whose
  // sheet is left-to-right comes out with its columns in the reverse of the order it is read in.
  // The cell text needs nothing — xlsx is UTF-8 throughout — only the sheet's own direction does.
  if (isReportRtl()) book.Workbook = { Views: [{ RTL: true }] };

  const data = XLSX.write(book, { bookType: "xlsx", type: "array" });
  saveBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    baseName + ".xlsx");
}

async function exportPdf(result, baseName){
  await loadLibrary("jspdf");
  await loadLibrary("table");
  const rtl = isReportRtl();
  const { head, body } = orderedForDirection(exportRows(result), rtl);

  // Landscape: report tables are wider than they are tall, and portrait squeezes columns to nothing.
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const font = rtl ? await useArabicFont(doc) : "helvetica";

  // Ordering needs no help. jsPDF's default text path already runs the bidi pass: Arabic runs come
  // out in visual order and Latin and numbers keep theirs. Passing isInputVisual:false — which an
  // earlier version of this function did — tells it the input is already visual and turns the pass
  // OFF, so the words joined correctly and then read backwards. Verified by decoding the produced
  // PDF through its own ToUnicode map; do not compare glyph ids between two PDFs, they are
  // per-document and any such comparison is meaningless.
  drawPdfHeading(doc, result, font, rtl);
  drawPdfTable(doc, head, body, font, rtl);

  saveBlob(doc.output("blob"), baseName + ".pdf");
}

function drawPdfTable(doc, head, body, font, rtl){
  doc.autoTable({
    head: [head], body, startY: 70, margin: { left: 40, right: 40 },
    styles: { font, fontSize: 8, cellPadding: 4, overflow: "linebreak", halign: rtl ? "right" : "left" },
    // Amiri is registered in one weight, so asking for bold would send jsPDF looking for a face
    // that is not there. The fill colour carries the header instead.
    headStyles: { font, fillColor: [0, 120, 212], textColor: 255, fontStyle: rtl ? "normal" : "bold" },
    alternateRowStyles: { fillColor: [247, 247, 247] }
  });
}


/**
 * Registers the bundled Arabic font on this document and returns the family to draw with.
 *
 * The PDF standard-14 fonts jsPDF falls back on contain no Arabic glyphs, so without this an Arabic
 * report exported as empty boxes and reported success. Shaping is not the gap — jsPDF substitutes
 * the presentation forms itself — which is also why the font has to carry U+FE70-FEFF, and why it
 * has to carry Latin too, or every English word in a bilingual report disappears.
 */
async function useArabicFont(doc){
  await loadLibrary("arabicFont");
  const font = window.QdbReportEngineArabicFont;
  doc.addFileToVFS(font.postScriptName, font.base64);
  doc.addFont(font.postScriptName, font.family, "normal");
  doc.setFont(font.family);
  return font.family;
}

/** Right-to-left reverses the column order so the first column sits at the right edge, matching the
    screen. autoTable lays its cells out left to right whatever the language. */
function orderedForDirection({ head, body }, rtl){
  if (!rtl) return { head, body };
  return { head: [...head].reverse(), body: body.map(row => [...row].reverse()) };
}

function drawPdfHeading(doc, result, font, rtl){
  const align = rtl ? "right" : "left";
  const x = rtl ? doc.internal.pageSize.getWidth() - 40 : 40;
  doc.setFont(font);
  doc.setFontSize(14);
  doc.text(String(state.current.def.name || "Report"), x, 40, { align });
  doc.setFontSize(9);
  doc.text(`${result.rowCount} row${result.rowCount === 1 ? "" : "s"}`, x, 56, { align });
}

const PNG_PADDING = 12;
const PNG_ROW_HEIGHT = 26;
const PNG_HEADER_HEIGHT = 34;
const PNG_TABLE_TOP = PNG_PADDING + 30;
const PNG_SCALE = 2;                    // draw at 2× so the text is not soft on a normal display
const PNG_MIN_COLUMN = 80;
const PNG_MAX_COLUMN = 320;
const PNG_TITLE_FONT = "600 14px Segoe UI, sans-serif";
const PNG_HEAD_FONT = "600 12px Segoe UI, sans-serif";
const PNG_BODY_FONT = "12px Segoe UI, sans-serif";

/**
 * Renders the on-screen report to a PNG. Drawn on a canvas rather than screenshotting the DOM, which
 * would need another library — the table is simple enough to paint directly.
 *
 * Arabic needs no font work here, unlike PDF: canvas text is laid out by the browser's own shaper,
 * so the letters join and mixed runs order themselves. What it does need is the table built from
 * the right, which is what the rtl flag threads through.
 */
async function exportPng(result, baseName){
  const { head, body } = exportRows(result);
  const rtl = isReportRtl();
  const widths = measuredColumnWidths(head, body);
  const width = widths.reduce((a, b) => a + b, 0) + PNG_PADDING * 2;
  const height = PNG_TABLE_TOP + PNG_HEADER_HEIGHT + body.length * PNG_ROW_HEIGHT + PNG_PADDING;

  const ctx = pngContext(width, height, rtl);
  drawPngTitle(ctx, width, rtl);
  drawPngHead(ctx, head, widths, width, rtl);
  drawPngBody(ctx, body, widths, width, rtl);

  const blob = await new Promise(resolve => ctx.canvas.toBlob(resolve, "image/png"));
  saveBlob(blob, baseName + ".png");
}

/** Widths from real glyph widths. The old estimate of 7px per character is wrong for any
    proportional font and badly wrong for Arabic, where it clipped values that would have fitted. */
function measuredColumnWidths(head, body){
  const measure = document.createElement("canvas").getContext("2d");
  const widthOf = (text, font) => { measure.font = font; return measure.measureText(String(text ?? "")).width; };

  return head.map((label, i) => {
    // reduce, not Math.max(...spread): a report at the row limit would overflow the argument list.
    const widest = body.reduce((max, row) => Math.max(max, widthOf(row[i], PNG_BODY_FONT)),
      widthOf(label, PNG_HEAD_FONT));
    return Math.min(PNG_MAX_COLUMN, Math.max(PNG_MIN_COLUMN, widest + 16));
  });
}

function pngContext(width, height, rtl){
  const canvas = document.createElement("canvas");
  canvas.width = width * PNG_SCALE;
  canvas.height = height * PNG_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(PNG_SCALE, PNG_SCALE);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return ctx;
}

/** Left edge of the cell at logical index i. Right-to-left puts the first column against the right
    edge, so the exported table is read in the same order as the report on screen. */
function cellLeft(widths, i, rtl){
  const before = widths.slice(0, i).reduce((a, b) => a + b, 0);
  if (!rtl) return PNG_PADDING + before;
  return PNG_PADDING + widths.reduce((a, b) => a + b, 0) - before - widths[i];
}

function drawCellText(ctx, text, widths, i, baseline, rtl){
  const left = cellLeft(widths, i, rtl);
  ctx.textAlign = rtl ? "right" : "left";
  const x = rtl ? left + widths[i] - 6 : left + 6;
  ctx.fillText(clipToWidth(ctx, String(text ?? ""), widths[i] - 12), x, baseline);
}

function drawPngTitle(ctx, width, rtl){
  ctx.fillStyle = "#201f1e";
  ctx.font = PNG_TITLE_FONT;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(String(state.current.def.name || "Report"),
    rtl ? width - PNG_PADDING : PNG_PADDING, PNG_PADDING + 14);
}

function drawPngHead(ctx, head, widths, width, rtl){
  ctx.fillStyle = "#0078d4";
  ctx.fillRect(PNG_PADDING, PNG_TABLE_TOP, width - PNG_PADDING * 2, PNG_HEADER_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = PNG_HEAD_FONT;
  head.forEach((label, i) => drawCellText(ctx, label, widths, i, PNG_TABLE_TOP + 22, rtl));
}

function drawPngBody(ctx, body, widths, width, rtl){
  ctx.font = PNG_BODY_FONT;
  let y = PNG_TABLE_TOP + PNG_HEADER_HEIGHT;
  body.forEach((row, index) => {
    ctx.fillStyle = index % 2 ? "#f7f7f7" : "#ffffff";
    ctx.fillRect(PNG_PADDING, y, width - PNG_PADDING * 2, PNG_ROW_HEIGHT);
    ctx.fillStyle = "#201f1e";
    row.forEach((cell, i) => drawCellText(ctx, cell, widths, i, y + 18, rtl));
    y += PNG_ROW_HEIGHT;
  });
}

/** Trims with an ellipsis so a long value cannot bleed into the next column. */
function clipToWidth(ctx, text, maxWidth){
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(clipped + "…").width > maxWidth) clipped = clipped.slice(0, -1);
  return clipped + "…";
}

/** Charts render client-side from rows already fetched, reusing the dashboard widget renderers. */
function chartReport(type){
  const result = state.current && state.current.result;
  const host = $("#chartHost");
  if (!result || !result.rows.length) { toast("Run the report first.", "error"); return; }

  const points = chartPoints(result);
  if (!points.length) { toast("No numeric column to chart.", "error"); return; }

  const body = (type === "pie") ? wDonut(points) : wBars(points);
  host.innerHTML = `<div class="chartbox" style="text-align:left"><div class="wt">${esc(type[0].toUpperCase()+type.slice(1))} — ${esc(points.length)} groups</div>${body}
    <div style="margin-top:8px"><button class="btn" id="closeChart">Hide chart</button></div></div>`;
  $("#closeChart").onclick = () => { host.innerHTML = ""; };
}

/** Labels from the first text column, values from the first numeric one. */
function chartPoints(result){
  const numericOf = text => parseFloat(String(text ?? "").replace(/[^\d.-]/g, ""));
  const valueCol = result.columns.find(c =>
    result.rows.some(r => !isNaN(numericOf((r.cells[c.alias] || {}).text))));
  if (!valueCol) return [];
  const labelCol = result.columns.find(c => c.alias !== valueCol.alias) || valueCol;

  return result.rows.map(r => ({
    label: (r.cells[labelCol.alias] || {}).text || "—",
    value: numericOf((r.cells[valueCol.alias] || {}).text) || 0
  }));
}

function notPortedNotice(what, why){
  return `<div class="empty"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>
    <div><b>${esc(what)} is not available yet.</b></div>
    <div style="color:var(--text-secondary); max-width:420px; margin-top:6px">${esc(why)}</div></div>`;
}

/* ---------------- identity ----------------
   Nothing to configure any more. The engine runs inside CRM, so the acting user is the signed-in
   session and cannot be chosen — which is why the forgeable caller header and the API base URL are
   both gone (ADR-RPT-011). */
function openSettings(){
  openModal(`<div class="m-head"><b>Identity</b><button class="icon-btn" style="color:var(--text-secondary)" onclick="closeModal()">✕</button></div>
    <div class="m-body">
      <div class="meta-row"><span><b>Signed in as</b></span><span>${esc(state.callerName)}</span></div>
      <p style="color:var(--text-secondary); font-size:12px; margin-top:10px">
        Reports run as you. Every query executes in your CRM session, so Dataverse applies your own
        row and table security — there is no service account and no identity to select.
        Each run is recorded in the report execution log.</p>
      <div style="text-align:right; margin-top:8px"><button class="btn primary" onclick="closeModal()">Close</button></div>
    </div>`);
}

/* ---------------- dashboards ---------------- */
const PAL = ["#0078d4","#2899f5","#00b7c3","#498205","#8764b8","#e3008c","#ca5010","#986f0b"];
/* Dashboards follow the same split as reports: the catalogue and layout are configuration and are
   read directly, while the data goes through qdb_RunDashboard — the call that writes the audit
   record. Querying each widget from here would leave the fan-out unlogged. */

async function fetchDashboards(){
  const rows = await dvRetrieveMultiple("qdb_dashboard",
    "?$select=qdb_dashboardid,qdb_dashboardname&$orderby=qdb_dashboardname&$top=200");
  return rows.map(r => ({ id: r.qdb_dashboardid, title: r.qdb_dashboardname }));
}

/** Sections and widgets, for laying the tiles out before their data arrives. */
async function fetchDashboardLayout(id){
  const sections = await dvRetrieveMultiple("qdb_dashboardsection",
    `?$filter=_qdb_dashboardid_value eq ${id}&$select=qdb_dashboardsectionid,qdb_dashboardsectionname,qdb_columns&$orderby=qdb_sequence`);

  const laid = [];
  for (const section of sections) {
    const widgets = await dvRetrieveMultiple("qdb_dashboardwidget",
      `?$filter=_qdb_dashboardsectionid_value eq ${section.qdb_dashboardsectionid}`
      + "&$select=qdb_dashboardwidgetid,qdb_dashboardwidgetname,qdb_kind,qdb_charttype&$orderby=qdb_sequence");
    laid.push({
      title: section.qdb_dashboardsectionname,
      columns: Math.min(Math.max(section.qdb_columns || 3, 1), 4),
      widgets: widgets.map(w => ({
        id: w.qdb_dashboardwidgetid, title: w.qdb_dashboardwidgetname,
        kind: w.qdb_kind || "Metric", chartType: w.qdb_charttype
      }))
    });
  }
  return laid;
}

async function runDashboardInCrm(dashboardId){
  const request = {
    dashboardId: dashboardId,
    getMetadata: () => ({
      boundParameter: null, operationType: 0, operationName: "qdb_RunDashboard",
      parameterTypes: { dashboardId: { typeName: "Edm.String", structuralProperty: 1 } }
    })
  };
  const response = await xrm().WebApi.online.execute(request);
  const output = await response.json();

  /* Two error shapes reach here and only one was handled. The API's own failures arrive as
     errorCode/errorMessage, but a plugin that throws — an invalid column, a refused access list —
     comes back carrying OData's { error: { code, message } }. That shape has no errorCode, so it
     fell through to JSON.parse(undefined) and the user saw a parser complaint instead of the
     reason. C-1 defect 2 turned on exactly this: the real message existed and never reached the
     person who needed it. */
  if (output.error) throw new Error(output.error.message || output.error.code || "The report engine refused the request.");
  if (output.errorCode) throw new Error(output.errorMessage || output.errorCode);
  if (!response.ok) throw new Error(`The report engine returned ${response.status}.`);
  if (typeof output.resultJson !== "string") {
    throw new Error("The report engine returned no result.");
  }
  return JSON.parse(output.resultJson);
}

async function loadDashboards(){
  state.view = "dashboards";
  $("#content").innerHTML = `<div class="cmdbar"><b>Dashboards</b><div class="header-spacer" style="flex:1"></div>
    <button class="btn" id="dreload">↻ Refresh</button></div>
    <div class="page"><div class="empty"><span class="spinner"></span> Loading dashboards…</div></div>`;
  $("#dreload").onclick = () => withBusyButton("#dreload", "Refreshing…", loadDashboards);

  try {
    const dashboards = await fetchDashboards();
    $("#content .page").innerHTML = dashboards.length
      ? `<div class="card-grid">${dashboards.map(d =>
          `<div class="card" data-dash="${esc(d.id)}"><div class="code">DASHBOARD</div><h3>${esc(d.title)}</h3></div>`).join("")}</div>`
      : errorState("No dashboards are visible to you.");
    document.querySelectorAll("[data-dash]").forEach(el => el.onclick = () => withBusy(() => openDashboard(el.dataset.dash, el.querySelector("h3").textContent)));
  } catch (error) {
    $("#content .page").innerHTML = errorState(error.message);
  }
}

async function openDashboard(id, title){
  state.view = "dashrun";
  $("#content").innerHTML = `<div class="cmdbar"><button class="btn" id="back">← Dashboards</button>
    <b style="margin-left:6px">${esc(title || "Dashboard")}</b><div class="header-spacer" style="flex:1"></div></div>
    <div class="page"><div class="empty"><span class="spinner"></span> Running widgets…</div></div>`;
  $("#back").onclick = () => withBusy(loadDashboards);

  try {
    const [layout, result] = await Promise.all([fetchDashboardLayout(id), runDashboardInCrm(id)]);
    const byId = {};
    for (const widget of result.widgets) byId[widget.widgetId] = widget;

    $("#content .page").innerHTML = layout.map(section => `
      <div class="dash-sec">${section.title ? `<div class="sec-title">${esc(section.title)}</div>` : ""}
        <div class="dash-grid" style="grid-template-columns:repeat(${section.columns},1fr)">
          ${section.widgets.map(w => renderWidgetTile(w, byId[w.id])).join("")}
        </div></div>`).join("") || errorState("This dashboard has no widgets.");
  } catch (error) {
    $("#content .page").innerHTML = errorState(error.message);
  }
}

function renderWidgetTile(widget, result){
  const data = (result && result.data) || [];
  let body;

  if (!result) body = `<div class="werror">no result</div>`;
  else if (result.accessDenied) body = `<div class="werror">No access</div>`;   // AUTH-C-8
  else if (result.error) body = `<div class="werror">${esc(result.error.message || result.error.code)}</div>`;
  else if (!data.length) body = `<div class="kpi-sub">No data</div>`;
  else if (/chart/i.test(widget.kind)) body = /pie|donut/i.test(widget.chartType || "") ? wDonut(data) : wBars(data);
  else if (data.length === 1) body = `<div class="kpi">${compact(data[0].value)}</div><div class="kpi-sub">${esc(data[0].label)}</div>`;
  else body = wBars(data);

  return `<div class="widget"><div class="wt">${esc(widget.title || widget.kind)}</div>${body}</div>`;
}
const sumV = d => d.reduce((a,p)=>a+(+p.value||0),0);
function compact(v){ v=+v||0; const a=Math.abs(v); if(a>=1e9) return (v/1e9).toFixed(1)+"bn"; if(a>=1e6) return (v/1e6).toFixed(1)+"M"; if(a>=1e3) return (v/1e3).toFixed(1)+"k"; return String(Math.round(v*100)/100); }
function wBars(d){ if(!d.length) return `<div class="kpi-sub">No data</div>`; const max=Math.max(...d.map(p=>+p.value||0),1); return `<div class="bars">${d.map((p,i)=>`<div class="bar-row"><span class="bl" title="${esc(p.label)}">${esc(p.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,(+p.value/max)*100)}%;background:${PAL[i%PAL.length]}"></div></div><span class="bv">${compact(p.value)}</span></div>`).join("")}</div>`; }
function wDonut(d){ if(!d.length) return `<div class="kpi-sub">No data</div>`; const total=sumV(d)||1; let acc=0; const stops=d.map((p,i)=>{const a0=acc/total*360; acc+=(+p.value||0); return `${PAL[i%PAL.length]} ${a0}deg ${acc/total*360}deg`;}).join(","); const legend=d.map((p,i)=>`<div class="li"><span class="dot" style="background:${PAL[i%PAL.length]}"></span><span class="bl" style="flex:1" title="${esc(p.label)}">${esc(p.label)}</span><b>${compact(p.value)}</b></div>`).join(""); return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div class="donut-c">${compact(total)}</div></div><div class="legend">${legend}</div></div>`; }

/* ---------------- shared UI ---------------- */
function wireMenu(btnSel, menuSel, onPick){
  const btn=$(btnSel), menu=$(menuSel);
  btn.onclick = (e)=>{ e.stopPropagation(); document.querySelectorAll(".menu.open").forEach(m=>m!==menu&&m.classList.remove("open")); menu.classList.toggle("open"); };
  menu.querySelectorAll("button").forEach(b => b.onclick = ()=>{ menu.classList.remove("open"); onPick(b); });
}
function errorState(msg){ return `<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/></svg><div style="color:var(--error)">${esc(msg)}</div><div style="margin-top:8px"><button class="btn" onclick="loadCatalog()">Back to catalog</button></div></div>`; }
function openModal(html){ $("#modal").innerHTML=html; $("#modalBack").classList.add("open"); }
function closeModal(){ $("#modalBack").classList.remove("open"); }

/* ---------------- formulas ----------------
   Computed columns are evaluated here, over rows the plugin has already returned (ADR-RPT-011).

   The expression language is parsed and walked, never executed: no eval, no Function, no template
   interpolation. That is a hard requirement (C-5) — a report definition is data a power user edits,
   so an expression must never be able to become code. The evaluator understands only arithmetic,
   comparison, logic and a fixed function list; anything else fails to parse and the cell goes blank
   rather than breaking the report, matching how NCalc behaved in the retired middle tier. */

const FORMULA_FUNCTIONS = {
  if: (test, whenTrue, whenFalse) => truthy(test) ? whenTrue : whenFalse,
  abs: n => Math.abs(number(n)),
  round: (n, places) => { const p = Math.pow(10, number(places) || 0); return Math.round(number(n) * p) / p; },
  min: (...values) => Math.min(...values.map(number)),
  max: (...values) => Math.max(...values.map(number)),
  len: s => String(s ?? "").length,
  upper: s => String(s ?? "").toUpperCase(),
  lower: s => String(s ?? "").toLowerCase(),
  concat: (...values) => values.map(v => v == null ? "" : String(v)).join(""),
  coalesce: (...values) => values.find(v => v != null && v !== "") ?? null
};

function number(value){ const n = parseFloat(String(value ?? "").replace(/[^\d.eE+-]/g, "")); return isNaN(n) ? 0 : n; }
function truthy(value){ return !(value == null || value === false || value === 0 || value === "" || value === "false"); }

/** Null and undefined read as an empty string, so a blank cell compares equal to ''. */
function comparableText(value){ return value == null ? "" : String(value); }

/**
 * Whether a value should be treated as a number by `+`. Report cells often arrive already formatted
 * ("1,250", "QAR 300"), and someone writing `amount + fee` means arithmetic — so a numeric-looking
 * string counts. Genuine text still concatenates, and concat() is there when joining is the intent.
 */
function looksNumeric(value){
  if (typeof value === "number") return true;
  if (typeof value !== "string") return false;
  const cleaned = value.replace(/[\s,]/g, "").replace(/^[^\d.eE+-]+/, "");
  return cleaned !== "" && isFinite(Number(cleaned));
}

/** Splits an expression into literals, identifiers, operators and punctuation. */
function tokenizeFormula(expression){
  const pattern = /\s*(>=|<=|==|!=|<>|&&|\|\||[+\-*/%(),<>]|'[^']*'|"[^"]*"|[0-9]*\.?[0-9]+|[A-Za-z_][A-Za-z0-9_.]*)/g;
  const tokens = [];
  let match, consumed = 0;
  while ((match = pattern.exec(expression)) !== null) {
    if (match.index !== consumed) break;          // an unrecognised character — stop, expression is invalid
    consumed = pattern.lastIndex;
    tokens.push(match[1]);
  }
  if (consumed !== expression.length) throw new Error("Unrecognised characters in expression");
  return tokens;
}

const BINARY_PRECEDENCE = {
  "||": 1, "or": 1, "&&": 2, "and": 2,
  "==": 3, "!=": 3, "<>": 3, "<": 4, "<=": 4, ">": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6
};

/** Precedence-climbing parser producing a plain AST — no code is generated at any point. */
function parseFormula(tokens){
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  function parseExpression(minimumPrecedence){
    let left = parsePrimary();
    while (true) {
      const operator = peek();
      const precedence = BINARY_PRECEDENCE[String(operator || "").toLowerCase()];
      if (!operator || precedence === undefined || precedence < minimumPrecedence) return left;
      take();
      left = { kind: "binary", operator: String(operator).toLowerCase(), left, right: parseExpression(precedence + 1) };
    }
  }

  function parsePrimary(){
    const token = take();
    if (token === undefined) throw new Error("Unexpected end of expression");
    if (token === "(") { const inner = parseExpression(1); expect(")"); return inner; }
    if (token === "-") return { kind: "negate", operand: parsePrimary() };
    if (/^['"]/.test(token)) return { kind: "literal", value: token.slice(1, -1) };
    if (/^[0-9.]/.test(token)) return { kind: "literal", value: parseFloat(token) };
    if (peek() === "(") { take(); return { kind: "call", name: token.toLowerCase(), args: parseArguments() }; }
    if (/^(true|false)$/i.test(token)) return { kind: "literal", value: /^true$/i.test(token) };
    return { kind: "column", name: token };
  }

  function parseArguments(){
    const args = [];
    if (peek() === ")") { take(); return args; }
    while (true) {
      args.push(parseExpression(1));
      const separator = take();
      if (separator === ")") return args;
      if (separator !== ",") throw new Error("Expected , or ) in arguments");
    }
  }

  function expect(token){ if (take() !== token) throw new Error("Expected " + token); }

  const ast = parseExpression(1);
  if (position !== tokens.length) throw new Error("Trailing characters in expression");
  return ast;
}

function evaluateFormula(node, values){
  switch (node.kind) {
    case "literal": return node.value;
    case "column": return values[node.name] ?? null;
    case "negate": return -number(evaluateFormula(node.operand, values));
    case "call": return callFormulaFunction(node, values);
    case "binary": return applyFormulaOperator(node, values);
    default: throw new Error("Unsupported expression");
  }
}

function callFormulaFunction(node, values){
  const fn = Object.prototype.hasOwnProperty.call(FORMULA_FUNCTIONS, node.name) ? FORMULA_FUNCTIONS[node.name] : null;
  if (!fn) throw new Error("Unknown function " + node.name);
  return fn(...node.args.map(arg => evaluateFormula(arg, values)));
}

/**
 * `+` is the one ambiguous operator: it both adds and joins. An empty cell is ambiguous too, so the
 * other operand decides — `revenue + fee` with no fee is revenue, while `first + last` with no first
 * is last. Only when neither side is a number does it concatenate.
 */
function addOrConcat(left, right){
  const blank = value => value == null || value === "";
  const numericOrBlank = value => looksNumeric(value) || blank(value);

  if ((looksNumeric(left) || looksNumeric(right)) && numericOrBlank(left) && numericOrBlank(right)) {
    return number(left) + number(right);
  }
  return String(left ?? "") + String(right ?? "");
}

function applyFormulaOperator(node, values){
  const left = evaluateFormula(node.left, values);
  // Short-circuit so `if(x != 0 && 10/x > 1, …)` behaves as written.
  if (node.operator === "&&" || node.operator === "and") return truthy(left) ? truthy(evaluateFormula(node.right, values)) : false;
  if (node.operator === "||" || node.operator === "or") return truthy(left) ? true : truthy(evaluateFormula(node.right, values));

  const right = evaluateFormula(node.right, values);
  switch (node.operator) {
    case "+": return addOrConcat(left, right);
    case "-": return number(left) - number(right);
    case "*": return number(left) * number(right);
    case "/": return number(right) === 0 ? null : number(left) / number(right);
    case "%": return number(right) === 0 ? null : number(left) % number(right);
    // Compared as text, with an empty cell reading as "" rather than "null" — `field != ''` must be
    // false for a blank value, which is the most common way a formula tests for one.
    case "==": return comparableText(left) === comparableText(right);
    case "!=": case "<>": return comparableText(left) !== comparableText(right);
    case "<": return number(left) < number(right);
    case "<=": return number(left) <= number(right);
    case ">": return number(left) > number(right);
    case ">=": return number(left) >= number(right);
    default: throw new Error("Unsupported operator " + node.operator);
  }
}

/**
 * Appends a computed column per formula, in evaluation order so a later formula can reference an
 * earlier one. A formula that cannot be parsed or evaluated yields a blank cell — one bad expression
 * must never cost the user the rest of the report.
 */
function applyFormulas(result, formulas){
  const ordered = (formulas || []).slice().sort((a, b) => (a.evaluationOrder || 0) - (b.evaluationOrder || 0));
  if (!ordered.length) return result;

  const compiled = ordered.map(formula => {
    try { return { alias: formula.formulaAlias, ast: parseFormula(tokenizeFormula(formula.expression || "")) }; }
    catch (error) { return { alias: formula.formulaAlias, ast: null, error: error.message }; }
  });

  for (const formula of compiled) {
    result.columns.push({ alias: formula.alias, label: formula.alias, attribute: null, isVisible: true, isFormula: true });
  }

  for (const row of result.rows) {
    const values = {};
    for (const column of result.columns) {
      if (!column.isFormula) values[column.alias] = (row.cells[column.alias] || {}).value;
    }
    for (const formula of compiled) {
      let computed = null;
      if (formula.ast) {
        try { computed = evaluateFormula(formula.ast, values); } catch (error) { computed = null; }
      }
      values[formula.alias] = computed;
      row.cells[formula.alias] = { value: computed, text: computed == null ? "" : String(computed) };
    }
  }

  return result;
}

/* ---------------- transformations ----------------
   Post-query shaping, applied after formulas so a computed column can be formatted too — the order
   the retired C# pipeline used. Ported from it verbatim in behaviour: dispatch on the type LABEL,
   skip disabled steps, run in StepOrder, and pass the result through untouched when a step's type is
   unimplemented or its config will not parse. A misconfigured step must never cost the user the
   report. Formatting rewrites a cell's display text and leaves its underlying value alone, so
   filters, formulas and exports keep seeing real data. */

const TRANSFORMATIONS = {
  RenameColumns: (result, config) => {
    const renames = config.renames || {};
    for (const column of result.columns) {
      if (typeof renames[column.alias] === "string") column.label = renames[column.alias];
    }
    return result;
  },

  NullHandling: (result, config) => {
    const perColumn = config.columns || {};
    return mapCells(result, (alias, cell) => {
      if (cell.text) return cell;
      const replacement = perColumn[alias] ?? config.default;
      return replacement == null ? cell : { value: cell.value, text: replacement };
    });
  },

  Masking: (result, config) => {
    const columns = new Set(Array.isArray(config.columns) ? config.columns : []);
    const keepLast = Math.max(parseInt(config.keepLast, 10) || 0, 0);
    const maskChar = (typeof config.mask === "string" && config.mask.length) ? config.mask[0] : "*";
    return mapCells(result, (alias, cell) =>
      columns.has(alias) && cell.text ? { value: cell.value, text: maskText(cell.text, keepLast, maskChar) } : cell);
  },

  NumberFormat: (result, config) => {
    const decimals = Math.max(parseInt(config.decimals, 10) || 0, 0);
    const thousands = config.thousands !== false;
    return formatColumns(result, config.columns, cell => {
      const n = toNumberOrNull(cell);
      return n === null ? cell.text : formatNumber(n, decimals, thousands);
    });
  },

  CurrencyFormat: (result, config) => {
    const symbol = typeof config.symbol === "string" ? config.symbol : "QAR";
    const decimals = config.decimals == null ? 2 : Math.max(parseInt(config.decimals, 10) || 0, 0);
    return formatColumns(result, config.columns, cell => {
      const n = toNumberOrNull(cell);
      return n === null ? cell.text : `${symbol} ${formatNumber(n, decimals, true)}`;
    });
  },

  DateFormat: (result, config) => {
    const format = (typeof config.format === "string" && config.format.length) ? config.format : "yyyy-MM-dd";
    return formatColumns(result, config.columns, cell => {
      const date = toDateOrNull(cell);
      return date === null ? cell.text : formatDate(date, format);
    });
  },

  Mapping: (result, config) => {
    if (typeof config.column !== "string") return result;
    const map = config.map || {};
    return mapCells(result, (alias, cell) => {
      if (alias !== config.column) return cell;
      const key = String(cell.value ?? cell.text ?? "");
      if (Object.prototype.hasOwnProperty.call(map, key)) return { value: cell.value, text: map[key] };
      return config.default == null ? cell : { value: cell.value, text: config.default };
    });
  },

  // { "column": "fullname", "delimiter": " ", "into": ["first","last"] }
  SplitValues: (result, config) => {
    if (typeof config.column !== "string" || !Array.isArray(config.into) || !config.into.length) return result;
    const delimiter = typeof config.delimiter === "string" ? config.delimiter : " ";

    for (const alias of config.into) {
      result.columns.push({ alias, label: alias, attribute: null, isVisible: true });
    }
    for (const row of result.rows) {
      const parts = String((row.cells[config.column] || {}).text ?? "").split(delimiter);
      config.into.forEach((alias, i) => {
        const value = parts[i] ?? "";
        row.cells[alias] = { value, text: value };
      });
    }
    return result;
  },

  /* { "columns": ["statuscode"] } — or omit columns to apply to all.
     The plugin already returns each cell's formatted label alongside its raw value, so resolving a
     choice is a matter of promoting that text to the value: exports and formulas then carry "Active"
     rather than 0, which is what someone asking for label resolution wants. */
  ChoiceLabelResolution: (result, config) => {
    const named = Array.isArray(config.columns) ? new Set(config.columns) : null;
    return mapCells(result, (alias, cell) =>
      (!named || named.has(alias)) && cell.text ? { value: cell.text, text: cell.text } : cell);
  },

  // { "alias": "total", "label": "Total", "expression": "amount * 1.05" }
  Formula: (result, config) => {
    if (typeof config.alias !== "string" || typeof config.expression !== "string") return result;
    // Reuses the computed-column engine, so a formula step and the Formulas tab behave identically.
    return applyFormulas(result, [{ formulaAlias: config.alias, expression: config.expression, evaluationOrder: 1 }]);
  },

  // { "column": "status", "condition": "value > 90", "then": "Overdue", "else": "Current" }
  ConditionalValue: (result, config) => {
    if (typeof config.column !== "string" || typeof config.condition !== "string") return result;
    let ast;
    try { ast = parseFormula(tokenizeFormula(config.condition)); } catch (error) { return result; }

    for (const row of result.rows) {
      const scope = {};
      for (const column of result.columns) scope[column.alias] = (row.cells[column.alias] || {}).value;
      scope.value = scope[config.column];

      let matched = false;
      try { matched = truthy(evaluateFormula(ast, scope)); } catch (error) { continue; }
      const replacement = matched ? config.then : config.else;
      if (replacement === undefined) continue;
      row.cells[config.column] = { value: replacement, text: String(replacement) };
    }
    return result;
  },

  // { "column": "payload", "fields": { "iban": "Bank IBAN" } }
  JsonFlatten: (result, config) => {
    if (typeof config.column !== "string" || !config.fields) return result;
    const fields = Object.keys(config.fields);
    for (const key of fields) {
      result.columns.push({ alias: key, label: config.fields[key] || key, attribute: null, isVisible: true });
    }

    for (const row of result.rows) {
      let parsed = {};
      // A row whose JSON will not parse yields blanks rather than failing the report.
      try { parsed = JSON.parse((row.cells[config.column] || {}).text || "{}"); } catch (error) { parsed = {}; }
      for (const key of fields) {
        const value = parsed[key];
        row.cells[key] = { value: value ?? null, text: value == null ? "" : String(value) };
      }
    }
    return result;
  },

  MergeColumns: (result, config) => {
    const sources = Array.isArray(config.columns) ? config.columns : [];
    if (!sources.length || typeof config.into !== "string") return result;
    const separator = typeof config.separator === "string" ? config.separator : " ";

    result.columns.push({ alias: config.into, label: config.label || config.into, attribute: null, isVisible: true });
    for (const row of result.rows) {
      const merged = sources.map(a => (row.cells[a] || {}).text).filter(t => t).join(separator);
      row.cells[config.into] = { value: merged, text: merged };
    }
    return result;
  }
};

function mapCells(result, transform){
  for (const row of result.rows) {
    for (const alias of Object.keys(row.cells)) row.cells[alias] = transform(alias, row.cells[alias]);
  }
  return result;
}

function formatColumns(result, columns, format){
  const target = new Set(Array.isArray(columns) ? columns : []);
  return mapCells(result, (alias, cell) =>
    target.has(alias) && cell.text ? { value: cell.value, text: format(cell) } : cell);
}

function maskText(text, keepLast, maskChar){
  return keepLast >= text.length ? text : maskChar.repeat(text.length - keepLast) + text.slice(text.length - keepLast);
}

/** Uses the raw value when it is numeric, falling back to parsing the display text. */
function toNumberOrNull(cell){
  const source = (cell.value == null || cell.value === "") ? cell.text : cell.value;
  if (source == null || source === "") return null;
  const parsed = parseFloat(String(source).replace(/[^\d.eE+-]/g, ""));
  return isNaN(parsed) ? null : parsed;
}

function toDateOrNull(cell){
  const parsed = new Date(cell.value ?? cell.text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatNumber(value, decimals, thousands){
  const [whole, fraction] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = thousands ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return (value < 0 ? "-" : "") + grouped + (fraction ? "." + fraction : "");
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Supports the .NET-style tokens the designer offers; anything else is left as written. */
function formatDate(date, format){
  const pad = n => String(n).padStart(2, "0");
  const tokens = {
    yyyy: date.getFullYear(), MMM: MONTHS[date.getMonth()], MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()), HH: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds())
  };
  return format.replace(/yyyy|MMM|MM|dd|HH|mm|ss/g, token => tokens[token]);
}

function applyTransformations(result, transformations){
  const steps = (transformations || [])
    .filter(step => step.enabled !== false)
    .slice()
    .sort((a, b) => (a.stepOrder || 0) - (b.stepOrder || 0));

  for (const step of steps) {
    const apply = TRANSFORMATIONS[step.transformType];
    if (!apply) continue;                                  // type not implemented yet — pass through
    let config;
    try { config = JSON.parse(step.configJson || "{}"); } catch (e) { continue; }
    try { result = apply(result, config) || result; } catch (e) { /* leave the result as it was */ }
  }
  return result;
}

/* ---------------- conditional formatting ----------------
   Rules are {column, condition, style}. The condition reuses the formula evaluator — the designer
   already tells users it "evaluates with the same sandboxed engine as formulas", so honouring that
   keeps one expression language and one security story rather than inventing a second one.

   `value` is bound to the cell under test, and every column is in scope too, so a rule can say
   `value > 1000000` or `status == 'Overdue' && value > 0`.

   Styling is applied to the DOM after rendering rather than woven into the markup, because the
   layout renderer escapes everything it emits — injecting styled HTML through it would surface as
   visible tags. Walking the table afterwards also means the grid and the table-based layouts are
   formatted by the same code. */

const FORMATTING_STYLES = {
  "Bold, red text": "cf-bold cf-red",
  "Green background": "cf-green",
  "Amber highlight": "cf-amber",
  "Strikethrough": "cf-strike",
  "Bold": "cf-bold"
};

/** Compiles each rule once; a rule that will not parse is dropped rather than failing the report. */
function compileFormatting(rules){
  return (rules || []).map(rule => {
    try { return { column: rule.column, style: rule.style, ast: parseFormula(tokenizeFormula(rule.condition || "")) }; }
    catch (error) { return null; }
  }).filter(Boolean);
}

/**
 * Works out the style class for every cell, returned as rowIndex → alias → class. Column names in
 * a rule may be either the stored alias or the label the designer showed, so both are accepted.
 */
function evaluateFormatting(result, rules){
  const compiled = compileFormatting(rules);
  if (!compiled.length) return null;

  const aliasFor = name => {
    const match = result.columns.find(c => c.alias === name || c.label === name);
    return match ? match.alias : name;
  };

  return result.rows.map(row => {
    const scope = {};
    for (const column of result.columns) scope[column.alias] = (row.cells[column.alias] || {}).value;

    const styles = {};
    for (const rule of compiled) {
      const alias = aliasFor(rule.column);
      if (!(alias in row.cells)) continue;
      let matched = false;
      try { matched = truthy(evaluateFormula(rule.ast, Object.assign({}, scope, { value: scope[alias] }))); }
      catch (error) { matched = false; }
      if (matched) styles[alias] = FORMATTING_STYLES[rule.style] || "cf-bold";
    }
    return styles;
  });
}

/**
 * Applies the computed classes to rendered tables. Rows are matched by position among those with one
 * cell per column, which skips the group headers and total rows a grouped layout injects — a row
 * that does not line up is left alone rather than mis-styled.
 */
function applyConditionalFormatting(host, result, rules){
  const styles = evaluateFormatting(result, rules);
  if (!styles) return;

  const columns = result.columns.map(c => c.alias);
  for (const table of host.querySelectorAll("table.res, table.rp-table")) {
    const dataRows = [...table.querySelectorAll("tbody tr")]
      .filter(tr => !tr.className && tr.children.length >= columns.length);

    dataRows.forEach((tr, index) => {
      const rowStyles = styles[index];
      if (!rowStyles) return;
      columns.forEach((alias, cellIndex) => {
        if (rowStyles[alias] && tr.children[cellIndex]) tr.children[cellIndex].className += " " + rowStyles[alias];
      });
    });
  }
}

/* ---------------- layout rendering ----------------
   Reports render in the layout they were designed in, rather than always as a plain grid.

   The renderer below is lifted from the designer's own preview (buildPreviewBody, renderChart, ic)
   so what a user sees at run time matches what they saw while designing. That duplication is
   deliberate for now and tracked: the two copies must not drift, and the right fix is one shared
   web resource both pages load. Copying first keeps the designer untouched while the runtime side
   is proven; converging them is the follow-up.

   The designer feeds it synthetic rows keyed by column; here the same shape is built from real
   results, with column types inferred from the data because a stored qdb_datatype is usually unset
   and the renderer needs to know what is a number, a date and a category to lay anything out. */

const CARD_ICONS = ["chart","money","users","doc","clock","alert","star","bank","target","pie"];
const CHART_TYPES = ["Column","Bar","Line","Area","Pie","Donut"];
const CHART_PALETTE = ["#0078d4","#7c3aed","#0f9d58","#d97706","#e11d48","#0891b2","#db2777","#65a30d","#4f46e5","#c026d3"];
function chartValueLabel(v, asMoney) { return asMoney ? money(v) : (+v).toLocaleString(); }
const money = (n) => "QAR " + (+n || 0).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
const tr = (s) => s;   // translation belongs to the Style & Language tab; identity until then.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

/** Classifies a column from its values, using the vocabulary the renderer expects. */
function inferColumnType(alias, rows){
  const samples = rows.map(r => (r.cells[alias] || {}).value).filter(v => v !== null && v !== undefined && v !== "");
  if (!samples.length) return "Text";
  if (samples.every(v => typeof v === "boolean")) return "Text";
  if (samples.every(v => typeof v === "number")) {
    return samples.every(v => Number.isInteger(v)) ? "Whole number" : "Decimal";
  }
  if (samples.every(v => ISO_DATE.test(String(v)))) return "Date/Time";
  // A small set of repeated values behaves like a choice, which is what grouping keys off.
  const distinct = new Set(samples.map(String));
  return (distinct.size > 1 && distinct.size <= Math.max(2, samples.length / 2)) ? "Option set" : "Text";
}

/** Projects an executed result onto the {cols, rows} shape the ported renderer consumes. */
function toRenderModel(result){
  const cols = result.columns
    .filter(column => column.isVisible !== false)
    .map(column => ({
      key: column.alias,
      name: column.label || column.alias,
      label: column.label || column.alias,
      type: inferColumnType(column.alias, result.rows)
    }));

  const rows = result.rows.map(row => {
    const flat = {};
    for (const column of cols) {
      const cell = row.cells[column.key] || {};
      // Numbers and dates keep their raw value so totals and sorting work; everything else uses the
      // display text, which is what transformations rewrote.
      const numeric = column.type === "Currency" || column.type === "Decimal" || column.type === "Whole number";
      flat[column.key] = numeric ? (cell.value ?? cell.text) : (cell.text ?? cell.value);
    }
    return flat;
  });

  return { cols, rows };
}

/** Renders the result in its designed layout, falling back to the grid for anything unsupported. */
function renderLayout(result, layout){
  const type = (layout && layout.type) || "Tabular Report";
  if (!result.rows.length) return "";

  const model = toRenderModel(result);
  try {
    const body = buildPreviewBody(type, model.cols, model.rows, {
      groupBy: layout && layout.groupBy,
      grandTotal: !(layout && layout.grandTotal === false),
      chartType: (layout && layout.chartType) || "Column",
      cardIcon: (layout && layout.cardIcon) || "chart"
    });
    return body || "";
  } catch (error) {
    // A layout that cannot render must not cost the user their data — fall through to the grid.
    return "";
  }
}

function buildPreviewBody(type, cols, rows, opts) {
  opts = opts || {};
  const lang = opts.lang || "en", T = s => tr(s, lang);
  const ac = "var(--ac)", acd = "var(--acd)", acb = "var(--acb)", acl = "var(--acl)";
  const isRight = c => c.right || ["Currency","Decimal","Whole number"].includes(c.type);
  const num = c => ["Currency","Decimal","Whole number"].includes(c.type);
  const catCols = cols.filter(c => ["Text","Option set","Lookup"].includes(c.type));
  const catCol = catCols[0] || cols[0];
  const cat2 = cols.find(c => c.type === "Option set" && c !== catCol) || catCols[1] || null;
  const valCol = cols.find(c => ["Currency","Decimal","Whole number"].includes(c.type));
  const dateCol = cols.find(c => c.type === "Date/Time");
  const fmt = (c,v) => c.type==="Currency"?money(+v||0):(c.type==="Date/Time"?String(v).split("-").reverse().join("/"):(c.type==="Decimal"?(+v).toLocaleString(undefined,{maximumFractionDigits:2}):v));
  const disp = (c,v) => (num(c)||c.type==="Date/Time") ? fmt(c,v) : T(fmt(c,v));
  const sum = list => valCol ? list.reduce((s,r)=>s+(+r[valCol.key]||0),0) : 0;
  const fmtTotal = n => (valCol && valCol.type==="Currency") ? money(n) : (+n).toLocaleString(undefined,{maximumFractionDigits:2});
  const groups = catCol ? [...new Set(rows.map(r=>r[catCol.key]))] : [];
  /* Type chosen on the design canvas reaches the reader here. The canvas design travels inside the
     layout JSON and readLayout already parses it — this is the first thing to read it, so a font set
     in the designer is no longer something only the designer can see. */
  const columnFont = designFontLookup(layout);
  const fontOf = c => { const css = fontCss(columnFont[c.key] || columnFont[String(c.name).toLowerCase()]); return css ? `;${css}` : ""; };
  const head = cols.map(c=>`<th class="${isRight(c)?"num":""}" style="text-align:${isRight(c)?"end":"start"}${fontOf(c)}">${esc(T(c.name))}</th>`).join("");
  const trow = r => `<tr>${cols.map(c=>`<td class="${isRight(c)?"num":""}" style="text-align:${isRight(c)?"end":"start"}${fontOf(c)}">${esc(disp(c,r[c.key]))}</td>`).join("")}</tr>`;
  const tile = (t,v) => `<div style="flex:1;min-width:130px;border:1px solid #e1dfdd;border-radius:6px;padding:12px 14px"><div style="font-size:11px;color:#605e5c;text-transform:uppercase;letter-spacing:.5px">${esc(T(t))}</div><div style="font-size:22px;font-weight:700;color:${ac};margin-top:4px">${v}</div></div>`;
  const barChart = items => { const max = Math.max(...items.map(x=>x.v),1); return `<div style="display:flex;flex-direction:column;gap:8px">${items.map(x=>`<div style="display:flex;align-items:center;gap:10px"><div style="width:90px;font-size:11.5px">${esc(T(x.label))}</div><div style="flex:1;background:${acb};border-radius:3px"><div style="width:${Math.round(x.v/max*100)}%;background:${ac};height:16px;border-radius:3px"></div></div><div style="width:120px;text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums">${valCol?money(x.v):x.v}</div></div>`).join("")}</div>`; };
  const grandRow = () => valCol ? `<tr class="grand-total">${cols.map((c,ci)=>`<td class="${isRight(c)?"num":""}">${ci===0?T("Grand total"):(c===valCol?fmtTotal(sum(rows)):"")}</td>`).join("")}</tr>` : "";
  const pickGroupCol = () => {
    let best = null, bestScore = Infinity;
    cols.filter(c=>["Text","Option set","Lookup"].includes(c.type)).forEach(c => {
      const dcount = new Set(rows.map(r=>r[c.key])).size;
      const boost = (c.type==="Option set"||c.type==="Lookup") ? 0.5 : 1;
      if (dcount>1 && dcount<rows.length && dcount*boost<bestScore) { bestScore = dcount*boost; best = c; }
    });
    return best;
  };
  const chartCat = pickGroupCol() || catCol;
  const chartData = () => { const gs = [...new Set(rows.map(r=>r[chartCat.key]))];
    return gs.map((g,i)=>({ label:g, v: valCol ? sum(rows.filter(r=>r[chartCat.key]===g)) : rows.filter(r=>r[chartCat.key]===g).length, color: CHART_PALETTE[i%CHART_PALETTE.length] })); };
  const drillBlock = (g) => {
    if (g == null || g === "") return "";
    const gr = rows.filter(r=>String(r[chartCat.key])===String(g));
    if (!gr.length) return "";
    return `<div class="drill-panel"><div class="drill-head"><div class="dt">${esc(T(chartCat.name))}: ${esc(T(g))} — ${gr.length} ${T("rows")}${valCol?` · ${fmtTotal(sum(gr))}`:""}</div><button class="drill-clear" data-drillclear="1">${T("Show all")} ✕</button></div><table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${gr.map(trow).join("")}</tbody></table></div>`;
  };

  if (type === "Grouped Report") {
    const gb = (opts.groupBy && cols.find(c=>c.name===opts.groupBy)) || catCol;
    const gs = [...new Set(rows.map(r=>r[gb.key]))]; let b = "";
    gs.forEach(g => { const gr = rows.filter(r=>r[gb.key]===g);
      b += `<tr class="group-head"><td colspan="${cols.length}">${esc(T(g))} — ${gr.length} ${T("rows")}</td></tr>` + gr.map(trow).join("");
      if (valCol) b += `<tr class="group-total">${cols.map((c,ci)=>`<td class="${isRight(c)?"num":""}">${ci===0?T("Subtotal"):(c===valCol?fmtTotal(sum(gr)):"")}</td>`).join("")}</tr>`; });
    return `<table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${b}${grandRow()}</tbody></table>`;
  }
  if (type === "Master-Detail Report") {
    const hdrCols = cols.filter(c=>c!==valCol).slice(0,5);
    const totals = (gr) => { if (!valCol) return ""; const sub=sum(gr), tax=Math.round(sub*0.1); return `<div style="display:flex;justify-content:flex-end;margin-top:8px"><table style="font-size:12.5px"><tr><td style="padding:2px 14px;color:#605e5c">${T("Subtotal")}</td><td style="text-align:right">${money(sub)}</td></tr><tr><td style="padding:2px 14px;color:#605e5c">Tax (10%)</td><td style="text-align:right">${money(tax)}</td></tr><tr style="font-weight:700"><td style="padding:5px 14px;border-top:2px solid ${ac}">${T("Total")}</td><td style="text-align:right;border-top:2px solid ${ac}">${money(sub+tax)}</td></tr></table></div>`; };
    return groups.slice(0,2).map(g => { const gr = rows.filter(r=>r[catCol.key]===g); const h = gr[0]||{};
      const headerBlk = `<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 16px;font-size:12.5px;margin-bottom:10px;max-width:420px">${hdrCols.map(c=>`<div style="color:#605e5c">${esc(T(c.name))}</div><div style="font-weight:600">${esc(disp(c,h[c.key]))}</div>`).join("")}</div>`;
      return `<div style="border:1px solid #e1dfdd;border-radius:8px;margin-bottom:16px;padding:14px 16px"><div style="font-weight:700;color:${acd};border-bottom:2px solid ${ac};padding-bottom:6px;margin-bottom:10px">${esc(T(catCol.name))}: ${esc(T(g))} <span style="font-weight:400;color:#605e5c;font-size:12px">(master record)</span></div>${headerBlk}<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#605e5c;font-weight:700;margin-bottom:4px">Line items (detail)</div><table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${gr.map(trow).join("")}</tbody></table>${totals(gr)}</div>`; }).join("");
  }
  if (type === "Matrix (Cross Tab)" || type === "Pivot Report") {
    const colCats = cat2 ? [...new Set(rows.map(r=>r[cat2.key]))] : ["Personal","Corporate","SME"];
    const cell = (rg,ci) => { const gr = rows.filter(r=>r[catCol.key]===rg); const set = cat2 ? gr.filter(r=>r[cat2.key]===colCats[ci]) : gr.filter((r,j)=>j%colCats.length===ci); return valCol?sum(set):set.length; };
    return `<table class="rp-table"><thead><tr><th>${esc(T(catCol.name))} \\ ${cat2?esc(T(cat2.name)):"Product"}</th>${colCats.map(c=>`<th class="num">${esc(T(c))}</th>`).join("")}<th class="num">${T("Total")}</th></tr></thead><tbody>${groups.map(rg=>`<tr><td><b>${esc(T(rg))}</b></td>${colCats.map((c,ci)=>`<td class="num">${valCol?money(cell(rg,ci)):cell(rg,ci)}</td>`).join("")}<td class="num"><b>${valCol?money(sum(rows.filter(r=>r[catCol.key]===rg))):rows.filter(r=>r[catCol.key]===rg).length}</b></td></tr>`).join("")}</tbody></table>${type==="Pivot Report"?`<div style="font-size:11px;color:#605e5c;margin-top:8px">↕ Drag fields to pivot rows/columns · interactive at run time</div>`:""}`;
  }
  if (type === "Summary Report") {
    return `<table class="rp-table"><thead><tr><th>${esc(T(catCol.name))}</th><th class="num">${T("Count")}</th>${valCol?`<th class="num">${esc(T(valCol.name))}</th>`:""}</tr></thead><tbody>${groups.map(g=>{const gr=rows.filter(r=>r[catCol.key]===g);return `<tr><td>${esc(T(g))}</td><td class="num">${gr.length}</td>${valCol?`<td class="num">${money(sum(gr))}</td>`:""}</tr>`;}).join("")}<tr class="grand-total"><td>${T("Grand total")}</td><td class="num">${rows.length}</td>${valCol?`<td class="num">${money(sum(rows))}</td>`:""}</tr></tbody></table>`;
  }
  if (type === "Dashboard Report") {
    const grand = sum(rows);
    const tiles = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">${tile("Records",rows.length)}${valCol?tile("Total",money(grand)):""}${valCol?tile("Average",money(grand/rows.length)):""}${tile(catCol.name,groups.length)}</div>`;
    const bars = `<div style="display:flex;gap:20px;flex-wrap:wrap"><div style="flex:1;min-width:260px"><div style="font-size:12px;font-weight:600;margin-bottom:8px">${valCol?T("Total"):T("Count")} — ${esc(T(catCol.name))}</div>${barChart(groups.map(g=>({label:g,v:valCol?sum(rows.filter(r=>r[catCol.key]===g)):rows.filter(r=>r[catCol.key]===g).length})))}</div><div style="flex:1;min-width:220px"><div style="font-size:12px;font-weight:600;margin-bottom:8px">${T("Records")}</div><table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${rows.slice(0,4).map(trow).join("")}</tbody></table></div></div>`;
    return tiles + bars;
  }
  if (type === "Chart Report") {
    const ct = CHART_TYPES.includes(opts.chartType) ? opts.chartType : "Column";
    const data = chartData();
    const clickWord = (ct==="Pie"||ct==="Donut") ? "slice" : (ct==="Line"||ct==="Area") ? "point" : "bar";
    const title = `<div style="font-size:12.5px;font-weight:600;margin-bottom:12px">${valCol?T("Total")+" "+esc(T(valCol.name)):T("Count")} ${T("by")} ${esc(T(chartCat.name))} <span style="color:#605e5c;font-weight:400">· ${esc(ct)} chart</span></div>`;
    const chart = `<div class="chart-wrap">${renderChart(ct, data, !!valCol)}</div><div class="chart-hint">${ic("info")} Chart is built from the underlying table — click a ${clickWord} to drill into its records.</div>`;
    return title + chart + drillBlock(opts.drill);
  }
  if (type === "Info Cards") {
    const iconName = CARD_ICONS.includes(opts.cardIcon) ? opts.cardIcon : "chart";
    const data = chartData();
    const cards = `<div class="info-cards">${data.map(d=>`<button class="info-card" data-slice="${esc(String(d.label))}"><span class="ic-badge" style="background:${d.color}">${ic(iconName)}</span><span class="ic-body"><span class="ic-label">${esc(T(d.label))}</span><span class="ic-total">${valCol?fmtTotal(d.v):d.v}</span></span></button>`).join("")}</div><div class="chart-hint">${ic("info")} Each info card = icon + label + total, built from the table. Click a card to drill into its records.</div>`;
    return cards + drillBlock(opts.drill);
  }
  if (type === "Card Layout") {
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px">${rows.slice(0,6).map(r=>`<div style="border:1px solid #e1dfdd;border-radius:8px;padding:14px"><div style="font-weight:700;color:${acd};margin-bottom:8px">${esc(T(r[catCol.key]))}</div>${cols.filter(c=>c!==catCol).slice(0,4).map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#605e5c">${esc(T(c.name))}</span><span style="font-weight:600">${esc(disp(c,r[c.key]))}</span></div>`).join("")}</div>`).join("")}</div>`;
  }
  if (type === "Form Layout") {
    const r = rows[0];
    return `<div style="max-width:580px;border:1px solid #e1dfdd;border-radius:8px;padding:20px"><div style="font-weight:700;font-size:15px;color:${acd};border-bottom:1px solid #edebe9;padding-bottom:10px;margin-bottom:14px">${esc(T(r[catCol.key]))}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${cols.map(c=>`<div><div style="font-size:11px;color:#605e5c;margin-bottom:2px">${esc(T(c.name))}</div><div style="font-size:13px;font-weight:600;border-bottom:1px solid #edebe9;padding-bottom:4px">${esc(disp(c,r[c.key]))}</div></div>`).join("")}</div></div>`;
  }
  if (type === "Label Layout") {
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${rows.slice(0,6).map(r=>`<div style="border:1px dashed #a19f9d;border-radius:4px;padding:12px;min-height:82px"><div style="font-weight:700">${esc(T(r[catCol.key]))}</div><div style="font-size:12px;color:#323130;margin-top:4px">P.O. Box ${1000+String(r[catCol.key]).length*7}<br>Doha, Qatar<br>+974 4000 ${1000+(String(r[catCol.key]).length*137)%9000}</div></div>`).join("")}</div>`;
  }
  if (type === "Invoice Layout") {
    const items = rows.slice(0,4); const line = r => valCol?(+r[valCol.key]||0):1200; const subtotal = items.reduce((s,r)=>s+line(r),0); const tax = Math.round(subtotal*0.1);
    const hdr = [["Invoice No","INV-10025"],["Customer",T(rows[0][catCol.key])],["Date","15-Jul-2026"],["Status","Paid"],["Sales Rep","John Smith"]];
    return `<div style="display:flex;justify-content:space-between;margin-bottom:14px"><div style="font-size:20px;font-weight:800;color:${ac}">INVOICE</div><div style="text-align:right;font-size:12px;color:#605e5c">Doha, Qatar</div></div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 16px;font-size:13px;margin-bottom:16px;max-width:340px">${hdr.map(x=>`<div style="color:#605e5c">${esc(x[0])}</div><div style="font-weight:600">${esc(x[1])}</div>`).join("")}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#605e5c;font-weight:700;margin-bottom:4px">Invoice line items</div>
      <table class="rp-table"><thead><tr><th class="num">Item</th><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${items.map((r,i)=>{const amt=line(r);const qty=[2,1,3,2][i%4];const price=Math.round(amt/qty);return `<tr><td class="num">${i+1}</td><td>${esc(T(r[catCol.key]))}</td><td class="num">${qty}</td><td class="num">${money(price)}</td><td class="num">${money(amt)}</td></tr>`;}).join("")}</tbody></table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><table style="font-size:13px"><tr><td style="padding:2px 16px;color:#605e5c">Subtotal</td><td style="text-align:right">${money(subtotal)}</td></tr><tr><td style="padding:2px 16px;color:#605e5c">Tax (10%)</td><td style="text-align:right">${money(tax)}</td></tr><tr style="font-weight:700"><td style="padding:6px 16px;border-top:2px solid ${ac}">${T("Total")}</td><td style="text-align:right;border-top:2px solid ${ac}">${money(subtotal+tax)}</td></tr></table></div>`;
  }
  if (type === "Statement Layout") {
    let bal = 250000; const txns = rows.slice(0,6);
    return `<div style="margin-bottom:14px"><div style="font-size:16px;font-weight:700">Account Statement</div><div style="font-size:12px;color:#605e5c">${esc(T(txns[0][catCol.key]))} · Period 01–30 Jun 2026</div></div><table class="rp-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody><tr><td colspan="4"><b>Opening balance</b></td><td class="num"><b>${money(bal)}</b></td></tr>${txns.map((r,i)=>{const amt=valCol?(+r[valCol.key]||0)/10:5000;const debit=i%2===0;bal+=debit?-amt:amt;return `<tr><td>${dateCol?fmt(dateCol,r[dateCol.key]):("0"+((i%28)+1)).slice(-2)+"/06/2026"}</td><td>${esc(T(r[catCol.key]))}</td><td class="num">${debit?money(amt):""}</td><td class="num">${debit?"":money(amt)}</td><td class="num">${money(bal)}</td></tr>`;}).join("")}<tr class="grand-total"><td colspan="4"><b>Closing balance</b></td><td class="num"><b>${money(bal)}</b></td></tr></tbody></table>`;
  }
  if (type === "Certificate Layout") {
    const r = rows[0];
    return `<div style="border:6px double ${ac};border-radius:8px;padding:32px;text-align:center;background:#fbfbfd"><div style="font-size:12px;letter-spacing:3px;color:#605e5c;text-transform:uppercase">Certificate of Approval</div><div style="font-size:26px;font-weight:800;color:${acd};margin:16px 0">${esc(T(r[catCol.key]))}</div><div style="font-size:13px;color:#323130;max-width:460px;margin:0 auto">This is to certify that the above ${esc(catCol.name.toLowerCase())} has been reviewed and approved${valCol?` for an amount of <b>${money(+r[valCol.key]||0)}</b>`:""}.</div><div style="display:flex;justify-content:space-around;margin-top:34px;font-size:12px;color:#605e5c"><div>______________<br>Authorised Signatory</div><div>______________<br>Date</div></div></div>`;
  }
  if (type === "Letter Layout") {
    const r = rows[0];
    return `<div style="max-width:600px;font-size:13px;line-height:1.7"><div style="text-align:right;color:#605e5c">15 July 2026</div><div style="margin-top:14px"><b>${esc(T(r[catCol.key]))}</b><br>Doha, Qatar</div><div style="margin-top:16px">Dear ${esc(T(r[catCol.key]))},</div><p style="margin-top:10px">We are pleased to inform you that your application has been <b>approved</b>${valCol?` for a facility amount of <b>${money(+r[valCol.key]||0)}</b>`:""}. Please review the enclosed terms and return the signed copy at your earliest convenience.</p><p style="margin-top:10px">Thank you for choosing our services.</p><div style="margin-top:22px">Yours sincerely,<br><b>Lending Department</b></div></div>`;
  }
  if (type === "Multi-Column Layout") {
    return `<div style="column-count:3;column-gap:24px;font-size:12.5px">${rows.map(r=>`<div style="break-inside:avoid;padding:6px 0;border-bottom:1px solid #edebe9"><b>${esc(T(r[catCol.key]))}</b>${valCol?`<div style="color:#605e5c">${money(+r[valCol.key]||0)}</div>`:""}</div>`).join("")}</div>`;
  }
  if (type === "Timeline Layout") {
    return `<div style="padding-left:6px">${rows.slice(0,6).map((r,i)=>`<div style="position:relative;padding:0 0 16px 18px;border-left:2px solid ${acl}"><div style="position:absolute;left:-7px;top:2px;width:12px;height:12px;border-radius:50%;background:${ac};border:2px solid #fff"></div><div style="font-size:11px;color:#605e5c">${dateCol?fmt(dateCol,r[dateCol.key]):("0"+((i%28)+1)).slice(-2)+"/06/2026"}</div><div style="font-weight:600;font-size:13px">${esc(T(r[catCol.key]))}</div></div>`).join("")}</div>`;
  }
  if (type === "Calendar Layout") {
    const ev = {2:1,7:2,11:1,18:1,22:1,25:1}; let cells = "";
    for (let day=1;day<=30;day++) cells += `<div style="border:1px solid #edebe9;min-height:44px;padding:4px;font-size:11px"><div style="color:#605e5c">${day}</div>${ev[day]?`<div style="background:${acb};color:${acd};border-radius:3px;padding:1px 4px;margin-top:2px;font-size:10px">${ev[day]} report${ev[day]>1?"s":""}</div>`:""}</div>`;
    return `<div style="font-weight:700;margin-bottom:8px">June 2026</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${["S","M","T","W","T","F","S"].map(x=>`<div style="text-align:center;font-size:11px;color:#605e5c;font-weight:600;padding:4px">${x}</div>`).join("")}${cells}</div>`;
  }
  if (type === "Gantt Layout") {
    return `<div style="display:flex;flex-direction:column;gap:8px">${rows.slice(0,6).map((r,i)=>{const start=(i*12)%55;const width=15+((i*7)%30);return `<div style="display:flex;align-items:center;gap:10px"><div style="width:130px;font-size:12px">${esc(T(r[catCol.key]))}</div><div style="flex:1;position:relative;height:18px;background:#f3f2f1;border-radius:3px"><div style="position:absolute;left:${start}%;width:${width}%;height:18px;background:${ac};border-radius:3px"></div></div></div>`;}).join("")}<div style="display:flex;gap:10px;margin-top:2px"><div style="width:130px"></div><div style="flex:1;display:flex;justify-content:space-between;font-size:10px;color:#605e5c"><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span></div></div></div>`;
  }
  if (type === "Tree Layout") {
    const child = cols.find(c=>c!==catCol) || catCol;
    return `<div style="font-size:13px;line-height:1.9"><div>▾ <b>${esc(T(catCol.name))}</b></div>${groups.map(g=>{const gr=rows.filter(r=>r[catCol.key]===g);return `<div style="margin-left:18px">▾ ${esc(T(g))} <span style="color:#605e5c">(${gr.length})</span>${gr.slice(0,3).map(r=>`<div style="margin-left:26px;color:#323130">◦ ${esc(disp(child,r[child.key]))}</div>`).join("")}</div>`;}).join("")}</div>`;
  }
  if (type === "Org Chart") {
    return `<div style="text-align:center"><div style="display:inline-block;border:1px solid ${ac};border-radius:6px;padding:8px 18px;background:${acb};font-weight:700;color:${acd}">Head Office</div><div style="height:16px;border-left:1px solid #a19f9d;width:1px;margin:0 auto"></div><div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap">${groups.slice(0,3).map(g=>`<div style="border:1px solid #e1dfdd;border-radius:6px;padding:8px 14px;font-size:12px"><b>${esc(T(g))}</b><div style="color:#605e5c">${rows.filter(r=>r[catCol.key]===g).length} staff</div></div>`).join("")}</div></div>`;
  }
  if (type === "Kanban Layout") {
    const statuses = cat2 ? [...new Set(rows.map(r=>r[cat2.key]))] : ["Active","Pending","Approved"];
    return `<div style="display:flex;gap:12px;overflow-x:auto">${statuses.map((s,si)=>{const items=cat2?rows.filter(r=>r[cat2.key]===s):rows.filter((r,i)=>i%3===si);return `<div style="flex:1;min-width:150px;background:#f3f2f1;border-radius:6px;padding:8px"><div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#323130">${esc(T(s))} <span style="color:#605e5c">(${items.length})</span></div>${items.slice(0,3).map(r=>`<div style="background:#fff;border:1px solid #e1dfdd;border-radius:4px;padding:8px;margin-bottom:6px;font-size:12px;border-top:2px solid ${ac}"><b>${esc(T(r[catCol.key]))}</b>${valCol?`<div style="color:#605e5c">${money(+r[valCol.key]||0)}</div>`:""}</div>`).join("")}</div>`;}).join("")}</div>`;
  }
  if (type === "Drill-down Report") {
    return `<table class="rp-table"><thead><tr><th style="width:20px"></th>${head}</tr></thead><tbody>${groups.map((g,gi)=>{const gr=rows.filter(r=>r[catCol.key]===g);const open=gi===0;return `<tr class="group-head"><td>${open?"▾":"▸"}</td><td colspan="${cols.length}">${esc(T(g))} — ${gr.length} ${T("rows")}${valCol?` · ${money(sum(gr))}`:""}</td></tr>${open?gr.map(r=>`<tr><td></td>${cols.map(c=>`<td class="${isRight(c)?"num":""}">${esc(disp(c,r[c.key]))}</td>`).join("")}</tr>`).join(""):""}`;}).join("")}</tbody></table><div style="font-size:11px;color:#605e5c;margin-top:6px">▸ Click a group to expand · interactive at run time</div>`;
  }
  if (type === "Comparison Report") {
    const a = groups[0], b = groups[1]||groups[0]; const ga = rows.filter(r=>r[catCol.key]===a), gb = rows.filter(r=>r[catCol.key]===b);
    const m = (la,lb,label) => `<tr><td style="color:#605e5c">${T(label)}</td><td class="num"><b>${la}</b></td><td class="num"><b>${lb}</b></td></tr>`;
    return `<table class="rp-table"><thead><tr><th>Metric</th><th class="num">${esc(T(a))}</th><th class="num">${esc(T(b))}</th></tr></thead><tbody>${m(ga.length,gb.length,"Records")}${valCol?m(money(sum(ga)),money(sum(gb)),"Total"):""}${valCol?m(money(sum(ga)/(ga.length||1)),money(sum(gb)/(gb.length||1)),"Average"):""}</tbody></table>`;
  }
  if (type === "Nested Report") {
    return groups.slice(0,2).map(g=>{const gr=rows.filter(r=>r[catCol.key]===g);return `<div style="border-left:2px solid ${ac};padding-left:12px;margin-bottom:12px"><b style="color:${acd}">${esc(T(g))}</b>${["Account A","Account B"].map((acc,ai)=>`<div style="margin-left:14px;margin-top:6px;border-left:2px solid ${acl};padding-left:12px"><b>${acc}</b>${gr.slice(ai,ai+2).map(r=>`<div style="margin-left:12px;font-size:12px;color:#323130">${esc(cols[0]?disp(cols[0],r[cols[0].key]):g)}${valCol?` — ${money(+r[valCol.key]||0)}`:""}</div>`).join("")}</div>`).join("")}</div>`;}).join("");
  }
  if (type === "Book Layout") {
    return `<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap"><div style="width:200px;height:264px;border-radius:4px;background:linear-gradient(135deg,${ac},${acd});color:#fff;padding:24px;display:flex;flex-direction:column;justify-content:space-between"><div style="font-size:11px;letter-spacing:2px;opacity:.85">ANNUAL REPORT</div><div><div style="font-size:22px;font-weight:800;line-height:1.2">${esc(T(rows[0][catCol.key]))}</div><div style="font-size:12px;opacity:.85;margin-top:6px">2026 Edition</div></div><div style="font-size:11px;opacity:.7">Report Engine</div></div><div style="flex:1;min-width:220px"><div style="font-size:12px;color:#605e5c;margin-bottom:8px">Contents</div><ol style="font-size:13px;line-height:2;padding-left:18px;margin:0">${["Executive Summary","Portfolio Overview","Branch Performance","Risk & Compliance","Appendix"].map((t,i)=>`<li>${t} <span style="color:#605e5c;float:right">p.${(i+1)*4}</span></li>`).join("")}</ol><div style="font-size:11px;color:#605e5c;margin-top:10px">${rows.length}+ pages · multi-section document</div></div></div>`;
  }
  // Tabular Report (default)
  return `<table class="rp-table"><thead><tr>${head}</tr></thead><tbody>${rows.map(trow).join("")}${grandRow()}</tbody></table>`;
}

function renderChart(chartType, data, asMoney) {
  const esc2 = s => esc(String(s));
  const max = Math.max(...data.map(d=>d.v), 1);
  const total = data.reduce((s,d)=>s+d.v, 0) || 1;
  if (chartType === "Bar") {
    return `<div class="chart-bars">${data.map(d=>`<button class="chart-bar-row" data-slice="${esc2(d.label)}"><span class="bl">${esc2(d.label)}</span><span class="bt"><span class="bf" style="width:${Math.round(d.v/max*100)}%;background:${d.color}"></span></span><span class="bv">${chartValueLabel(d.v,asMoney)}</span></button>`).join("")}</div>`;
  }
  if (chartType === "Column") {
    return `<div class="chart-cols">${data.map(d=>`<button class="chart-col" data-slice="${esc2(d.label)}"><span class="col-val">${chartValueLabel(d.v,asMoney)}</span><span class="col-bar" style="height:${Math.max(3,Math.round(d.v/max*160))}px;background:${d.color}"></span><span class="col-lbl">${esc2(d.label)}</span></button>`).join("")}</div>`;
  }
  if (chartType === "Line" || chartType === "Area") {
    const W=440, H=180, pad=26, n=data.length, ac="#0078d4";
    const x = i => pad + (n<=1 ? (W-2*pad)/2 : i*(W-2*pad)/(n-1));
    const y = v => H-pad - (v/max)*(H-2*pad);
    const pts = data.map((d,i)=>[x(i),y(d.v)]);
    const path = pts.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const areaPath = `${path} L${x(n-1).toFixed(1)},${H-pad} L${x(0).toFixed(1)},${H-pad} Z`;
    return `<div class="chart-svg-wrap"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:540px">
      <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="#e1dfdd"/>
      ${chartType==="Area"?`<path d="${areaPath}" fill="${ac}" opacity=".14"/>`:""}
      <path d="${path}" fill="none" stroke="${ac}" stroke-width="2.5"/>
      ${pts.map((p,i)=>`<g class="pt" data-slice="${esc2(data[i].label)}"><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="#fff" stroke="${ac}" stroke-width="2"/><title>${esc2(data[i].label)}: ${chartValueLabel(data[i].v,asMoney)}</title></g>`).join("")}
      ${data.map((d,i)=>`<text x="${x(i).toFixed(1)}" y="${H-pad+15}" font-size="9" fill="#605e5c" text-anchor="middle">${esc2(String(d.label).slice(0,9))}</text>`).join("")}
    </svg></div>`;
  }
  // Pie / Donut
  const cx=90, cy=90, r=82, ir = chartType==="Donut" ? 44 : 0;
  let a0 = -Math.PI/2;
  const arcs = data.map(d => {
    const frac = d.v/total, a1 = a0 + frac*2*Math.PI, large = frac>0.5?1:0;
    const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    let path;
    if (ir>0) { const ix0=cx+ir*Math.cos(a0), iy0=cy+ir*Math.sin(a0), ix1=cx+ir*Math.cos(a1), iy1=cy+ir*Math.sin(a1);
      path = `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${ix1.toFixed(1)},${iy1.toFixed(1)} A${ir},${ir} 0 ${large} 0 ${ix0.toFixed(1)},${iy0.toFixed(1)} Z`;
    } else { path = `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`; }
    a0 = a1;
    return `<path class="slice" data-slice="${esc2(d.label)}" d="${path}" fill="${d.color}" stroke="#fff" stroke-width="1.5"><title>${esc2(d.label)}: ${chartValueLabel(d.v,asMoney)} (${Math.round(frac*100)}%)</title></path>`;
  }).join("");
  const legend = `<div class="chart-legend">${data.map(d=>`<button data-slice="${esc2(d.label)}"><span class="dot" style="background:${d.color}"></span>${esc2(d.label)}<span class="lv">${chartValueLabel(d.v,asMoney)}</span></button>`).join("")}</div>`;
  return `<div class="chart-svg-wrap"><svg class="chart-svg" viewBox="0 0 180 180" width="180" height="180">${arcs}</svg>${legend}</div>`;
}

function ic(name) {
  const p = {
    add:'<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>',
    edit:'<path d="M11 2l3 3-8 8-3.5.5.5-3.5 8-8z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    copy:'<rect x="5" y="5" width="8" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3h7" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    play:'<path d="M5 3l8 5-8 5V3z" fill="currentColor"/>',
    publish:'<path d="M8 11V3M4 6l4-3 4 3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    trash:'<path d="M4 5h8M6 5V3h4v2M5 5l.7 8h4.6L11 5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    refresh:'<path d="M13 8a5 5 0 11-1.5-3.5M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    excel:'<rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.2"/>',
    save:'<path d="M3 3h8l2 2v8H3V3z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 3v4h5V3M6 13v-3h4v3" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    saveclose:'<path d="M3 3h8l2 2v8H3V3z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 8l1.5 1.5L11 6" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    back:'<path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    history:'<path d="M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 8a5 5 0 105-5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 4v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    check:'<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="var(--success)" stroke-width="1.6"/>',
    info:'<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.4"/>',
    drag:'<circle cx="6" cy="4" r="1" fill="currentColor"/><circle cx="10" cy="4" r="1" fill="currentColor"/><circle cx="6" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="8" r="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="10" cy="12" r="1" fill="currentColor"/>',
    filter:'<path d="M3 4h10l-4 5v4l-2-1V9L3 4z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    param:'<path d="M5 3h6M8 3v10M5 13h6" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    tree:'<circle cx="4" cy="4" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="8" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="13" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 4H8v9M8 8h2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    flow:'<circle cx="4" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.2"/>',
    fx:'<path d="M10 3H8a1 1 0 00-1 1v8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h4M9 10l3 3M12 10l-3 3" stroke="currentColor" stroke-width="1.2"/>',
    paint:'<path d="M3 9l5-5 4 4-5 5H3V9z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    shield:'<path d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    key:'<circle cx="6" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 8H14M12 8v2M13 8v1.5" stroke="currentColor" stroke-width="1.2"/>',
    ribbon:'<rect x="3" y="3" width="10" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 10l-1 3 3-1.5L11 13l-1-3" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    export:'<path d="M8 3v7M5 6l3-3 3 3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    pdf:'<rect x="3" y="2" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 9h1.5M9.5 9H11M5 11h6" stroke="currentColor" stroke-width="1"/>',
    csv:'<rect x="3" y="2" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" stroke-width="1"/>',
    word:'<rect x="3" y="2" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 6l1 4 2-4 2 4 1-4" fill="none" stroke="currentColor" stroke-width="1"/>',
    image:'<rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><path d="M3 11l3-3 3 3 2-2 2 2" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    print:'<path d="M5 6V3h6v3M4 6h8v5H4V6zM5 11h6v3H5v-3z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    chart:'<path d="M3 13V3M3 13h10M6 11V7M9 11V5M12 11V8" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    pie:'<path d="M8 8V2a6 6 0 106 6H8z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    line:'<path d="M3 13V3M3 12h10M4 10l3-3 2 2 4-5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    money:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5v7M9.8 6.2C9.4 5.5 8.8 5.2 8 5.2c-1 0-1.7.5-1.7 1.3 0 1.9 3.4 1 3.4 2.9 0 .8-.7 1.4-1.7 1.4-.9 0-1.5-.3-1.9-1" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    users:'<circle cx="6" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 4.2A2 2 0 0111 8M11.5 9.9c1.3.2 2.5 1.1 2.5 3.1" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    doc:'<path d="M4 2h5l3 3v9H4V2z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9 2v3h3M6 8h4M6 10h4M6 12h3" fill="none" stroke="currentColor" stroke-width="1.1"/>',
    clock:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    alert:'<path d="M8 2l6 11H2L8 2z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.3"/>',
    star:'<path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.6 4.6 13.5l.7-3.8L2.5 7l3.8-.5L8 2.5z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    bank:'<path d="M8 2l6 3H2l6-3zM3 6v5M6 6v5M10 6v5M13 6v5M2 13h12" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    target:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1" fill="currentColor"/>'
  }[name] || "";
  return `<svg width="15" height="15" viewBox="0 0 16 16" style="flex-shrink:0">${p}</svg>`;
}
/* ---------------- self-check ----------------
   Opened with ?selftest=1, this walks the whole in-CRM path and reports each step.
   It exists because everything else was verified by replaying the equivalent calls with a service
   principal — which cannot prove that Xrm.WebApi behaves the same from inside a web resource,
   especially Xrm.WebApi.online.execute against a Custom API. This is that proof, and it prints the
   real error when a step fails instead of leaving a blank screen to interpret. */

const SELF_TEST_STEPS = [
  {
    name: "Xrm context is available",
    detail: "Injected by the app shell when hosted, or from ClientGlobalContext.js.aspx when opened directly.",
    run: () => { xrm(); return "Xrm.WebApi found in the " + findXrm().origin; }
  },
  {
    name: "Signed-in user resolved",
    detail: "Reports run as this user; Dataverse applies their row and table security.",
    run: () => {
      const settings = xrm().Utility.getGlobalContext().userSettings;
      return `${settings.userName} (${String(settings.userId).replace(/[{}]/g, "")})`;
    }
  },
  {
    name: "Report catalog readable",
    detail: "Direct Xrm.WebApi read of qdb_reportdefinition. Needs the 'Report User' role.",
    run: async state => {
      state.reports = await fetchCatalog();
      if (!state.reports.length) throw new Error("No reports visible to this user.");
      return `${state.reports.length} report(s)`;
    }
  },
  {
    name: "Report definition loads",
    detail: "Definition plus its parameters and relationships.",
    run: async state => {
      state.def = await fetchDefinition(state.reports[0].id);
      return `${state.def.name} — ${state.def.parameters.length} parameter(s), ${state.def.relationships.length} relationship(s)`;
    }
  },
  {
    name: "qdb_RunReport executes",
    detail: "The audited Custom API. This is the call the service-principal checks could not prove.",
    run: async state => {
      state.result = await runReportInCrm(state.def.id, {});
      return `${state.result.rowCount} row(s), ${state.result.columns.length} column(s)`;
    }
  },
  {
    name: "Rows are shaped correctly",
    detail: "Every column resolves to a cell, so the grid can render.",
    run: state => {
      if (!state.result.rowCount) return "0 rows — nothing to shape (not a failure)";
      const first = state.result.rows[0].cells;
      const missing = state.result.columns.filter(c => !(c.alias in first)).map(c => c.alias);
      if (missing.length) throw new Error("Columns with no cell: " + missing.join(", "));
      return state.result.columns.map(c => `${c.alias}=${(first[c.alias] || {}).text ?? "—"}`).join(" | ");
    }
  }
];

async function runSelfTest(){
  $("#content").innerHTML = `<div class="cmdbar"><b>Report Engine — in-CRM self-check</b></div>
    <div class="page"><div id="stRows"></div><div id="stVerdict" style="margin-top:14px"></div></div>`;

  const carried = {};
  let failed = false;

  for (const step of SELF_TEST_STEPS) {
    const row = document.createElement("div");
    row.className = "panel";
    row.style.marginBottom = "8px";
    row.innerHTML = `<b>${esc(step.name)}</b> <span class="spinner"></span>`;
    $("#stRows").appendChild(row);

    if (failed) {
      row.innerHTML = `<b style="color:var(--text-secondary)">${esc(step.name)}</b>
        <div style="color:var(--text-secondary);font-size:12px">skipped — an earlier step failed</div>`;
      continue;
    }

    try {
      const outcome = await step.run(carried);
      row.innerHTML = `<b style="color:var(--success)">✓ ${esc(step.name)}</b>
        <div style="font-size:12px;margin-top:2px">${esc(outcome)}</div>
        <div style="color:var(--text-secondary);font-size:11px;margin-top:2px">${esc(step.detail)}</div>`;
    } catch (error) {
      failed = true;
      row.innerHTML = `<b style="color:var(--error)">✗ ${esc(step.name)}</b>
        <div style="color:var(--error);font-size:12px;margin-top:2px">${esc(error.message)}</div>
        <div style="color:var(--text-secondary);font-size:11px;margin-top:2px">${esc(step.detail)}</div>`;
    }
  }

  $("#stVerdict").innerHTML = failed
    ? `<div class="empty"><div style="color:var(--error)"><b>Self-check failed.</b></div>
        <div style="color:var(--text-secondary);margin-top:4px">Send the red line above — it is the actual platform error.</div></div>`
    : `<div class="empty"><div style="color:var(--success)"><b>All checks passed.</b></div>
        <div style="color:var(--text-secondary);margin-top:4px">The engine runs end to end inside CRM: catalog, definition, execution and shaping.</div>
        <div style="margin-top:10px"><button class="btn primary" onclick="location.search=''">Open the catalog</button></div></div>`;
}

/* ---------------- boot ---------------- */
// There is no standalone mode: with the middle tier retired every call is an Xrm call, so outside
// CRM there is nothing to talk to. Say that plainly rather than failing per-click.
function initXrm(){
  try {
    const context = xrm().Utility.getGlobalContext();
    state.callerName = context.userSettings.userName || "user";
    return true;
  } catch(e){ return false; }
}
function applyTheme(t){ state.theme=t; document.documentElement.setAttribute("data-theme",t); localStorage.setItem("re-theme",t); }

/* Hosted via main.aspx the query string arrives inside `data`, not as real query-string entries:
   Xrm.Navigation.navigateTo hands a web resource its parameters as one urlencoded value. Reading
   only location.search finds nothing — which is exactly how a ribbon command that passed a report
   id correctly still ended up showing the catalogue. Accept either spelling. */
const launchParams = new URLSearchParams(location.search);
function launchParam(name) {
  const direct = launchParams.get(name);
  if (direct) return direct;
  return new URLSearchParams(launchParams.get("data") || "").get(name);
}

function notInCrmNotice(webResourceName){
  return `<div class="page"><div class="empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>
      <div><b>Open this from inside the app, not by its file URL.</b></div>
      <div style="color:var(--text-secondary); max-width:520px; margin-top:6px">
        Reports are read and run through your CRM session, so this page needs the app shell that
        supplies it. Opened straight from <code>/WebResources/…</code> there is no session to use.
      </div>
      <div style="margin-top:12px; text-align:left; display:inline-block">
        <div style="color:var(--text-secondary); font-size:12px; margin-bottom:4px">Use this URL instead:</div>
        <code style="font-size:12px; word-break:break-all">${esc(location.origin)}/main.aspx?pagetype=webresource&amp;webresourceName=${esc(webResourceName)}</code>
      </div>
    </div></div>`;
}

/* Wiring both shells share. Every control is bound only if the shell actually renders it, so the
   single-report runtime can leave out the catalogue chrome without this throwing on a missing node. */
function bootShared(){
  const inCrm = initXrm();
  applyTheme(state.theme);

  const runAsLabel = $("#runAsLabel");
  if (runAsLabel) runAsLabel.textContent = inCrm ? ("Running as: " + state.callerName) : "Not connected to CRM";
  const themeToggle = $("#themeToggle");
  if (themeToggle) themeToggle.onclick = e => { e.stopPropagation(); $("#themeMenu").classList.toggle("open"); };
  document.querySelectorAll("[data-set-theme]").forEach(b => b.onclick = () => {
    applyTheme(b.dataset.setTheme); $("#themeMenu").classList.remove("open"); toast("Theme: " + b.dataset.setTheme);
  });
  const settingsBtn = $("#settingsBtn"); if (settingsBtn) settingsBtn.onclick = openSettings;
  const runAsBtn = $("#runAs"); if (runAsBtn) runAsBtn.onclick = openSettings;
  const modalBack = $("#modalBack");
  if (modalBack) modalBack.onclick = e => { if (e.target === modalBack) closeModal(); };
  document.addEventListener("click", () =>
    document.querySelectorAll(".menu.open, .theme-menu.open").forEach(m => m.classList.remove("open")));
  return inCrm;
}

/** The catalogue shell: browse reports and dashboards, open any of them. */
function bootCatalog(){
  const inCrm = bootShared();
  document.querySelectorAll(".nav-item[data-nav]").forEach(b => b.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    if (b.dataset.nav === "dashboards") loadDashboards(); else loadCatalog();
  });

  if (!inCrm) { $("#content").innerHTML = notInCrmNotice("qdb_reportengine_runtime.html"); return; }
  if (launchParam("selftest") === "1") { runSelfTest(); return; }

  // Kept so an existing link carrying a reportId still lands on that report rather than the grid.
  const requestedReportId = launchParam("reportId");
  if (requestedReportId) { openReport(requestedReportId).catch(showOpenFailure); return; }
  loadCatalog();
}

/** The single-report runtime: one report, its filters, its data. No catalogue, nowhere to wander. */
function bootSingleReport(){
  const inCrm = bootShared();
  if (!inCrm) { $("#content").innerHTML = notInCrmNotice("qdb_reportengine_report.html"); return; }

  reportView.showBack = false;
  reportView.showBreadcrumb = false;
  reportView.showChartMenu = false;
  reportView.autoRun = true;
  reportView.contextRecordId = launchParam("recordId");
  reportView.contextEntityName = launchParam("entity");

  const reportId = launchParam("reportId");
  if (!reportId) {
    $("#content").innerHTML = openFailureHtml("No report was requested.",
      "This runtime opens one named report, and it was opened without a report id.");
    return;
  }
  openReport(reportId).catch(showOpenFailure);
}

/* Failing visibly matters here. Quietly falling back to the catalogue is what made a broken launch
   look like a working one for hours — the report simply "was" the catalogue and nobody could tell. */
function openFailureHtml(title, detail){
  return `<div class="page"><div class="empty">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/></svg>
    <div style="color:var(--error)"><b>${esc(title)}</b></div>
    <div style="color:var(--text-secondary); max-width:520px; margin-top:6px">${esc(detail)}</div>
  </div></div>`;
}
function showOpenFailure(error){
  $("#content").innerHTML = openFailureHtml("That report could not be opened.",
    String((error && error.message) || error));
}
