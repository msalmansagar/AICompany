/*
 * qdb_/survey/trigger-audience.js — the One-time trigger's audience panel (Addendum D, ADR-009).
 *
 * Hosts CRM's own condition builder (/SFA/goal/ParticipatingQueryCondition.aspx) in a same-origin
 * iframe, the technique proven by the Process Engine's qdb_AdvanceFindFilter.html, and writes its
 * FetchXML into qdb_audience_fetchxml when the form saves. If the page or its control is missing
 * (a 9.1 build without it), a plain FetchXML box takes over. Also offers Preview and Send now,
 * which call qdb_srv_PreviewAudience and qdb_srv_SendOneTimeTrigger. The server validates the
 * filter again at save and at send; nothing here is trusted.
 *
 * Pure helpers are exported for node tests; the browser part starts from init(formContext).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QdbSurveyAudience = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var API_VERSION = 'v9.0';
  var CONTACT_TABLE_CODE = 100000001;
  var AUDIENCE_FILTER = 100000001;
  var RUN_STATUS = { notSent: 100000000, sending: 100000001, sent: 100000002, failed: 100000003 };
  var CONTROL_RETRIES = 12;
  var CONTROL_RETRY_MS = 500;
  var NOTIFICATION_ID = 'qdb_audience_builder';

  // ---- Pure helpers (tested in node) ---------------------------------------------------------

  /** The CRM condition-builder page for a table's object type code. */
  function builderUrl(clientUrl, objectTypeCode) {
    if (!/^\d+$/.test(String(objectTypeCode))) throw new Error('Object type code must be a number.');
    return clientUrl.replace(/\/$/, '') + '/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode=' + objectTypeCode + '&readonlymode=false';
  }

  /** account or contact, from Survey Settings → Customer Table. */
  function customerTableFor(customerTableCode) {
    return customerTableCode === CONTACT_TABLE_CODE ? 'contact' : 'account';
  }

  /** Whether the Send now button may be pressed, and why not. */
  function sendAvailability(state) {
    if (!state.recordId) return { canSend: false, reason: 'Save the trigger first.' };
    if (state.isDirty) return { canSend: false, reason: 'Save your changes first.' };
    if (!state.isActive) return { canSend: false, reason: 'Switch the trigger on (Is Active) first.' };
    if (state.runStatus === RUN_STATUS.sent) return { canSend: false, reason: 'Already sent. Copy the trigger to send again.' };
    if (state.runStatus === RUN_STATUS.failed && state.reachedCount > 0) return { canSend: false, reason: 'This send failed part-way. Copy the trigger to send to the rest.' };
    return { canSend: true, reason: '' };
  }

  /** One line for the panel after a Send call. */
  function describeProgress(result) {
    var totals = result.Invited + ' invited, ' + result.Postponed + ' postponed, ' + result.Suppressed + ' suppressed';
    if (result.Status === 'Failed') return 'Failed: ' + result.Message;
    return (result.IsComplete ? 'Sent: ' : 'Sending… ') + totals;
  }

  /** The error text in a Web API error body, or a generic one. */
  function apiErrorText(body, status) {
    var message = body && body.error && body.error.message;
    return message ? String(message) : 'The request failed (HTTP ' + status + ').';
  }

  // ---- Browser part --------------------------------------------------------------------------

  var state = { formContext: null, clientUrl: '', control: null, isFallback: false, isBusy: false };

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

  function readObjectTypeCode() {
    return webApi('GET', 'qdb_survey_settingses?$select=qdb_customer_table&$top=1').then(function (settings) {
      var code = settings.value.length ? settings.value[0].qdb_customer_table : null;
      return webApi('GET', "EntityDefinitions(LogicalName='" + customerTableFor(code) + "')?$select=ObjectTypeCode");
    }).then(function (definition) { return definition.ObjectTypeCode; });
  }

  function findBuilderControl() {
    try {
      var advFind = element('builder').contentWindow.advFind;
      var control = advFind && advFind.parentElement.children.advFind.control;
      return control && typeof control.get_fetchXml === 'function' ? control : null;
    } catch (unreachable) {
      return null;
    }
  }

  function waitForControl(attemptsLeft) {
    var control = findBuilderControl();
    if (control) return Promise.resolve(control);
    if (attemptsLeft <= 0) return Promise.reject(new Error('The CRM condition builder did not start.'));
    return new Promise(function (resolve) { setTimeout(resolve, CONTROL_RETRY_MS); }).then(function () { return waitForControl(attemptsLeft - 1); });
  }

  function useBuilder(control) {
    state.control = control;
    var saved = attributeValue('qdb_audience_fetchxml');
    if (saved) control.set_fetchXml(saved);
    showMessage('Build the audience below, then save the trigger.');
  }

  function useFallback(reason) {
    state.isFallback = true;
    element('builder').style.display = 'none';
    element('fallback').style.display = 'block';
    element('fetchxml').value = attributeValue('qdb_audience_fetchxml') || '';
    showMessage(reason + ' Paste FetchXML downloaded from Advanced Find instead.', true);
  }

  function loadBuilder() {
    if (state.control || state.isFallback) return;
    readObjectTypeCode().then(function (objectTypeCode) {
      var frame = element('builder');
      frame.style.display = 'block';
      frame.src = builderUrl(state.clientUrl, objectTypeCode);
      return new Promise(function (resolve) { frame.onload = resolve; });
    }).then(function () { return waitForControl(CONTROL_RETRIES); })
      .then(useBuilder)
      .catch(function (problem) { useFallback(problem.message); });
  }

  function readFetchXml() {
    if (state.isFallback) return element('fetchxml').value.trim() || null;
    return state.control ? state.control.get_fetchXml() : null;
  }

  // Writes the builder's FetchXML before the record saves; blocks the save while the builder is still starting.
  function onFormSave(executionContext) {
    if (!isFilterAudience()) return;
    if (!state.control && !state.isFallback) {
      executionContext.getEventArgs().preventDefault();
      state.formContext.ui.setFormNotification('The audience builder is still loading; save again in a moment.', 'WARNING', NOTIFICATION_ID);
      return;
    }
    state.formContext.ui.clearFormNotification(NOTIFICATION_ID);
    var fetchXml = state.formContext.getAttribute('qdb_audience_fetchxml');
    fetchXml.setValue(readFetchXml());
    fetchXml.setSubmitMode('always');
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
    if (isFilterAudience()) loadBuilder();
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
    refreshPanel();
  }

  return { builderUrl: builderUrl, customerTableFor: customerTableFor, sendAvailability: sendAvailability, describeProgress: describeProgress, apiErrorText: apiErrorText, init: init, RUN_STATUS: RUN_STATUS };
}));
