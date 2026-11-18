/*
 * qdb_/survey/trigger-audience-views.js — the views of the customer table, for the audience panel
 * (Addendum D Amendment 1, FR-CSE-090): read them over the Web API and fill the picker. Loaded before
 * trigger-audience.js. `webApi(method, path)` answers the parsed JSON body.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QdbSurveyAudienceViews = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUPS = [['savedquery', 'System views'], ['userquery', 'My and shared views']];

  /** System views, then the user's own and shared views, of the table; active ones only. */
  function readViews(webApi, customerTable) {
    var filter = encodeURIComponent("returnedtypecode eq '" + customerTable + "' and querytype eq 0 and statecode eq 0");
    var system = webApi('GET', 'savedqueries?$select=name,modifiedon&$filter=' + filter + '&$orderby=name');
    var personal = webApi('GET', 'userqueries?$select=name,modifiedon&$filter=' + filter + '&$orderby=name');
    return Promise.all([system, personal]).then(function (answers) {
      return answers[0].value.map(function (v) { return { id: v.savedqueryid, type: 'savedquery', name: v.name, modifiedOn: v.modifiedon }; })
        .concat(answers[1].value.map(function (v) { return { id: v.userqueryid, type: 'userquery', name: v.name, modifiedOn: v.modifiedon }; }));
    });
  }

  /** The view's FetchXML as stored now. */
  function readViewFetchXml(webApi, view) {
    var set = view.type === 'savedquery' ? 'savedqueries' : 'userqueries';
    return webApi('GET', set + '(' + view.id + ')?$select=fetchxml').then(function (row) { return row.fetchxml; });
  }

  function option(view) {
    var item = document.createElement('option');
    item.value = view.type + ':' + view.id;
    item.textContent = view.name;
    return item;
  }

  /** Adds the views to the picker, grouped; names go in as text, never as HTML. */
  function renderViews(picker, views) {
    GROUPS.forEach(function (group) {
      var members = views.filter(function (view) { return view.type === group[0]; });
      if (!members.length) return;
      var optgroup = document.createElement('optgroup');
      optgroup.label = group[1];
      members.forEach(function (view) { optgroup.appendChild(option(view)); });
      picker.appendChild(optgroup);
    });
  }

  /** The view a picker value ("type:id") names, from the list read. */
  function findView(views, pickerValue) {
    var parts = String(pickerValue || '').split(':');
    return views.filter(function (view) { return view.type === parts[0] && view.id === parts[1]; })[0];
  }

  return { readViews: readViews, readViewFetchXml: readViewFetchXml, renderViews: renderViews, findView: findView };
}));
