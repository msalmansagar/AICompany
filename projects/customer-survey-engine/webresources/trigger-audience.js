/*
 * qdb_/survey/trigger-audience.js — the One-time trigger's audience panel (Addendum D, ADR-009, Amendment 1):
 * copy a view, adjust it in CRM's condition editor (a FetchXML box if that page is missing), Preview, Send now.
 * The server validates the filter again at save and at send. Pure rules live in trigger-audience-core.js.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./trigger-audience-core.js'), require('./trigger-audience-views.js'))
    : factory(root.QdbSurveyAudienceCore, root.QdbSurveyAudienceViews);
  if (isNode) module.exports = api;
  else root.QdbSurveyAudience = api;
}(typeof self !== 'undefined' ? self : this, function (core, views) {
  'use strict';

  var API_VERSION = 'v9.0';
  var AUDIENCE_FILTER = 100000001;
  // The condition page never reaches readyState "complete" (it keeps a request open), so its load event
  // cannot be awaited; the control is polled for instead (found live on org5869857f, 2026-11-16).
  var CONTROL_RETRIES = 40;
  var CONTROL_RETRY_MS = 500;
  var NOTIFICATION_ID = 'qdb_audience_builder';

  var builderUrl = core.builderUrl;
  var customerTableFor = core.customerTableFor;
  var sendAvailability = core.sendAvailability;
  var describeProgress = core.describeProgress;
  var apiErrorText = core.apiErrorText;
  var isBuilderChanged = core.isBuilderChanged;
  var isFaithful = core.isFaithful;
  var isViewNewer = core.isViewNewer;

  // ---- Browser part --------------------------------------------------------------------------

  // seededFetchXml: what the builder returned right after loading the saved filter. The builder rewrites
  // operators it cannot show (a stored "like '%x'" comes back as "eq"), so the column is written only when
  // the administrator changed the builder; an untouched filter is kept exactly as stored.
  // lockedFetchXml: a copied view filter the editor cannot show faithfully (FR-CSE-097); kept exactly, never
  // loaded into the editor. isLockedChanged: that copy is new and must be written on save.
  var state = {
    formContext: null, clientUrl: '', customerTable: 'account', control: null, seededFetchXml: null,
    lockedFetchXml: null, isLockedChanged: false, isFallback: false, builderReady: null, isBusy: false, isCopying: false, views: [],
  };

  function element(id) { return document.getElementById(id); }

  function showMessage(text, isError) {
    var box = element('message');
    box.textContent = text;
    box.className = isError ? 'message error' : 'message';
  }

  function webApi(method, path, body) {
    var request = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } };
    if (body) request.body = JSON.stringify(body);
    return fetch(state.clientUrl + '/api/data/' + API_VERSION + '/' + path, request).then(function (response) {
      return response.text().then(function (text) {
        var json = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(apiErrorText(json, response.status));
        return json;
      });
    });
  }

  function attributeValue(name) {
    var attribute = state.formContext.getAttribute(name);
    return attribute ? attribute.getValue() : null;
  }

  function recordId() {
    var id = state.formContext.data.entity.getId();
    return id ? id.replace(/[{}]/g, '') : '';
  }

  function isFilterAudience() { return attributeValue('qdb_audience') === AUDIENCE_FILTER; }

  function readCustomerTable() {
    return webApi('GET', 'qdb_survey_settingses?$select=qdb_customer_table&$top=1').then(function (settings) {
      state.customerTable = customerTableFor(settings.value.length ? settings.value[0].qdb_customer_table : null);
      return state.customerTable;
    });
  }

  function readObjectTypeCode() {
    return webApi('GET', "EntityDefinitions(LogicalName='" + state.customerTable + "')?$select=ObjectTypeCode").then(function (definition) { return definition.ObjectTypeCode; });
  }

  function findBuilderControl() {
    try {
      var host = element('builder').contentWindow.document.getElementById('advFind');
      var control = host && host.control;
      return control && typeof control.get_fetchXml === 'function' ? control : null;
    } catch (unreachable) {
      return null;
    }
  }

  // Waits for a control other than `previous`, so a reloaded page is not mistaken for the old one.
  function waitForControl(attemptsLeft, previous) {
    var control = findBuilderControl();
    if (control && control !== previous) return Promise.resolve(control);
    if (attemptsLeft <= 0) return Promise.reject(new Error('The CRM condition builder did not start.'));
    return new Promise(function (resolve) { setTimeout(resolve, CONTROL_RETRY_MS); }).then(function () { return waitForControl(attemptsLeft - 1, previous); });
  }

  // On a freshly loaded page the editor is empty, so the first set_fetchXml is exact.
  function useBuilder(control) {
    state.control = control;
    var saved = attributeValue('qdb_audience_fetchxml');
    if (saved) control.set_fetchXml(saved);
    if (saved && !isFaithful(saved, control.get_fetchXml())) { lockCopy(saved, false); return; }
    state.seededFetchXml = control.get_fetchXml();
    showMessage('Pick a view or build the audience below, then save the trigger.');
  }

  /**
   * Reloads the editor page and loads one filter into it (none to start empty). set_fetchXml ADDS to the
   * conditions already shown, and the page's own Clear asks for confirmation, so a fresh page is the only
   * exact way to replace them (found live on org5869857f, 2026-11-17). Answers whether it shows the filter faithfully.
   */
  function loadIntoFreshEditor(fetchXml) {
    var frame = element('builder');
    var previous = state.control;
    state.control = null;
    frame.style.display = 'block';
    frame.contentWindow.location.replace(frame.src);
    return waitForControl(CONTROL_RETRIES, previous).then(function (control) {
      state.control = control;
      if (fetchXml) control.set_fetchXml(fetchXml);
      return !fetchXml || isFaithful(fetchXml, control.get_fetchXml());
    });
  }

  // FR-CSE-097: keep the filter exactly; changes go through the view and Reload, or Start over.
  function lockCopy(fetchXml, isNew) {
    state.lockedFetchXml = fetchXml;
    state.isLockedChanged = isNew;
    element('builder').style.display = 'none';
    element('start-over').style.display = 'inline-block';
    showMessage('This audience uses conditions the editor here cannot show (for example on related records), so it is kept exactly as copied. To change it, edit the view in CRM and press Reload from view, or press Start over to build your own.');
  }

  function unlockCopy() {
    state.lockedFetchXml = null;
    state.isLockedChanged = false;
    element('start-over').style.display = 'none';
  }

  function useFallback(reason) {
    state.isFallback = true;
    element('builder').style.display = 'none';
    element('fallback').style.display = 'block';
    element('fetchxml').value = attributeValue('qdb_audience_fetchxml') || '';
    showMessage(reason + ' Paste FetchXML downloaded from Advanced Find instead.', true);
  }

  /**
   * Starts the condition editor once and answers a promise that settles when it is ready, or when the
   * FetchXML box has taken over. Everything that needs the editor waits on this same promise.
   */
  function startBuilder() {
    if (state.builderReady) return state.builderReady;
    state.builderReady = readObjectTypeCode().then(function (objectTypeCode) {
      var frame = element('builder');
      frame.style.display = 'block';
      frame.src = builderUrl(state.clientUrl, objectTypeCode);
      return waitForControl(CONTROL_RETRIES);
    })
      .then(useBuilder)
      .catch(function (problem) { useFallback(problem.message); });
    return state.builderReady;
  }

  function readFetchXml() {
    if (state.isFallback) return element('fetchxml').value.trim() || null;
    return state.control ? state.control.get_fetchXml() : null;
  }

  function writeFilter(fetchXml) {
    var attribute = state.formContext.getAttribute('qdb_audience_fetchxml');
    attribute.setValue(fetchXml);
    attribute.setSubmitMode('always');
  }

  // Writes the audience before the record saves; blocks the save while the builder is still starting.
  function onFormSave(executionContext) {
    if (!isFilterAudience()) return;
    if (state.lockedFetchXml !== null) {
      if (state.isLockedChanged) writeFilter(state.lockedFetchXml);
      state.isLockedChanged = false;
      return;
    }
    if (!state.control && !state.isFallback) {
      executionContext.getEventArgs().preventDefault();
      state.formContext.ui.setFormNotification('The audience builder is still loading; save again in a moment.', 'WARNING', NOTIFICATION_ID);
      return;
    }
    state.formContext.ui.clearFormNotification(NOTIFICATION_ID);
    var current = readFetchXml();
    // The FetchXML box always writes; the editor only when the administrator changed it.
    if (!state.isFallback && !isBuilderChanged(current, state.seededFetchXml)) return;
    writeFilter(current);
    state.seededFetchXml = current;
  }

  // ---- Audience from a view (Amendment 1, FR-CSE-090, 095..097) -------------------------------

  function recordSource(view) {
    var values = { qdb_audience_view_name: view.name, qdb_audience_view_id: view.id, qdb_audience_view_type: view.type, qdb_audience_copied_on: new Date(), qdb_audience: AUDIENCE_FILTER };
    // Read-only and hidden fields are not saved unless told to.
    Object.keys(values).forEach(function (name) {
      var attribute = state.formContext.getAttribute(name);
      attribute.setValue(values[name]);
      attribute.setSubmitMode('always');
    });
  }

  // Picking a view works from either audience setting: it switches to Filter, starts the editor if it is
  // not running yet (it only runs for Filter), waits for it, then copies (review of 2026-11-17).
  function copyView(view) {
    state.formContext.getAttribute('qdb_audience').setValue(AUDIENCE_FILTER);
    element('builder-area').style.display = 'block';
    showMessage('Copying "' + view.name + '"…');
    return startBuilder().then(function () { return views.readViewFetchXml(webApi, view); }).then(function (fetchXml) {
      recordSource(view);
      return state.isFallback ? useInFallback(fetchXml) : useInEditor(fetchXml, view);
    }).then(function () {
      refreshSource();
      refreshPanel();
    });
  }

  function useInFallback(fetchXml) {
    element('fetchxml').value = fetchXml;
  }

  function useInEditor(fetchXml, view) {
    return loadIntoFreshEditor(fetchXml).then(function (isShownFaithfully) {
      if (!isShownFaithfully) { lockCopy(fetchXml, true); return; }
      unlockCopy();
      state.seededFetchXml = null;
      showMessage('Copied from "' + view.name + '". Adjust it below for this survey if needed, then save.');
    });
  }

  // Drops the copied view and starts an empty editor; the next save writes whatever is built (FR-CSE-090).
  function onStartOver() {
    if (state.isFallback) { element('fetchxml').value = ''; return; }
    runAlone(startOver);
  }

  function startOver() {
    ['qdb_audience_view_name', 'qdb_audience_view_id', 'qdb_audience_view_type', 'qdb_audience_copied_on'].forEach(function (name) {
      var attribute = state.formContext.getAttribute(name);
      attribute.setValue(null);
      attribute.setSubmitMode('always');
    });
    unlockCopy();
    element('view').value = '';
    return loadIntoFreshEditor(null).then(function () {
      state.seededFetchXml = null;
      showMessage('Build the audience below, then save the trigger.');
      refreshSource();
    }, function (problem) { useFallback(problem.message); });
  }

  function selectedView() { return views.findView(state.views, element('view').value); }

  function storedView() { return views.findView(state.views, attributeValue('qdb_audience_view_type') + ':' + attributeValue('qdb_audience_view_id')); }

  /**
   * Runs one editor change at a time. set_fetchXml adds to what the editor shows, so two loads overlapping
   * on the same fresh page would merge two filters (review 2026-11-17); a second request is refused instead.
   */
  function runAlone(work) {
    if (state.isCopying) { showMessage('Still copying the previous choice; try again in a moment.', true); return; }
    state.isCopying = true;
    work().catch(function (problem) { showMessage(problem.message, true); }).then(function () { state.isCopying = false; });
  }

  function onPickView() {
    var view = selectedView();
    if (view) runAlone(function () { return copyView(view); });
  }

  function onReload() {
    var view = storedView();
    if (!view) { showMessage('The view this audience was copied from no longer exists or is not shared with you.', true); return; }
    runAlone(function () { return copyView(view); });
  }

  // "Copied from" line, and the warning when the view changed since (FR-CSE-095, 096).
  function refreshSource() {
    var name = attributeValue('qdb_audience_view_name');
    var copiedOn = attributeValue('qdb_audience_copied_on');
    var view = storedView();
    element('source').textContent = name ? 'Copied from: ' + name + (copiedOn ? ', ' + new Date(copiedOn).toLocaleString() : '') : '';
    var isStale = Boolean(view) && isViewNewer(view.modifiedOn, copiedOn && new Date(copiedOn).toISOString());
    element('stale').style.display = isStale ? 'block' : 'none';
    element('reload').style.display = name ? 'inline-block' : 'none';
  }

  function currentSendState() {
    return {
      recordId: recordId(), isDirty: state.formContext.data.entity.getIsDirty(), isActive: attributeValue('qdb_is_active') === true,
      runStatus: attributeValue('qdb_run_status'),
      reachedCount: (attributeValue('qdb_invited_count') || 0) + (attributeValue('qdb_postponed_count') || 0) + (attributeValue('qdb_suppressed_count') || 0),
    };
  }

  function refreshPanel() {
    element('builder-area').style.display = isFilterAudience() ? 'block' : 'none';
    if (isFilterAudience()) startBuilder();
    var availability = sendAvailability(currentSendState());
    element('send').disabled = state.isBusy || !availability.canSend;
    element('preview').disabled = state.isBusy || !recordId() || state.formContext.data.entity.getIsDirty();
    element('send-hint').textContent = availability.reason;
  }

  function preview() {
    return webApi('POST', 'qdb_srv_PreviewAudience', { TriggerId: recordId() }).then(function (answer) { return answer.Count; });
  }

  function onPreview() {
    setBusy(true);
    preview().then(function (count) { showMessage(count + ' customer(s) match the audience now.'); })
      .catch(function (problem) { showMessage(problem.message, true); })
      .then(function () { setBusy(false); });
  }

  function confirmSend(count) {
    var text = { title: 'Send this survey now?', text: 'It goes to ' + count + ' customer(s), less anyone surveyed recently. It cannot be undone.', confirmButtonLabel: 'Send now' };
    return parent.Xrm.Navigation.openConfirmDialog(text).then(function (answer) { return answer.confirmed; });
  }

  function sendUntilComplete() {
    return webApi('POST', 'qdb_srv_SendOneTimeTrigger', { TriggerId: recordId() }).then(function (result) {
      showMessage(describeProgress(result), result.Status === 'Failed');
      return result.IsComplete ? result : sendUntilComplete();
    });
  }

  function onSend() {
    setBusy(true);
    preview().then(confirmSend).then(function (isConfirmed) {
      if (!isConfirmed) return null;
      return sendUntilComplete().then(function () { return state.formContext.data.refresh(false); });
    }).catch(function (problem) { showMessage(problem.message, true); })
      .then(function () { setBusy(false); });
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    refreshPanel();
  }

  /** Called by the trigger form's OnLoad (qdb_/survey/trigger-form.js) with the form context. */
  function init(formContext) {
    if (state.formContext) { refreshPanel(); return; }
    state.formContext = formContext;
    state.clientUrl = parent.Xrm.Utility.getGlobalContext().getClientUrl();
    formContext.data.entity.addOnSave(onFormSave);
    formContext.getAttribute('qdb_audience').addOnChange(refreshPanel);
    // addOnPostSave is UCI only; on the legacy client the panel refreshes on the next load.
    if (typeof formContext.data.entity.addOnPostSave === 'function') formContext.data.entity.addOnPostSave(refreshPanel);
    element('preview').onclick = onPreview;
    element('send').onclick = onSend;
    element('view').onchange = onPickView;
    element('reload').onclick = onReload;
    element('start-over').onclick = onStartOver;
    readCustomerTable().then(function (table) { return views.readViews(webApi, table); }).then(function (list) {
      state.views = list;
      views.renderViews(element('view'), list);
      refreshSource();
    })
      .catch(function (problem) { showMessage('Views could not be listed: ' + problem.message, true); })
      .then(refreshPanel);
  }

  return { init: init };
}));
