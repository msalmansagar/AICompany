/**
 * formIntegration.js  v2
 * Invoice Entry Grid — Data Service Layer
 * Compatible: CRM On-Prem v9.1 (IE Mode / XMLHttpRequest), UCI, Dataverse
 *
 * Modules:
 *   InvoiceGrid.Config            — entity/field logical names (one source of truth)
 *   InvoiceGrid.CrmApi            — XHR wrapper (GET / POST / PATCH)
 *   InvoiceGrid.InvoiceDataService — save orchestration for multiple invoices
 *
 * No arrow functions. No template literals. No const/let outside IIFE. IE 11 safe.
 */

var InvoiceGrid = InvoiceGrid || {};

/* ════════════════════════════════════════════════════════════════════════════
   Config — change ONLY this block when entity/field names change.
   ════════════════════════════════════════════════════════════════════════════ */

InvoiceGrid.Config = {

    apiVersion: 'v9.1',

    /** Parent: qdb_payment_authorization_ticket */
    parent: {
        entitySetName:           'qdb_payment_authorization_tickets',
        entityLogicalName:       'qdb_payment_authorization_ticket',
        fieldGuidList:           'qdb_projectotherfacilitybursementguid',
        fieldInvoiceAmount:      'qdb_invoice_amount',
        fieldDisbursementAmount: 'qdb_disbursement_amount'
    },

    /** Invoice Header: qdb_other_facility_disbursement_details */
    invoiceHeader: {
        entitySetName:           'qdb_other_facility_disbursement_detailses',
        entityLogicalName:       'qdb_other_facility_disbursement_details',
        primaryIdField:          'qdb_other_facility_disbursement_detailsid',
        fieldInvoiceNo:          'qdb_invoice_no',
        fieldInvoiceDate:        'qdb_invoicedate',
        fieldInvoiceAmount:      'qdb_invoice_amount',
        fieldDisbursementAmount: 'qdb_disbursement_amount'
    },

    /** Invoice Line: db_disbursementinvoiceproducts */
    invoiceLine: {
        entitySetName:     'db_disbursementinvoiceproductses',
        entityLogicalName: 'db_disbursementinvoiceproducts',
        fieldInvoice:      'qdb_disbursementinvoice',
        fieldRequest:      'qdb_disbursementrequest',
        fieldHsCode:       'qdb_hscode',
        fieldDescription:  'qdb_goodsdescription',
        fieldQuantity:     'qdb_totalquantity',
        fieldUom:          'qdb_unitofmeasurement',
        fieldUnitPrice:    'qdb_unitprice'
    },

    /** HS Code master: qdb_hscodemaster */
    hsCode: {
        entitySetName:    'qdb_hscodemasters',
        entityLogicalName:'qdb_hscodemaster',
        primaryIdField:   'qdb_hscodemasterid',
        fieldName:        'qdb_name',
        fieldDescription: 'qdb_description'
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   CrmApi — thin XHR wrapper over /api/data/v9.1
   ════════════════════════════════════════════════════════════════════════════ */

InvoiceGrid.CrmApi = (function (Config) {
    'use strict';

    /**
     * Resolves the CRM server base URL.
     * Checks self Xrm, then parent Xrm, then falls back to window.location.origin.
     * @returns {string}
     */
    function resolveBaseUrl() {
        var clientUrl = '';

        try {
            if (typeof Xrm !== 'undefined' &&
                Xrm.Utility && Xrm.Utility.getGlobalContext) {
                clientUrl = Xrm.Utility.getGlobalContext().getClientUrl();
            } else if (window.parent &&
                       typeof window.parent.Xrm !== 'undefined' &&
                       window.parent.Xrm.Utility &&
                       window.parent.Xrm.Utility.getGlobalContext) {
                clientUrl = window.parent.Xrm.Utility.getGlobalContext().getClientUrl();
            }
        } catch (ignore) { /* outside CRM context */ }

        return (clientUrl || window.location.origin).replace(/\/$/, '');
    }

    /**
     * Builds the full OData endpoint URL.
     * @param {string} entitySetOrPath  Entity set name or absolute path segment
     * @returns {string}
     */
    function buildUrl(entitySetOrPath) {
        return resolveBaseUrl() + '/api/data/' + Config.apiVersion + '/' + entitySetOrPath;
    }

    /**
     * Builds standard OData 4.0 request headers.
     * @returns {Object}
     */
    function buildHeaders() {
        return {
            'Accept':           'application/json',
            'Content-Type':     'application/json; charset=utf-8',
            'OData-MaxVersion': '4.0',
            'OData-Version':    '4.0'
        };
    }

    /**
     * Executes an async XMLHttpRequest.
     * @param {string}   method
     * @param {string}   url
     * @param {Object}   headers
     * @param {Object}   body     Serialisable object or null
     * @param {Function} onSuccess Called with (parsedResponse, xhr)
     * @param {Function} onFailure Called with (statusCode, errorMessage)
     */
    function executeXhr(method, url, headers, body, onSuccess, onFailure) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);

        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) {
            xhr.setRequestHeader(keys[i], headers[keys[i]]);
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) { return; }

            if (xhr.status >= 200 && xhr.status < 300) {
                var result = null;
                if (xhr.responseText && xhr.responseText.length > 0) {
                    try { result = JSON.parse(xhr.responseText); }
                    catch (parseErr) { result = { rawText: xhr.responseText }; }
                }
                onSuccess(result, xhr);
            } else {
                onFailure(xhr.status, extractErrorMessage(xhr));
            }
        };

        xhr.send(body ? JSON.stringify(body) : null);
    }

    /**
     * Extracts a human-readable error string from a failed XHR response.
     * @param {XMLHttpRequest} xhr
     * @returns {string}
     */
    function extractErrorMessage(xhr) {
        var message = 'HTTP ' + xhr.status + ' ' + xhr.statusText;
        if (xhr.responseText) {
            try {
                var errBody = JSON.parse(xhr.responseText);
                if (errBody && errBody.error && errBody.error.message) {
                    message = errBody.error.message;
                }
            } catch (ignore) { /* use default */ }
        }
        return message;
    }

    /**
     * Extracts a newly created record GUID from the OData-EntityId header.
     * @param {XMLHttpRequest} xhr
     * @returns {string|null}
     */
    function extractCreatedId(xhr) {
        var entityId = xhr.getResponseHeader('OData-EntityId');
        if (!entityId) { return null; }
        var match = entityId.match(/\(([0-9a-f\-]{36})\)/i);
        return match ? match[1] : null;
    }

    /* ── Public ──────────────────────────────────────────────────────────── */

    /**
     * GET records from an entity set.
     * @param {string}   entitySetPath   Set name + optional OData query
     * @param {Function} onSuccess       Called with parsed response object
     * @param {Function} onFailure       Called with (statusCode, message)
     */
    function getRecords(entitySetPath, onSuccess, onFailure) {
        var headers = buildHeaders();
        executeXhr('GET', buildUrl(entitySetPath), headers, null, onSuccess, onFailure);
    }

    /**
     * POST — create a new record.
     * @param {string}   entitySet
     * @param {Object}   body
     * @param {Function} onSuccess  Called with (createdId: string, responseBody)
     * @param {Function} onFailure  Called with (statusCode, message)
     */
    function createRecord(entitySet, body, onSuccess, onFailure) {
        var headers = buildHeaders();
        headers['Prefer'] = 'return=representation';

        executeXhr('POST', buildUrl(entitySet), headers, body, function (response, xhr) {
            var id = extractCreatedId(xhr);
            onSuccess(id, response);
        }, onFailure);
    }

    /**
     * PATCH — update an existing record.
     * @param {string}   entitySet
     * @param {string}   recordId
     * @param {Object}   body
     * @param {Function} onSuccess  Called with no arguments on 204
     * @param {Function} onFailure  Called with (statusCode, message)
     */
    function updateRecord(entitySet, recordId, body, onSuccess, onFailure) {
        var headers = buildHeaders();
        headers['If-Match'] = '*';

        var url = buildUrl(entitySet + '(' + recordId + ')');
        executeXhr('PATCH', url, headers, body, function () { onSuccess(); }, onFailure);
    }

    return {
        getRecords:   getRecords,
        createRecord: createRecord,
        updateRecord: updateRecord
    };

}(InvoiceGrid.Config));

