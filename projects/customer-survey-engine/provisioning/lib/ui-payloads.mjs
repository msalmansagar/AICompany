/**
 * Pure builders for the B8 UI: view FetchXML and layout, chart definitions, main form XML and
 * the app sitemap. Every name is escaped; field types come from manifest.mjs.
 *
 * @module survey-provisioning/ui-payloads
 */
import { createHash } from 'node:crypto';
import { TABLES, RELATIONSHIPS } from '../manifest.mjs';
import { relationshipSchemaName } from './payloads.mjs';

const ACTIVE_STATE = 0;
const PUBLIC_VIEW = 0;
const LANGUAGE_CODE = 1033;

/** Form control class ids per column type (the platform's fixed classids). */
const CONTROL_CLASS = Object.freeze({
  string: '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}',
  memo: '{E0DECE4B-6FC8-4a8f-A065-082708572369}',
  integer: '{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}',
  decimal: '{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E}',
  datetime: '{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}',
  boolean: '{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}',
  picklist: '{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}',
  lookup: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
  subgrid: '{E7A81278-8635-4d9e-8D4D-59480B391C5B}',
});

export const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A stable GUID from a seed, so form element ids do not change between runs. */
export function stableGuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}}`;
}

/** The column's type and label from manifest.mjs; qdb_name is every table's primary name. */
export function describeField(table, name) {
  if (name === 'qdb_name') return { type: 'string', label: 'Name' };
  const relationship = RELATIONSHIPS.find((r) => r.from === table && r.lookup === name);
  if (relationship) return { type: 'lookup', label: relationship.label };
  const column = TABLES.find((t) => t.name === table)?.columns.find((c) => c.name === name);
  if (!column) throw new Error(`${table}.${name} is not in manifest.mjs`);
  return { type: column.type, label: column.label };
}

function conditionXml([attribute, operator, value]) {
  return value === undefined
    ? `<condition attribute="${xml(attribute)}" operator="${xml(operator)}" />`
    : `<condition attribute="${xml(attribute)}" operator="${xml(operator)}" value="${xml(value)}" />`;
}

/** The view's FetchXML: active rows, the view's filters, its order, and linked columns. */
export function buildViewFetchXml(view) {
  const attributes = view.columns.map(([name]) => `<attribute name="${xml(name)}" />`).join('');
  const links = (view.links ?? []).map((link) => `<link-entity name="${xml(link.table)}" from="${xml(link.table)}id" to="${xml(link.lookup)}" link-type="outer" alias="${xml(link.alias)}">`
    + link.columns.map(([name]) => `<attribute name="${xml(name)}" />`).join('') + '</link-entity>').join('');
  const filters = [['statecode', 'eq', ACTIVE_STATE], ...(view.filters ?? [])].map(conditionXml).join('');
  const order = view.order ? `<order attribute="${xml(view.order.attribute)}" descending="${view.order.descending}" />` : '';
  return `<fetch version="1.0" mapping="logical"><entity name="${xml(view.table)}"><attribute name="${xml(view.table)}id" />${attributes}${order}<filter type="and">${filters}</filter>${links}</entity></fetch>`;
}

/** The view's grid layout; linked columns are named alias.column. */
export function buildViewLayoutXml(view, objectTypeCode) {
  const cells = [...view.columns.map(([name, width]) => [name, width]), ...(view.links ?? []).flatMap((link) => link.columns.map(([name, width]) => [`${link.alias}.${name}`, width]))]
    .map(([name, width]) => `<cell name="${xml(name)}" width="${width}" />`).join('');
  return `<grid name="resultset" object="${objectTypeCode}" jump="qdb_name" select="1" icon="1" preview="1"><row name="result" id="${xml(view.table)}id">${cells}</row></grid>`;
}

export function buildViewPayload(view, objectTypeCode) {
  return {
    name: view.name, description: view.description, returnedtypecode: view.table, querytype: PUBLIC_VIEW,
    fetchxml: buildViewFetchXml(view), layoutxml: buildViewLayoutXml(view, objectTypeCode),
  };
}

/** The chart's data description: one aggregate measure over one grouping. */
export function buildChartDataXml(chart) {
  const groupBy = chart.groupBy.dategrouping
    ? `<attribute name="${xml(chart.groupBy.attribute)}" groupby="true" dategrouping="${xml(chart.groupBy.dategrouping)}" alias="groupby_column" />`
    : `<attribute name="${xml(chart.groupBy.attribute)}" groupby="true" alias="groupby_column" />`;
  const filters = (chart.filters ?? []).map(conditionXml).join('');
  return `<datadefinition><fetchcollection><fetch mapping="logical" aggregate="true"><entity name="${xml(chart.table)}">`
    + `<attribute name="${xml(chart.measure.attribute)}" aggregate="${xml(chart.measure.aggregate)}" alias="aggregate_column" />${groupBy}`
    + `${filters ? `<filter type="and">${filters}</filter>` : ''}</entity></fetch></fetchcollection>`
    + '<categorycollection><category><measurecollection><measure alias="aggregate_column" /></measurecollection></category></categorycollection></datadefinition>';
}

/** The chart's presentation; a pie also gets a legend. */
export function buildChartPresentationXml(chart) {
  const legend = chart.type === 'Pie' ? '<Legends><Legend Alignment="Center" LegendStyle="Table" Docking="right" /></Legends>' : '';
  return `<Chart><Series><Series ChartType="${xml(chart.type)}" IsValueShownAsLabel="True" Font="{0}, 9.5px" LabelForeColor="59, 59, 59" /></Series>`
    + '<ChartAreas><ChartArea BorderColor="White" BorderDashStyle="Solid"><AxisY LabelAutoFitMinFontSize="8" TitleForeColor="59, 59, 59"><MajorGrid LineColor="239, 242, 246" /></AxisY>'
    + '<AxisX LabelAutoFitMinFontSize="8" TitleForeColor="59, 59, 59"><MajorGrid Enabled="False" /></AxisX></ChartArea></ChartAreas>'
    + `<Titles><Title Alignment="TopLeft" DockingOffset="-3" Font="{0}, 13px" ForeColor="59, 59, 59" /></Titles>${legend}</Chart>`;
}

export function buildChartPayload(chart) {
  return {
    name: chart.name, description: chart.description, primaryentitytypecode: chart.table, isdefault: false,
    datadescription: buildChartDataXml(chart), presentationdescription: buildChartPresentationXml(chart),
  };
}

const labels = (text) => `<labels><label description="${xml(text)}" languagecode="${LANGUAGE_CODE}" /></labels>`;

function fieldCell(table, field) {
  const { name, readOnly } = typeof field === 'string' ? { name: field, readOnly: false } : field;
  const { type, label } = describeField(table, name);
  const disabled = readOnly ? ' disabled="true"' : '';
  return `<row><cell id="${stableGuid(`${table}.${name}.cell`)}">${labels(label)}`
    + `<control id="${xml(name)}" classid="${CONTROL_CLASS[type]}" datafieldname="${xml(name)}"${disabled} /></cell></row>`;
}

function subgridCell(table, subgrid, viewIdFor) {
  const relationship = relationshipSchemaName({ lookup: subgrid.lookup, from: subgrid.table, to: table });
  const parameters = `<TargetEntityType>${xml(subgrid.table)}</TargetEntityType><RelationshipName>${xml(relationship)}</RelationshipName>`
    + `<ViewId>${viewIdFor(subgrid.table, subgrid.view)}</ViewId><IsUserView>false</IsUserView><RecordsPerPage>10</RecordsPerPage><AutoExpand>Fixed</AutoExpand>`
    + '<EnableQuickFind>false</EnableQuickFind><EnableViewPicker>false</EnableViewPicker><EnableJumpBar>false</EnableJumpBar><ChartGridMode>Grid</ChartGridMode>'
    + '<VisualizationId /><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker>';
  return `<row><cell id="${stableGuid(`${table}.${subgrid.table}.subgrid`)}" colspan="1" rowspan="10">${labels(subgrid.view)}`
    + `<control id="${xml(subgrid.table)}_grid" classid="${CONTROL_CLASS.subgrid}" indicationOfSubgrid="true"><parameters>${parameters}</parameters></control></cell></row>`;
}

function sectionXml(table, section, viewIdFor) {
  const rows = section.subgrid ? subgridCell(table, section.subgrid, viewIdFor) : section.fields.map((field) => fieldCell(table, field)).join('');
  return `<section name="${xml(section.label.replace(/\W+/g, '_'))}" id="${stableGuid(`${table}.${section.label}.section`)}" showlabel="true" showbar="false" columns="1">${labels(section.label)}<rows>${rows}</rows></section>`;
}

/**
 * The main form XML. `viewIdFor(table, viewName)` answers the saved query id a subgrid lists.
 */
export function buildFormXml(form, viewIdFor) {
  const tabs = form.tabs.map((tab) => `<tab name="${xml(tab.label.replace(/\W+/g, '_'))}" id="${stableGuid(`${form.table}.${tab.label}.tab`)}" expanded="true" showlabel="true">`
    + `${labels(tab.label)}<columns><column width="100%"><sections>${tab.sections.map((section) => sectionXml(form.table, section, viewIdFor)).join('')}</sections></column></columns></tab>`).join('');
  return `<form><tabs>${tabs}</tabs></form>`;
}

/** The app's sitemap: one Surveys area with a group per manifest group. */
export function buildSiteMapXml(app) {
  const groups = app.groups.map((group) => `<Group Id="${xml(group.id)}" IsProfile="false"><Titles><Title LCID="${LANGUAGE_CODE}" Title="${xml(group.title)}" /></Titles>`
    + group.tables.map((table) => `<SubArea Id="sub_${xml(table)}" Entity="${xml(table)}" />`).join('') + '</Group>').join('');
  return `<SiteMap IntroducedVersion="7.0.0.0"><Area Id="qdb_survey_area" ShowGroups="true" IntroducedVersion="7.0.0.0"><Titles><Title LCID="${LANGUAGE_CODE}" Title="Surveys" /></Titles>${groups}</Area></SiteMap>`;
}
