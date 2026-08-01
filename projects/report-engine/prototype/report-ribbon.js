/*
 * Report Engine — ribbon integration.
 *
 * Puts a single "Reports" flyout on an entity's ribbon whose contents are built at click time from
 * qdb_reportribbonplacement, so adding a report to a table is a DATA change, not a solution change.
 * That property is the whole point: anything requiring a RibbonDiffXml edit per report would
 * contradict the metadata-driven thesis of the product. The ribbon is touched once per table.
 *
 * Two entry points, both referenced from RibbonDiffXml:
 *   populateReportFlyout  — PopulateQueryCommand handler; returns the menu via PopulationXML
 *   openReport            — the command every generated menu item shares
 *
 * SECURITY NOTE: filtering the menu is convenience, not enforcement. A user who never sees an item
 * can still invoke the report by other means; access is enforced in the qdb_RunReport plugin, which
 * runs as the calling user and writes the audit record. Do not treat a hidden item as a boundary.
 */
var QdbReportEngine = window.QdbReportEngine || {};

(function (namespace) {
  "use strict";

  var RUNTIME_WEB_RESOURCE = "qdb_reportengine_runtime.html";
  var BUTTON_ID_PREFIX = "qdb.report.";
  var OPEN_REPORT_COMMAND = "qdb.ReportEngine.Command.OpenReport";

  // qdb_placementtype option-set values, verified against the org.
  var PLACEMENT_TYPE = { entityForm: 100000000, entityGrid: 100000001, subgrid: 100000002 };

  function globalContext() {
    return Xrm.Utility.getGlobalContext();
  }

  /**
   * The ribbon's populate contract is synchronous — it reads PopulationXML the moment the handler
   * returns, so an async Xrm.WebApi call would always come back after the menu had been drawn.
   * A synchronous request is therefore deliberate here, not an oversight.
   */
  function requestJsonSync(relativeUrl) {
    var request = new XMLHttpRequest();
    request.open("GET", globalContext().getClientUrl() + relativeUrl, false);
    request.setRequestHeader("Accept", "application/json");
    request.setRequestHeader("OData-MaxVersion", "4.0");
    request.setRequestHeader("OData-Version", "4.0");
    request.send();
    if (request.status !== 200) {
      throw new Error("qdb_reportribbonplacement query failed: " + request.status + " " + request.responseText);
    }
    return JSON.parse(request.responseText);
  }

  function placementQuery(entityLogicalName, placementType) {
    return "/api/data/v9.2/qdb_reportribbonplacements"
      + "?$select=qdb_name,_qdb_reportdefinitionid_value"
      + "&$filter=qdb_entitylogicalname eq '" + encodeURIComponent(entityLogicalName) + "'"
      + " and qdb_isenabled eq true"
      + " and qdb_placementtype eq " + placementType
      + " and _qdb_reportdefinitionid_value ne null"
      + "&$orderby=qdb_name asc";
  }

  function readPlacements(entityLogicalName, placementType) {
    try {
      return requestJsonSync(placementQuery(entityLogicalName, placementType)).value || [];
    } catch (error) {
      // A broken query must not leave the user staring at a spinner — show an empty menu instead.
      console.error("[ReportEngine] could not load ribbon placements", error);
      return [];
    }
  }

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /* The report id rides in the button's own Id because every generated item shares one Command —
     the handler recovers it from CommandProperties.SourceControlId. */
  function buttonXml(placement, sequence) {
    var reportId = placement._qdb_reportdefinitionid_value;
    return '<Button Id="' + BUTTON_ID_PREFIX + reportId + '"'
      + ' Command="' + OPEN_REPORT_COMMAND + '"'
      + ' Sequence="' + sequence + '"'
      + ' LabelText="' + escapeXml(placement.qdb_name) + '"'
      + ' ToolTipTitle="' + escapeXml(placement.qdb_name) + '"'
      + ' ToolTipDescription="Run this report"'
      + ' TemplateAlias="o1" />';
  }

  /** An empty flyout reads as a bug, so say plainly that there is nothing rather than showing none. */
  function emptyMenuItemXml() {
    return '<Button Id="' + BUTTON_ID_PREFIX + 'none"'
      + ' Command="' + OPEN_REPORT_COMMAND + '"'
      + ' Sequence="10" LabelText="No reports available for this table"'
      + ' TemplateAlias="o1" />';
  }

  function buildPopulationXml(placements) {
    var controls = placements.length
      ? placements.map(function (placement, index) { return buttonXml(placement, (index + 1) * 10); }).join("")
      : emptyMenuItemXml();
    return '<Menu Id="qdb.ReportEngine.Menu">'
      + '<MenuSection Id="qdb.ReportEngine.MenuSection" Sequence="10" DisplayMode="Menu16">'
      + '<Controls Id="qdb.ReportEngine.Controls">' + controls + "</Controls>"
      + "</MenuSection></Menu>";
  }

  function populate(commandProperties, entityLogicalName, placementType) {
    commandProperties.PopulationXML = buildPopulationXml(readPlacements(entityLogicalName, placementType));
  }

  /** Form ribbon: the entity is known from the form's own context. */
  namespace.populateFormFlyout = function (commandProperties, primaryControl) {
    populate(commandProperties, primaryControl.data.entity.getEntityName(), PLACEMENT_TYPE.entityForm);
  };

  /** Home grid: SelectedEntityTypeName is supplied by the ribbon as a CrmParameter. */
  namespace.populateGridFlyout = function (commandProperties, selectedEntityTypeName) {
    populate(commandProperties, selectedEntityTypeName, PLACEMENT_TYPE.entityGrid);
  };

  namespace.populateSubgridFlyout = function (commandProperties, selectedEntityTypeName) {
    populate(commandProperties, selectedEntityTypeName, PLACEMENT_TYPE.subgrid);
  };

  /**
   * The flyout anchor's own command deliberately does nothing — opening the menu is the
   * PopulateQueryCommand's job. It exists because a CommandDefinition with an entirely empty
   * <Actions /> and no rules gives the Unified Interface command bar nothing to evaluate, and the
   * control is then dropped without any error.
   */
  namespace.noop = function () {};

  const GUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

  /**
   * Entry point for the MODERN command bar (an appaction row), which is what this org renders —
   * classic RibbonDiffXml custom actions compile into the ribbon and are never drawn.
   *
   * Each report gets its own menu item under the "Reports" dropdown, and each opens exactly that
   * one report. It deliberately does NOT open the catalogue: picking a report is the menu's job.
   *
   * The arguments are read positionally-independently on purpose. A command's JavaScript parameters
   * are declared by numeric type codes in appaction.onclickeventjavascriptparameters, and getting
   * that encoding wrong silently changes what arrives here. Finding the report id by shape rather
   * than by position means the handler keeps working whichever way the platform passes them.
   */
  namespace.openReportFromCommand = function (reportId, primaryControl) {
    if (typeof reportId !== "string" || !GUID_PATTERN.test(reportId.trim())) {
      console.error("[ReportEngine] first command parameter is not a report id", reportId);
      Xrm.Navigation.openErrorDialog({
        message: "This report command is not passing its report id. Re-run deploy-modern-command.mjs."
      });
      return;
    }
    openReportById(reportId.trim().replace(/[{}]/g, ""), primaryControl);
  };

  /** Opens one report in the runtime viewer, carrying whatever record context is available. */
  function openReportById(reportId, primaryControl) {
    const recordId = currentRecordId(primaryControl);
    const parameters = ["reportId=" + encodeURIComponent(reportId)];
    if (recordId) parameters.push("recordId=" + encodeURIComponent(recordId));

    Xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: RUNTIME_WEB_RESOURCE, data: parameters.join("&") },
      { target: 2, position: 1, width: { value: 90, unit: "%" }, height: { value: 90, unit: "%" } }
    ).catch(function (error) {
      Xrm.Navigation.openErrorDialog({ message: "Could not open the report: " + (error && error.message) });
    });
  }

  /** A form control reports its own table; a grid control reports the table it is bound to. */
  function entityNameFrom(primaryControl) {
    try {
      if (primaryControl && primaryControl.data && primaryControl.data.entity) {
        return primaryControl.data.entity.getEntityName();
      }
      if (primaryControl && typeof primaryControl.getEntityName === "function") {
        return primaryControl.getEntityName();
      }
    } catch (error) {
      console.error("[ReportEngine] could not resolve the table from the command context", error);
    }
    return null;
  }

  function reportIdFromControlId(sourceControlId) {
    var id = String(sourceControlId || "");
    return id.indexOf(BUTTON_ID_PREFIX) === 0 ? id.substring(BUTTON_ID_PREFIX.length) : null;
  }

  function currentRecordId(primaryControl) {
    try {
      var id = primaryControl && primaryControl.data && primaryControl.data.entity.getId();
      return id ? id.replace(/[{}]/g, "") : null;
    } catch (error) {
      return null;
    }
  }

  function viewerUrl(reportId, recordId, selectedIds) {
    var parameters = ["reportId=" + encodeURIComponent(reportId)];
    if (recordId) parameters.push("recordId=" + encodeURIComponent(recordId));
    if (selectedIds && selectedIds.length) {
      parameters.push("selectedIds=" + encodeURIComponent(selectedIds.join(",")));
    }
    return "/WebResources/" + RUNTIME_WEB_RESOURCE + "?" + parameters.join("&");
  }

  /**
   * Opens the runtime viewer for the clicked report, carrying whatever context this ribbon location
   * can supply — the record on a form, the ticked rows on a grid.
   */
  namespace.openReport = function (commandProperties, primaryControl, selectedControlSelectedItemIds) {
    var reportId = reportIdFromControlId(commandProperties && commandProperties.SourceControlId);
    if (!reportId) return;

    Xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: RUNTIME_WEB_RESOURCE,
        data: viewerUrl(reportId, currentRecordId(primaryControl), selectedControlSelectedItemIds).split("?")[1] },
      { target: 2, position: 1, width: { value: 90, unit: "%" }, height: { value: 90, unit: "%" } }
    ).catch(function (error) {
      Xrm.Navigation.openErrorDialog({ message: "Could not open the report: " + (error && error.message) });
    });
  };
})(QdbReportEngine);
