/* Local-dev Xrm shim — served by dev-serve.mjs, injected ahead of the page's own script.
 *
 * The designer and runtime read Dataverse exclusively through Xrm.WebApi and getGlobalContext(),
 * which only exist inside CRM. This provides the same surface against the dev server's /api/data
 * proxy, so the SHIPPED web resources run locally, unmodified, on real org data.
 *
 * Inside CRM window.Xrm exists and this file does nothing — the shim can never shadow the real one.
 *
 * Entity set names are resolved from EntityDefinitions rather than pluralised by rule: a naive
 * pluraliser once hid a wrong entity-set name in DFE local dev that the real Xrm.WebApi rejected
 * in the org. Resolving from metadata keeps dev and CRM on the same answer.
 */
(function () {
  "use strict";
  if (window.Xrm) return;

  var API_VERSION = "__API_VERSION__";
  var API = "/api/data/v" + API_VERSION + "/";
  var entitySets = {};

  function oDataHeaders(extra) {
    var headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: 'odata.include-annotations="*"'
    };
    for (var key in (extra || {})) headers[key] = extra[key];
    return headers;
  }

  async function oData(method, path, body, extraHeaders) {
    var response = await fetch(path, {
      method: method,
      headers: oDataHeaders(extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw await webApiError(response);
    return response;
  }

  /* Xrm.WebApi rejections carry { message, errorCode }; callers here read .message, so the org's
     own words have to survive the trip rather than arriving as "HTTP 400". */
  async function webApiError(response) {
    var message = "HTTP " + response.status;
    try {
      var payload = await response.json();
      if (payload.error && payload.error.message) message = payload.error.message;
    } catch (ignored) { /* a non-JSON error body keeps the status line */ }
    var error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function entitySetOf(logicalName) {
    if (entitySets[logicalName]) return entitySets[logicalName];
    var response = await oData("GET", API + "EntityDefinitions(LogicalName='" + logicalName + "')?$select=EntitySetName");
    entitySets[logicalName] = (await response.json()).EntitySetName;
    return entitySets[logicalName];
  }

  /* The id of a create lives ONLY in the OData-EntityId header — a Dataverse POST returns 204 with
     an empty body, and reading the body instead once silently orphaned records in another project. */
  function idFromEntityId(response) {
    var header = response.headers.get("OData-EntityId") || "";
    var match = /\(([0-9a-fA-F-]{36})\)/.exec(header);
    return match ? match[1] : null;
  }

  var webApi = {
    retrieveMultipleRecords: async function (logicalName, options, pageSize) {
      var set = await entitySetOf(logicalName);
      var extra = pageSize ? { Prefer: 'odata.include-annotations="*",odata.maxpagesize=' + pageSize } : undefined;
      var payload = await (await oData("GET", API + set + (options || ""), undefined, extra)).json();
      return { entities: payload.value || [], nextLink: payload["@odata.nextLink"] || null };
    },
    retrieveRecord: async function (logicalName, id, options) {
      var set = await entitySetOf(logicalName);
      return (await oData("GET", API + set + "(" + id + ")" + (options || ""))).json();
    },
    createRecord: async function (logicalName, data) {
      var set = await entitySetOf(logicalName);
      var response = await oData("POST", API + set, data);
      return { id: idFromEntityId(response), entityType: logicalName };
    },
    updateRecord: async function (logicalName, id, data) {
      var set = await entitySetOf(logicalName);
      await oData("PATCH", API + set + "(" + id + ")", data);
      return { id: id, entityType: logicalName };
    },
    deleteRecord: async function (logicalName, id) {
      var set = await entitySetOf(logicalName);
      await oData("DELETE", API + set + "(" + id + ")");
      return { id: id, entityType: logicalName };
    },
    online: {
      /* Enough of execute() for the unbound Custom APIs the viewers call (qdb_RunReport /
         qdb_RunDashboard): POST the request's own properties to the operation. The raw Response is
         returned because that is what Xrm hands back — callers await response.json() themselves. */
      execute: async function (request) {
        var meta = request.getMetadata();
        var body = {};
        for (var key in request) {
          if (key !== "getMetadata" && Object.prototype.hasOwnProperty.call(request, key)) body[key] = request[key];
        }
        return oData("POST", API + meta.operationName, body);
      }
    }
  };
  webApi.online.retrieveMultipleRecords = webApi.retrieveMultipleRecords;

  var globalContext = {
    getClientUrl: function () { return window.location.origin; },
    getVersion: function () { return "__ORG_VERSION__"; },
    userSettings: { userId: "__USER_ID__", userName: "__USER_NAME__", languageId: 1033 }
  };

  window.Xrm = {
    WebApi: webApi,
    Utility: { getGlobalContext: function () { return globalContext; } }
  };

  console.log("[dev-xrm-shim] Xrm shim active — Dataverse via local proxy, API v" + API_VERSION);
})();
