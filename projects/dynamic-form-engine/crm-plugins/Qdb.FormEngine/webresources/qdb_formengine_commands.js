"use strict";

// Form Engine command-bar handlers for the qdb_form_definition table.
// Invokes the qdb_PublishForm Custom API to regenerate the published render-cache JSON.
// PublishJobId is passed empty so the plugin auto-creates the publish job.
var Qdb = Qdb || {};
Qdb.FormEngine = Qdb.FormEngine || {};

Qdb.FormEngine.Commands = (function () {

  // Runtime backend base URL — change per environment (dev: http://localhost:4000).
  // After a publish the button calls this backend's cache-invalidate endpoint so the
  // freshly generated JSON is served immediately instead of waiting for the cache TTL.
  var BACKEND_BASE_URL = "http://localhost:4000";

  // Shared secret matching the backend's INTERNAL_CACHE_SECRET. Sent as the
  // x-internal-cache-secret header to authorise the invalidate call without a user token.
  // Note: this value is visible to anyone who can read the web resource — it gates the
  // low-risk invalidate endpoint only. Leave empty to skip the header (dev with SKIP_AUTH).
  var INTERNAL_CACHE_SECRET = "76cb7301f3a2d95b06af68e63778322dc7aa3cc20597b92f";

  // Best-effort: drop the runtime backend's in-process render cache for this form so the
  // new JSON is served instantly. A failure here never fails the publish itself.
  function invalidateBackendCache(formCode) {
    try {
      var headers = { "Content-Type": "application/json" };
      if (INTERNAL_CACHE_SECRET) {
        headers["x-internal-cache-secret"] = INTERNAL_CACHE_SECRET;
      }
      return fetch(BACKEND_BASE_URL + "/api/internal/cache/invalidate", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ formCode: formCode, target: "renderCache" })
      }).then(function (res) { return res.ok; }, function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function buildPublishRequest(formCode) {
    return {
      FormCode: formCode,
      TargetVersion: 0,
      PublishJobId: "",
      getMetadata: function () {
        return {
          boundParameter: null,
          parameterTypes: {
            FormCode: { typeName: "Edm.String", structuralProperty: 1 },
            TargetVersion: { typeName: "Edm.Int32", structuralProperty: 1 },
            PublishJobId: { typeName: "Edm.String", structuralProperty: 1 }
          },
          operationType: 0,
          operationName: "qdb_PublishForm"
        };
      }
    };
  }

  function executePublish(formCode) {
    if (!formCode) {
      Xrm.Navigation.openAlertDialog({ text: "No form code found. Save the form first." });
      return;
    }

    Xrm.Utility.showProgressIndicator(
      "Publishing '" + formCode + "' — generating cached JSON for all active languages…"
    );

    Xrm.WebApi.online.execute(buildPublishRequest(formCode)).then(
      function () {
        return invalidateBackendCache(formCode);
      },
      function (error) {
        Xrm.Utility.closeProgressIndicator();
        Xrm.Navigation.openErrorDialog({
          message: "Publish failed for '" + formCode + "': " + ((error && error.message) || "Unknown error")
        });
        throw error;
      }
    ).then(
      function (backendRefreshed) {
        Xrm.Utility.closeProgressIndicator();
        Xrm.Navigation.openAlertDialog({
          title: "Form published",
          text: "Form '" + formCode + "' was published and the render cache was regenerated for all active languages."
            + (backendRefreshed
                ? " The runtime backend was refreshed instantly."
                : " The runtime backend will pick it up within its cache TTL.")
        });
      },
      function () { /* publish error already surfaced above */ }
    );
  }

  // Form command-bar handler. Configure the command parameter: PrimaryControl.
  function publishForm(primaryControl) {
    var attribute = primaryControl && primaryControl.getAttribute
      ? primaryControl.getAttribute("qdb_form_code")
      : null;
    executePublish(attribute ? attribute.getValue() : null);
  }

  // Grid command-bar handler. Configure the command parameter:
  // SelectedControlSelectedItemReferences.
  function publishSelectedForm(selectedItemReferences) {
    if (!selectedItemReferences || selectedItemReferences.length === 0) {
      Xrm.Navigation.openAlertDialog({ text: "Select a form row first." });
      return;
    }

    var recordId = selectedItemReferences[0].Id.replace(/[{}]/g, "");
    Xrm.WebApi.retrieveRecord("qdb_form_definition", recordId, "?$select=qdb_form_code").then(
      function (record) { executePublish(record.qdb_form_code); },
      function (error) {
        Xrm.Navigation.openErrorDialog({
          message: "Could not read the selected form: " + ((error && error.message) || "Unknown error")
        });
      }
    );
  }

  // Opens the in-CRM form runtime web resource for a form definition GUID. Prefers the modern
  // navigateTo dialog (cloud / newer platforms); falls back to openWebResource for on-prem,
  // where navigateTo with pageType "webresource" is not available. Both pass the GUID as the
  // ?data= parameter the runtime reads.
  function openRuntime(formDefinitionId) {
    var id = (formDefinitionId || "").replace(/[{}]/g, "");
    if (!id) {
      Xrm.Navigation.openAlertDialog({ text: "No form selected." });
      return;
    }

    function openInWindow() {
      if (Xrm.Navigation && Xrm.Navigation.openWebResource) {
        Xrm.Navigation.openWebResource("qdb_form_runtime.html", { height: 900, width: 1200 }, id);
      } else if (Xrm.Utility && Xrm.Utility.openWebResource) {
        Xrm.Utility.openWebResource("qdb_form_runtime.html", id, 1200, 900);
      } else {
        Xrm.Navigation.openErrorDialog({ message: "This platform cannot open the form web resource." });
      }
    }

    try {
      var pageInput = { pageType: "webresource", webresourceName: "qdb_form_runtime.html", data: id };
      var navigationOptions = {
        target: 2, position: 1,
        width: { value: 85, unit: "%" }, height: { value: 92, unit: "%" }, title: "Form"
      };
      Xrm.Navigation.navigateTo(pageInput, navigationOptions).then(undefined, openInWindow);
    } catch (e) {
      openInWindow();
    }
  }

  // Form command-bar handler (button on a Form Definition record). Param: PrimaryControl.
  function openForm(primaryControl) {
    var id = primaryControl && primaryControl.data && primaryControl.data.entity
      ? primaryControl.data.entity.getId()
      : null;
    openRuntime(id);
  }

  // Grid command-bar handler. Param: SelectedControlSelectedItemReferences.
  function openSelectedForm(selectedItemReferences) {
    if (!selectedItemReferences || selectedItemReferences.length === 0) {
      Xrm.Navigation.openAlertDialog({ text: "Select a form row first." });
      return;
    }
    openRuntime(selectedItemReferences[0].Id);
  }

  return {
    publishForm: publishForm,
    publishSelectedForm: publishSelectedForm,
    openForm: openForm,
    openSelectedForm: openSelectedForm
  };
})();
