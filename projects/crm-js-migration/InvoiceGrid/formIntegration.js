/**
 * formIntegration.js
 * Invoice Entry Grid — Data Service Layer
 * Compatible: CRM On-Prem v9.1 (IE Mode / XMLHttpRequest), UCI, Dataverse
 *
 * Responsibilities:
 *   1. Config — all entity/field logical names in one place
 *   2. CrmApi — thin XHR wrapper (GET / POST / PATCH) over /api/data/v9.1
 *   3. InvoiceDataService — save orchestration:
 *        Create Header → Create Lines → Update Parent (append GUID, push totals)
 *
 * No arrow functions. No template literals. No CSS variables.
 * IE 11 (Edge IE Mode) compatible.
 */

/* ── Namespace guard ──────────────────────────────────────────────────────── */

var InvoiceGrid = InvoiceGrid || {};

/* ── Config ────────────────────────────────────────────────────────────────
 * Change ONLY this block when entity/field names change.
 * All other modules reference Config — never hard-code names elsewhere.
 * ─────────────────────────────────────────────────────────────────────────── */

InvoiceGrid.Config = {

    /* OData API version */
    apiVersion: 'v9.1',

    /* Parent record: qdb_payment_authorization_ticket */
    parent: {
        entitySetName:           'qdb_payment_authorization_tickets',
        entityLogicalName:       'qdb_payment_authorization_ticket',
        fieldGuidList:           'qdb_projectotherfacilitybursementguid',
        fieldInvoiceAmount:      'qdb_invoice_amount',
        fieldDisbursementAmount: 'qdb_disbursement_amount'
    },

    /* Invoice Header: qdb_other_facility_disbursement_details */
    invoiceHeader: {
        entitySetName:           'qdb_other_facility_disbursement_detailses',
        entityLogicalName:       'qdb_other_facility_disbursement_details',
        fieldInvoiceNo:          'qdb_invoice_no',
        fieldInvoiceDate:        'qdb_invoicedate',
        fieldInvoiceAmount:      'qdb_invoice_amount',
        fieldDisbursementAmount: 'qdb_disbursement_amount'
    },

    /* Invoice Line: db_disbursementinvoiceproducts */
    invoiceLine: {
        entitySetName:     'db_disbursementinvoiceproductses',
        entityLogicalName: 'db_disbursementinvoiceproducts',
        fieldInvoice:      'qdb_disbursementinvoice',           /* lookup to header */
        fieldRequest:      'qdb_disbursementrequest',           /* lookup to parent */
        fieldHsCode:       'qdb_hscode',                        /* lookup to HS Code master */
        fieldDescription:  'qdb_goodsdescription',
        fieldQuantity:     'qdb_totalquantity',
        fieldUom:          'qdb_unitofmeasurement',
        fieldUnitPrice:    'qdb_unitprice'
    },

    /* HS Code master: qdb_hscodemaster */
    hsCode: {
        entitySetName:     'qdb_hscodemastersers',
        entityLogicalName: 'qdb_hscodemaster',
        fieldName:         'qdb_name',
        fieldDescription:  'qdb_description'
    }
};

/* ── CrmApi ────────────────────────────────────────────────────────────────
 * Minimal XHR wrapper over the WebApi OData endpoint.
 * Uses synchronous-style callbacks to remain IE-compatible.
 * All public methods: get(url, success, failure)
 *                     post(entitySet, body, success, failure)
 *                     patch(entitySet, id, body, success, failure)
 * ─────────────────────────────────────────────────────────────────────────── */

