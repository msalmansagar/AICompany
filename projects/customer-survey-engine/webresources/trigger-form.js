/*
 * qdb_/survey/trigger-form.js — Survey Trigger form script (Addendum D).
 * OnLoad: shows the One-time section only for One-time triggers and the Scheduled run section only for
 * Scheduled triggers (001-scale-per-org), and hands the form context to the
 * audience panel (qdb_/survey/trigger-audience.html) through getContentWindow, the supported way.
 * Registered as QdbSurveyTriggerForm.onLoad with "pass execution context".
 */
var QdbSurveyTriggerForm = (function () {
  'use strict';

  var ONE_TIME_KIND = 100000004;
  var SCHEDULED_KIND = 100000002;
  var ONE_TIME_SECTION = 'One_time';
  var SCHEDULED_RUN_SECTION = 'Scheduled_run';
  var AUDIENCE_CONTROL = 'WebResource_qdb_audience';

  function isKind(formContext, kindValue) {
    var kind = formContext.getAttribute('qdb_trigger_kind');
    return Boolean(kind) && kind.getValue() === kindValue;
  }

  function isOneTime(formContext) {
    return isKind(formContext, ONE_TIME_KIND);
  }

  function showSection(formContext, sectionName, isVisible) {
    formContext.ui.tabs.forEach(function (tab) {
      var section = tab.sections.get(sectionName);
      if (section) section.setVisible(isVisible);
    });
  }

  // One-time triggers show their send section; scheduled triggers show the run of the current period (FR-005).
  function showKindSections(formContext) {
    showSection(formContext, ONE_TIME_SECTION, isOneTime(formContext));
    showSection(formContext, SCHEDULED_RUN_SECTION, isKind(formContext, SCHEDULED_KIND));
  }

  var PANEL_WAIT_RETRIES = 40;
  var PANEL_WAIT_MS = 250;

  // The legacy web client on 9.1 has no getContentWindow; its control exposes the iframe instead.
  function audienceWindow(formContext) {
    var control = formContext.getControl(AUDIENCE_CONTROL);
    if (!control) return Promise.reject(new Error('The audience panel is not on this form.'));
    if (typeof control.getContentWindow === 'function') return control.getContentWindow();
    return Promise.resolve(control.getObject().contentWindow);
  }

  // OnLoad can run before the panel's own script has loaded (seen live on the first open), so wait for it.
  function panelApi(panel, attemptsLeft) {
    if (panel && panel.QdbSurveyAudience) return Promise.resolve(panel.QdbSurveyAudience);
    if (attemptsLeft <= 0) return Promise.reject(new Error('its script did not load.'));
    return new Promise(function (resolve) { setTimeout(resolve, PANEL_WAIT_MS); }).then(function () { return panelApi(panel, attemptsLeft - 1); });
  }

  function startAudiencePanel(formContext) {
    if (!isOneTime(formContext)) return;
    audienceWindow(formContext).then(function (panel) { return panelApi(panel, PANEL_WAIT_RETRIES); }).then(function (api) {
      api.init(formContext);
    }).catch(function (problem) {
      formContext.ui.setFormNotification('The audience panel could not start: ' + problem.message, 'ERROR', 'qdb_audience_panel');
    });
  }

  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    showKindSections(formContext);
    startAudiencePanel(formContext);
    formContext.getAttribute('qdb_trigger_kind').addOnChange(function () {
      showKindSections(formContext);
      startAudiencePanel(formContext);
    });
  }

  return { onLoad: onLoad };
}());

// Lets the unit tests load the script; CRM loads it as a plain browser script.
if (typeof module === 'object' && module.exports) module.exports = QdbSurveyTriggerForm;
