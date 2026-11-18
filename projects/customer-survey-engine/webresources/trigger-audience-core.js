/*
 * qdb_/survey/trigger-audience-core.js — the audience panel's pure rules (Addendum D, Amendment 1).
 * No DOM, no CRM calls: tested in node, loaded in the browser before trigger-audience.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QdbSurveyAudienceCore = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONTACT_TABLE_CODE = 100000001;
  var RUN_STATUS = { notSent: 100000000, sending: 100000001, sent: 100000002, failed: 100000003 };

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

  /**
   * Whether the editor's filter differs from what it showed after loading the stored one. The editor rewrites
   * what it cannot show (a stored "like '%x'" comes back as "eq"), so an unchanged editor must not be written back.
   */
  function isBuilderChanged(current, seeded) {
    return current !== seeded;
  }

  function attributesOf(tag) {
    var found = {};
    tag.replace(/([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g, function (all, n1, v1, n2, v2) { found[(n1 || n2).toLowerCase()] = v1 !== undefined ? v1 : v2; return all; });
    return found;
  }

  // The editor writes a GUID as "{GUID}" in capitals; a view as a bare lower-case GUID. Same value either way.
  function normaliseValue(value) {
    var guid = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i.exec(value || '');
    return guid ? guid[1].toLowerCase() : value;
  }

  /**
   * QA-D1 (CEO 2026-11-18): a survey is sent by the server, where there is no "current user", so a view's
   * "current user" conditions are pinned to the administrator who copies it ("My Active Accounts" becomes
   * "accounts owned by <admin>"). Other user-relative operators stay; the server refuses them with a message.
   */
  function resolveCurrentUser(fetchXml, userId) {
    var id = String(userId || '').replace(/[{}]/g, '').toLowerCase();
    if (!id) return fetchXml;
    return String(fetchXml || '').replace(/<condition\b([^>]*?)\boperator\s*=\s*(["'])(eq|ne)-userid\2([^>]*?)(\/?)>/gi, function (all, before, quote, op, after, slash) {
      return '<condition' + before + 'operator=' + quote + op.toLowerCase() + quote + ' value=' + quote + id + quote + after + slash + '>';
    });
  }

  function signatureToken(tag) {
    var attributes = attributesOf(tag);
    if (/^<condition/i.test(tag)) return 'c:' + [attributes.attribute, attributes.operator, normaliseValue(attributes.value)].join('|');
    return 'l:' + [attributes.name, attributes.from, attributes.to, attributes['link-type'] || 'inner'].join('|');
  }

  /**
   * What a filter selects, independent of formatting: its conditions (attribute, operator, value), the
   * <value> items of multi-value conditions, and its link-entities. Used to tell whether the condition
   * editor shows a filter faithfully (FR-CSE-097): the editor rewrites what it cannot show.
   */
  function conditionSignature(fetchXml) {
    var text = String(fetchXml || '');
    var tags = (text.match(/<(condition|link-entity)\b[^>]*>/gi) || []).map(signatureToken);
    var values = (text.match(/<value>[^<]*<\/value>/gi) || []).map(function (value) { return 'v:' + normaliseValue(value.replace(/<\/?value>/gi, '')); });
    return tags.concat(values).sort().join('\n');
  }

  /** True when the editor gave back the same conditions it was given. */
  function isFaithful(source, roundTrip) {
    return conditionSignature(source) === conditionSignature(roundTrip);
  }

  /** True when the view was modified after the audience was copied from it (FR-CSE-096). */
  function isViewNewer(viewModifiedOn, copiedOn) {
    if (!viewModifiedOn || !copiedOn) return false;
    return Date.parse(viewModifiedOn) > Date.parse(copiedOn);
  }

  return {
    builderUrl: builderUrl, customerTableFor: customerTableFor, sendAvailability: sendAvailability, describeProgress: describeProgress,
    apiErrorText: apiErrorText, isBuilderChanged: isBuilderChanged, conditionSignature: conditionSignature, isFaithful: isFaithful,
    resolveCurrentUser: resolveCurrentUser,
    isViewNewer: isViewNewer, RUN_STATUS: RUN_STATUS,
  };
}));