InvoiceGrid.CrmApi = (function (Config) {
    'use strict';

    /**
     * Resolves the base OData URL from the CRM context.
     * Falls back gracefully when running outside CRM (e.g. browser preview).
     * @returns {string} Base URL ending without trailing slash
     */
    function resolveBaseUrl() {
        var clientUrl = '';

        if (typeof Xrm !== 'undefined' &&
            Xrm.Utility &&
            Xrm.Utility.getGlobalContext) {

            clientUrl = Xrm.Utility.getGlobalContext().getClientUrl();

        } else if (window.parent &&
                   typeof window.parent.Xrm !== 'undefined' &&
                   window.parent.Xrm.Utility &&
                   window.parent.Xrm.Utility.getGlobalContext) {

            clientUrl = window.parent.Xrm.Utility.getGlobalContext().getClientUrl();

        } else {
            /* Development fallback — update to your on-prem server */
            clientUrl = window.location.origin;
        }

        return clientUrl.replace(/\/$/, '');
    }

    /**
     * Builds the full OData endpoint URL for an entity set.
     * @param {string} entitySet
     * @returns {string}
     */
    function buildEntityUrl(entitySet) {
        return resolveBaseUrl() + '/api/data/' + Config.apiVersion + '/' + entitySet;
    }

    /**
     * Builds standard OData request headers.
     * @returns {Object} Header key-value map
     */
    function buildHeaders() {
        return {
            'Accept':          'application/json',
            'Content-Type':    'application/json; charset=utf-8',
            'OData-MaxVersion': '4.0',
            'OData-Version':   '4.0'
        };
    }

    /**
     * Executes an XHR request.
     * @param {string}   method    HTTP verb
     * @param {string}   url       Full request URL
     * @param {Object}   headers   Request headers
     * @param {string}   body      JSON body (null for GET)
     * @param {Function} onSuccess Called with (responseObject)
     * @param {Function} onFailure Called with (statusCode, errorMessage)
     */
    function executeXhr(method, url, headers, body, onSuccess, onFailure) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);

        var headerKeys = Object.keys(headers);
        for (var i = 0; i < headerKeys.length; i++) {
            xhr.setRequestHeader(headerKeys[i], headers[headerKeys[i]]);
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) { return; }

            if (xhr.status >= 200 && xhr.status < 300) {
                var response = null;
                if (xhr.responseText && xhr.responseText.length > 0) {
                    try {
                        response = JSON.parse(xhr.responseText);
                    } catch (parseError) {
                        response = { rawText: xhr.responseText };
                    }
                }
                onSuccess(response, xhr);
            } else {
                var errorMessage = buildErrorMessage(xhr);
                onFailure(xhr.status, errorMessage);
            }
        };

        xhr.send(body ? JSON.stringify(body) : null);
    }

    /**
     * Extracts a human-readable error message from a failed XHR response.
     * @param {XMLHttpRequest} xhr
     * @returns {string}
     */
    function buildErrorMessage(xhr) {
        var message = 'HTTP ' + xhr.status + ': ' + xhr.statusText;
        if (xhr.responseText) {
            try {
                var errBody = JSON.parse(xhr.responseText);
                if (errBody.error && errBody.error.message) {
                    message = errBody.error.message;
                }
            } catch (ignore) { /* use default message */ }
        }
        return message;
    }

    /**
     * Extracts a record GUID from the OData-EntityId response header.
     * Returns null when the header is absent (PATCH responses).
     * @param {XMLHttpRequest} xhr
     * @returns {string|null}
     */
    function extractCreatedId(xhr) {
        var entityId = xhr.getResponseHeader('OData-EntityId');
        if (!entityId) { return null; }
        var match = entityId.match(/\(([0-9a-f\-]{36})\)/i);
        return match ? match[1] : null;
    }

    /* ── Public API ─────────────────────────────────────────────────────── */

    /**
     * GET records from an entity set with an OData query string.
     * @param {string}   entitySet   Plural entity set name
     * @param {string}   query       OData query string (e.g. "?$select=name&$filter=...")
     * @param {Function} onSuccess   Called with parsed response object
     * @param {Function} onFailure   Called with (statusCode, errorMessage)
     */
    function getRecords(entitySet, query, onSuccess, onFailure) {
        var url     = buildEntityUrl(entitySet) + (query || '');
        var headers = buildHeaders();

        executeXhr('GET', url, headers, null, onSuccess, onFailure);
    }

    /**
     * POST (create) a new record.
     * @param {string}   entitySet   Plural entity set name
     * @param {Object}   body        Field values to set
     * @param {Function} onSuccess   Called with (createdId: string)
     * @param {Function} onFailure   Called with (statusCode, errorMessage)
     */
    function createRecord(entitySet, body, onSuccess, onFailure) {
        var url     = buildEntityUrl(entitySet);
        var headers = buildHeaders();
        headers['Prefer'] = 'return=representation';

        executeXhr('POST', url, headers, body, function (response, xhr) {
            var createdId = extractCreatedId(xhr);
            if (!createdId && response && response[entitySet.slice(0, -1) + 'id']) {
                /* fallback: some versions return the id in the body */
                createdId = response[entitySet.slice(0, -1) + 'id'];
            }
            onSuccess(createdId, response);
        }, onFailure);
    }

    /**
     * PATCH (update) an existing record.
     * @param {string}   entitySet   Plural entity set name
     * @param {string}   recordId    GUID of the record to update
     * @param {Object}   body        Fields to update
     * @param {Function} onSuccess   Called with no arguments on 204
     * @param {Function} onFailure   Called with (statusCode, errorMessage)
     */
    function updateRecord(entitySet, recordId, body, onSuccess, onFailure) {
        var url     = buildEntityUrl(entitySet) + '(' + recordId + ')';
        var headers = buildHeaders();
        headers['If-Match'] = '*';

        executeXhr('PATCH', url, headers, body, function () {
            onSuccess();
        }, onFailure);
    }

    return {
        getRecords:    getRecords,
        createRecord:  createRecord,
        updateRecord:  updateRecord
    };

}(InvoiceGrid.Config));