/* ════════════════════════════════════════════════════════════════════════════
   InvoiceDataService — orchestrates the full multi-invoice save flow

   Save sequence for each invoice (sequential, not parallel):
     1. Create Invoice Header  → get headerId
     2. Create Line Items       → sequential XHR per line
     3. After ALL invoices saved → PATCH Parent:
          a. Append all header GUIDs to comma-separated list field
          b. Set summed invoice + disbursement amounts

   Callback convention: onComplete(success: bool, errorMessage: string|null)
   ════════════════════════════════════════════════════════════════════════════ */

InvoiceGrid.InvoiceDataService = (function (Config, Api) {
    'use strict';

    /* ── Public entry point ───────────────────────────────────────────────── */

    /**
     * Saves multiple invoices and updates the parent record.
     * @param {Array}    allInvoicesData  Array of invoice payload objects
     * @param {string}   parentId         GUID of qdb_payment_authorization_ticket
     * @param {Function} onComplete       Called with (success, errorMessage|null)
     */
    function saveAllInvoices(allInvoicesData, parentId, onComplete) {
        if (!allInvoicesData || allInvoicesData.length === 0) {
            onComplete(true, null);
            return;
        }

        var context = {
            savedHeaderIds:          [],
            totalInvoiceAmount:      0,
            totalDisbursementAmount: 0
        };

        saveNextInvoice(allInvoicesData, 0, parentId, context, function (invoiceError) {
            if (invoiceError) {
                onComplete(false, invoiceError);
                return;
            }

            updateParentWithAllInvoices(parentId, context, function (parentError) {
                onComplete(!parentError, parentError || null);
            });
        });
    }

    /**
     * Searches HS Code master records by partial name match.
     * Returns up to 10 results ordered by name.
     * @param {string}   searchTerm
     * @param {Function} callback    Called with (results: Array, errorMessage|null)
     */
    function searchHsCodes(searchTerm, callback) {
        var escaped = searchTerm.replace(/'/g, "''");
        var path    = Config.hsCode.entitySetName +
                      '?$select=' + Config.hsCode.fieldName + ',' + Config.hsCode.fieldDescription +
                      '&$filter=contains(' + Config.hsCode.fieldName + ',\'' + escaped + '\')' +
                      '&$top=10' +
                      '&$orderby=' + Config.hsCode.fieldName + ' asc';

        Api.getRecords(path,
            function (response) {
                var results = (response && response.value) ? response.value : [];
                callback(results, null);
            },
            function (status, message) {
                callback([], message);
            }
        );
    }

    return {
        saveAllInvoices: saveAllInvoices,
        searchHsCodes:   searchHsCodes
    };

    /* ── Private ──────────────────────────────────────────────────────────── */

    /**
     * Recursively saves one invoice at a time from the array.
     * @param {Array}    invoicesData
     * @param {number}   index
     * @param {string}   parentId
     * @param {Object}   context     Accumulates savedHeaderIds and totals
     * @param {Function} callback    Called with (errorMessage|null) when done
     */
    function saveNextInvoice(invoicesData, index, parentId, context, callback) {
        if (index >= invoicesData.length) {
            callback(null);
            return;
        }

        var invoiceData = invoicesData[index];

        createInvoiceHeader(invoiceData, function (headerId, headerError) {
            if (headerError) {
                callback('Invoice ' + (index + 1) + ' header: ' + headerError);
                return;
            }

            context.savedHeaderIds.push(headerId);
            context.totalInvoiceAmount      += invoiceData.invoiceAmount      || 0;
            context.totalDisbursementAmount += invoiceData.disbursementAmount || 0;

            saveLineItems(invoiceData.lines, headerId, parentId, function (linesError) {
                if (linesError) {
                    callback('Invoice ' + (index + 1) + ' lines: ' + linesError);
                    return;
                }

                saveNextInvoice(invoicesData, index + 1, parentId, context, callback);
            });
        });
    }

    /**
     * Creates the qdb_other_facility_disbursement_details record.
     * @param {Object}   invoiceData
     * @param {Function} callback    Called with (headerId|null, errorMessage|null)
     */
    function createInvoiceHeader(invoiceData, callback) {
        var body = {};
        body[Config.invoiceHeader.fieldInvoiceNo]          = invoiceData.invoiceNo;
        body[Config.invoiceHeader.fieldInvoiceDate]        = invoiceData.invoiceDate;
        body[Config.invoiceHeader.fieldInvoiceAmount]      = invoiceData.invoiceAmount;
        body[Config.invoiceHeader.fieldDisbursementAmount] = invoiceData.disbursementAmount;

        Api.createRecord(
            Config.invoiceHeader.entitySetName,
            body,
            function (headerId) {
                if (!headerId) { callback(null, 'Created but no ID returned.'); return; }
                callback(headerId, null);
            },
            function (status, message) { callback(null, message); }
        );
    }

    /**
     * Saves line items sequentially (one XHR per line).
     * @param {Array}    lines
     * @param {string}   headerId
     * @param {string}   parentId
     * @param {Function} callback  Called with (errorMessage|null)
     */
    function saveLineItems(lines, headerId, parentId, callback) {
        if (!lines || lines.length === 0) { callback(null); return; }
        saveNextLine(lines, 0, headerId, parentId, callback);
    }

    /**
     * Recursive helper — creates lines one at a time.
     */
    function saveNextLine(lines, index, headerId, parentId, callback) {
        if (index >= lines.length) { callback(null); return; }

        var body = buildLineBody(lines[index], headerId, parentId);

        Api.createRecord(
            Config.invoiceLine.entitySetName,
            body,
            function () { saveNextLine(lines, index + 1, headerId, parentId, callback); },
            function (status, message) { callback('Line ' + (index + 1) + ': ' + message); }
        );
    }

    /**
     * Builds the OData POST body for a single invoice line.
     * All lookups use @odata.bind syntax.
     * @param {Object} line
     * @param {string} headerId
     * @param {string} parentId
     * @returns {Object}
     */
    function buildLineBody(line, headerId, parentId) {
        var body = {};

        body[Config.invoiceLine.fieldInvoice + '@odata.bind'] =
            '/' + Config.invoiceHeader.entitySetName + '(' + headerId + ')';

        body[Config.invoiceLine.fieldRequest + '@odata.bind'] =
            '/' + Config.parent.entitySetName + '(' + parentId + ')';

        if (line.hsCodeId) {
            body[Config.invoiceLine.fieldHsCode + '@odata.bind'] =
                '/' + Config.hsCode.entitySetName + '(' + line.hsCodeId + ')';
        }

        body[Config.invoiceLine.fieldDescription] = line.description || '';
        body[Config.invoiceLine.fieldQuantity]     = line.quantity    || 0;
        body[Config.invoiceLine.fieldUom]          = line.uom         || '';
        body[Config.invoiceLine.fieldUnitPrice]    = line.unitPrice   || 0;

        return body;
    }

    /**
     * PATCHes the parent record: appends all new header GUIDs and pushes totals.
     * @param {string}   parentId
     * @param {Object}   context   { savedHeaderIds, totalInvoiceAmount, totalDisbursementAmount }
     * @param {Function} callback  Called with (errorMessage|null)
     */
    function updateParentWithAllInvoices(parentId, context, callback) {
        var path = Config.parent.entitySetName + '(' + parentId + ')' +
                   '?$select=' + Config.parent.fieldGuidList;

        Api.getRecords(path,
            function (response) {
                var currentList = (response && response[Config.parent.fieldGuidList]) || '';
                var updatedList = appendGuidsToList(currentList, context.savedHeaderIds);

                var body = {};
                body[Config.parent.fieldGuidList]           = updatedList;
                body[Config.parent.fieldInvoiceAmount]      = context.totalInvoiceAmount;
                body[Config.parent.fieldDisbursementAmount] = context.totalDisbursementAmount;

                Api.updateRecord(
                    Config.parent.entitySetName,
                    parentId,
                    body,
                    function () { callback(null); },
                    function (status, message) { callback(message); }
                );
            },
            function () {
                /* Non-fatal: proceed with empty current list */
                var updatedList = appendGuidsToList('', context.savedHeaderIds);

                var body = {};
                body[Config.parent.fieldGuidList]           = updatedList;
                body[Config.parent.fieldInvoiceAmount]      = context.totalInvoiceAmount;
                body[Config.parent.fieldDisbursementAmount] = context.totalDisbursementAmount;

                Api.updateRecord(
                    Config.parent.entitySetName,
                    parentId,
                    body,
                    function () { callback(null); },
                    function (status, message) { callback(message); }
                );
            }
        );
    }

    /**
     * Appends an array of GUIDs to a comma-separated list, avoiding duplicates.
     * @param {string}   currentList
     * @param {Array}    newGuids
     * @returns {string}
     */
    function appendGuidsToList(currentList, newGuids) {
        var existing = currentList && currentList.trim()
            ? currentList.split(',')
            : [];

        var seen = {};
        for (var i = 0; i < existing.length; i++) {
            seen[existing[i].trim().toLowerCase()] = true;
        }

        for (var j = 0; j < newGuids.length; j++) {
            var guid = (newGuids[j] || '').trim();
            if (guid && !seen[guid.toLowerCase()]) {
                existing.push(guid);
                seen[guid.toLowerCase()] = true;
            }
        }

        return existing.join(',');
    }

}(InvoiceGrid.Config, InvoiceGrid.CrmApi));