/* ── InvoiceDataService ────────────────────────────────────────────────────
 * Orchestrates the full save flow:
 *   1. Create Invoice Header
 *   2. Create each Invoice Line (sequential, one XHR per line)
 *   3. PATCH Parent: append header GUID to comma-separated field
 *   4. PATCH Parent: push Invoice Amount + Disbursement Amount
 *
 * Callback convention: onComplete(success: bool, errorMessage: string|null)
 * ─────────────────────────────────────────────────────────────────────────── */

InvoiceGrid.InvoiceDataService = (function (Config, Api) {
    'use strict';

    /**
     * Saves a complete invoice (header + lines) and updates the parent record.
     *
     * @param {Object}   invoiceData           Invoice payload from the UI
     * @param {string}   invoiceData.invoiceNo
     * @param {string}   invoiceData.invoiceDate   ISO date string
     * @param {number}   invoiceData.invoiceAmount
     * @param {number}   invoiceData.disbursementAmount
     * @param {Array}    invoiceData.lines         Array of line objects
     * @param {string}   parentId              GUID of qdb_payment_authorization_ticket
     * @param {Function} onComplete            Called with (success, errorMessage)
     */
    function saveInvoice(invoiceData, parentId, onComplete) {
        createInvoiceHeader(invoiceData, parentId, function (headerId, createHeaderError) {
            if (createHeaderError) {
                onComplete(false, 'Failed to create invoice header: ' + createHeaderError);
                return;
            }

            saveLineItems(invoiceData.lines, headerId, parentId, function (linesError) {
                if (linesError) {
                    onComplete(false, 'Lines saved partially. Error: ' + linesError);
                    return;
                }

                updateParentRecord(parentId, headerId, invoiceData, function (parentError) {
                    if (parentError) {
                        onComplete(false, 'Invoice saved but parent update failed: ' + parentError);
                        return;
                    }

                    onComplete(true, null);
                });
            });
        });
    }

    /**
     * Creates the qdb_other_facility_disbursement_details record.
     * @param {Object}   invoiceData
     * @param {string}   parentId
     * @param {Function} callback   Called with (headerId|null, errorMessage|null)
     */
    function createInvoiceHeader(invoiceData, parentId, callback) {
        var body = {};
        body[Config.invoiceHeader.fieldInvoiceNo]          = invoiceData.invoiceNo;
        body[Config.invoiceHeader.fieldInvoiceDate]        = invoiceData.invoiceDate;
        body[Config.invoiceHeader.fieldInvoiceAmount]      = invoiceData.invoiceAmount;
        body[Config.invoiceHeader.fieldDisbursementAmount] = invoiceData.disbursementAmount;

        Api.createRecord(
            Config.invoiceHeader.entitySetName,
            body,
            function (headerId) {
                if (!headerId) {
                    callback(null, 'Header created but no ID was returned.');
                    return;
                }
                callback(headerId, null);
            },
            function (status, message) {
                callback(null, message);
            }
        );
    }

    /**
     * Sequentially creates each invoice line record.
     * Sequential (not parallel) to respect CRM transaction limits.
     * @param {Array}    lines      Array of line data objects
     * @param {string}   headerId   GUID of the created invoice header
     * @param {string}   parentId   GUID of the parent ticket
     * @param {Function} callback   Called with (errorMessage|null)
     */
    function saveLineItems(lines, headerId, parentId, callback) {
        if (!lines || lines.length === 0) {
            callback(null);
            return;
        }

        saveNextLine(lines, 0, headerId, parentId, callback);
    }

    /**
     * Recursive helper that saves lines one at a time.
     * @param {Array}    lines
     * @param {number}   index      Current line index
     * @param {string}   headerId
     * @param {string}   parentId
     * @param {Function} callback
     */
    function saveNextLine(lines, index, headerId, parentId, callback) {
        if (index >= lines.length) {
            callback(null);
            return;
        }

        var line = lines[index];
        var body = buildLineBody(line, headerId, parentId);

        Api.createRecord(
            Config.invoiceLine.entitySetName,
            body,
            function () {
                saveNextLine(lines, index + 1, headerId, parentId, callback);
            },
            function (status, message) {
                callback('Line ' + (index + 1) + ': ' + message);
            }
        );
    }

    /**
     * Builds the OData body for a single invoice line record.
     * @param {Object} line      Line data from UI
     * @param {string} headerId  GUID of invoice header
     * @param {string} parentId  GUID of parent ticket
     * @returns {Object} OData-compatible body
     */
    function buildLineBody(line, headerId, parentId) {
        var body = {};

        /* Lookup fields use @odata.bind syntax */
        body[Config.invoiceLine.fieldInvoice + '@odata.bind'] =
            '/' + Config.invoiceHeader.entitySetName + '(' + headerId + ')';

        body[Config.invoiceLine.fieldRequest + '@odata.bind'] =
            '/' + Config.parent.entitySetName + '(' + parentId + ')';

        if (line.hsCodeId) {
            body[Config.invoiceLine.fieldHsCode + '@odata.bind'] =
                '/' + Config.hsCode.entitySetName + '(' + line.hsCodeId + ')';
        }

        body[Config.invoiceLine.fieldDescription] = line.description  || '';
        body[Config.invoiceLine.fieldQuantity]     = line.quantity     || 0;
        body[Config.invoiceLine.fieldUom]          = line.uom          || '';
        body[Config.invoiceLine.fieldUnitPrice]     = line.unitPrice    || 0;

        return body;
    }

    /**
     * PATCHes the parent qdb_payment_authorization_ticket:
     *   - Appends the new header GUID to the comma-separated GUID list field
     *   - Pushes updated invoice and disbursement amounts
     *
     * @param {string}   parentId
     * @param {string}   headerId
     * @param {Object}   invoiceData
     * @param {Function} callback   Called with (errorMessage|null)
     */
    function updateParentRecord(parentId, headerId, invoiceData, callback) {
        fetchCurrentGuidList(parentId, function (currentList, fetchError) {
            if (fetchError) {
                callback(fetchError);
                return;
            }

            var updatedList = appendGuidToList(currentList, headerId);
            var parentBody  = buildParentUpdateBody(updatedList, invoiceData);

            Api.updateRecord(
                Config.parent.entitySetName,
                parentId,
                parentBody,
                function () { callback(null); },
                function (status, message) { callback(message); }
            );
        });
    }

    /**
     * Fetches the current value of the GUID list field on the parent record.
     * @param {string}   parentId
     * @param {Function} callback  Called with (currentList: string, error: string|null)
     */
    function fetchCurrentGuidList(parentId, callback) {
        var query = '?$select=' + Config.parent.fieldGuidList;

        Api.getRecords(
            Config.parent.entitySetName + '(' + parentId + ')',
            query,
            function (response) {
                var currentList = (response && response[Config.parent.fieldGuidList]) || '';
                callback(currentList, null);
            },
            function (status, message) {
                /* Non-fatal: proceed with empty list if read fails */
                callback('', message);
            }
        );
    }

    /**
     * Appends a GUID to a comma-separated GUID list string.
     * Avoids duplicates.
     * @param {string} currentList  Existing comma-separated GUIDs
     * @param {string} newGuid      GUID to append
     * @returns {string}
     */
    function appendGuidToList(currentList, newGuid) {
        if (!currentList || currentList.trim().length === 0) {
            return newGuid;
        }

        var existing = currentList.split(',');
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].trim().toLowerCase() === newGuid.toLowerCase()) {
                return currentList;
            }
        }

        return currentList + ',' + newGuid;
    }

    /**
     * Builds the PATCH body for the parent record update.
     * @param {string} updatedGuidList
     * @param {Object} invoiceData
     * @returns {Object}
     */
    function buildParentUpdateBody(updatedGuidList, invoiceData) {
        var body = {};
        body[Config.parent.fieldGuidList]           = updatedGuidList;
        body[Config.parent.fieldInvoiceAmount]      = invoiceData.invoiceAmount;
        body[Config.parent.fieldDisbursementAmount] = invoiceData.disbursementAmount;
        return body;
    }

    /**
     * Searches HS Code master records by partial name.
     * Returns up to 10 results.
     * @param {string}   searchTerm  Partial HS code or description
     * @param {Function} callback    Called with (results: Array, errorMessage|null)
     */
    function searchHsCodes(searchTerm, callback) {
        var escaped = searchTerm.replace(/'/g, "''");
        var query   = '?$select=' +
                      Config.hsCode.fieldName + ',' +
                      Config.hsCode.fieldDescription +
                      '&$filter=contains(' + Config.hsCode.fieldName + ',\'' + escaped + '\')' +
                      '&$top=10&$orderby=' + Config.hsCode.fieldName + ' asc';

        Api.getRecords(
            Config.hsCode.entitySetName,
            query,
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
        saveInvoice:   saveInvoice,
        searchHsCodes: searchHsCodes
    };

}(InvoiceGrid.Config, InvoiceGrid.CrmApi));
