/**
 * invoiceGrid.js
 * Invoice Entry Grid — UI Controller
 * Compatible: CRM On-Prem v9.1 (IE Mode / Edge Chromium), UCI, Dataverse
 *
 * Responsibilities:
 *   1. Boot: read URL params, apply design mode, register events
 *   2. Row management: add / delete / renumber rows from #rowTemplate
 *   3. HS Code autocomplete: debounced search, keyboard navigation
 *   4. Calculation: line total = qty × unitPrice; grand total footer
 *   5. Validation: Invoice No, Invoice Date, at least one line item
 *   6. Save: delegate to InvoiceGrid.InvoiceDataService, handle UX states
 *
 * No arrow functions. No template literals. No CSS variables.
 * IE 11 (Edge IE Mode) compatible.
 *
 * Depends on:
 *   InvoiceGrid.Config            (formIntegration.js)
 *   InvoiceGrid.InvoiceDataService (formIntegration.js)
 */

(function (Config, DataService) {
    'use strict';

    /* ── Module state ───────────────────────────────────────────────────── */

    var _parentId         = null;   /* GUID from URL param */
    var _rowCounter       = 0;      /* monotonic row index for IDs */
    var _hsDebounceTimer  = null;   /* setTimeout handle for HS Code search */
    var _activeHsInput    = null;   /* the <input> that owns the dropdown */
    var _dropdownFocusIdx = -1;     /* keyboard-focused option index */

    /* ── DOM references ─────────────────────────────────────────────────── */

    var _dom = {};

    /* ── Boot ───────────────────────────────────────────────────────────── */

    /**
     * Entry point — called when DOMContentLoaded fires.
     */
    function init() {
        cacheElements();
        applyDesignMode();
        readUrlParams();
        registerGlobalEvents();
        addRow();           /* start with one empty row */
        updateFooter();
    }

    /**
     * Caches frequently-used DOM nodes.
     */
    function cacheElements() {
        _dom.btnAddRow            = document.getElementById('btnAddRow');
        _dom.btnSave              = document.getElementById('btnSave');
        _dom.statusMsg            = document.getElementById('statusMsg');
        _dom.loadingIndicator     = document.getElementById('loadingIndicator');
        _dom.invoiceNo            = document.getElementById('invoiceNo');
        _dom.invoiceNoError       = document.getElementById('invoiceNoError');
        _dom.invoiceDate          = document.getElementById('invoiceDate');
        _dom.invoiceDateError     = document.getElementById('invoiceDateError');
        _dom.invoiceAmount        = document.getElementById('invoiceAmount');
        _dom.disbursementAmount   = document.getElementById('disbursementAmount');
        _dom.lineTableBody        = document.getElementById('lineTableBody');
        _dom.footerLineTotal      = document.getElementById('footerLineTotal');
        _dom.hsCodeDropdown       = document.getElementById('hsCodeDropdown');
        _dom.rowTemplate          = document.getElementById('rowTemplate');
    }

    /**
     * Reads URL query parameters and stores parentId.
     * Applies design mode class to <body>.
     */
    function readUrlParams() {
        var params   = parseQueryString(window.location.search);
        _parentId    = params.parentId || params.id || null;

        if (!_parentId) {
            showStatus('Warning: no parentId in URL — save will be skipped.', true);
        }
    }

    /**
     * Applies the design mode body class based on the "design" URL param.
     * Defaults to UCI if not specified or unrecognised.
     */
    function applyDesignMode() {
        var params = parseQueryString(window.location.search);
        var design = (params.design || 'uci').toLowerCase();

        if (design === 'legacy') {
            document.body.className = (document.body.className + ' design-legacy').trim();
        }
        /* 'uci' is the default — no extra class needed */
    }

    /**
     * Parses a query string into a plain key-value object.
     * @param {string} queryString  window.location.search
     * @returns {Object}
     */
    function parseQueryString(queryString) {
        var result = {};
        var qs     = (queryString || '').replace(/^\?/, '');
        if (!qs) { return result; }

        var pairs = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            if (pair.length === 2) {
                result[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
        }
        return result;
    }

    /* ── Global event registration ──────────────────────────────────────── */

    /**
     * Wires up toolbar buttons and document-level click (close dropdown).
     */
    function registerGlobalEvents() {
        _dom.btnAddRow.onclick = onAddRowClick;
        _dom.btnSave.onclick   = onSaveClick;

        /* Close HS Code dropdown when clicking outside */
        document.onclick = function (evt) {
            if (!_dom.hsCodeDropdown.contains(evt.target) &&
                _activeHsInput !== evt.target) {
                closeHsDropdown();
            }
        };

        document.onkeydown = function (evt) {
            if (_dom.hsCodeDropdown.style.display !== 'none') {
                handleDropdownKeydown(evt);
            }
        };
    }

    /* ── Row management ─────────────────────────────────────────────────── */

    /**
     * Clones the row template and appends it to the table body.
     */
    function addRow() {
        var template = _dom.rowTemplate;
        var clone;

        /* IE does not support <template>.content — use innerHTML fallback */
        if (template.content) {
            clone = document.importNode(template.content, true).firstElementChild;
        } else {
            /* IE fallback: parse innerHTML */
            var div       = document.createElement('div');
            div.innerHTML = template.innerHTML;
            clone         = div.firstElementChild;
        }

        _rowCounter++;
        clone.setAttribute('data-row-index', _rowCounter);

        wireRowEvents(clone);
        _dom.lineTableBody.appendChild(clone);
        renumberRows();
    }

    /**
     * Attaches all events to inputs inside a freshly cloned row.
     * @param {HTMLElement} row  The <tr> element
     */
    function wireRowEvents(row) {
        var deleteBtn  = row.querySelector('.btn-delete');
        var hsInput    = row.querySelector('.hscode-input');
        var qtyInput   = row.querySelector('.qty-input');
        var priceInput = row.querySelector('.price-input');

        deleteBtn.onclick = function () { deleteRow(row); };

        /* HS Code input: debounced search */
        hsInput.oninput = function () {
            onHsCodeInput(hsInput, row);
        };
        hsInput.onfocus = function () {
            _activeHsInput = hsInput;
        };

        /* Recalculate on qty / price change */
        qtyInput.oninput   = function () { recalculateRow(row); };
        priceInput.oninput = function () { recalculateRow(row); };
    }

    /**
     * Removes a row from the table and updates totals.
     * @param {HTMLElement} row
     */
    function deleteRow(row) {
        row.parentNode.removeChild(row);
        renumberRows();
        updateFooter();
    }

    /**
     * Re-assigns sequential row numbers in the first column.
     */
    function renumberRows() {
        var rows = _dom.lineTableBody.querySelectorAll('.grid-row');
        for (var i = 0; i < rows.length; i++) {
            var seqCell = rows[i].querySelector('.cell-seq');
            if (seqCell) { seqCell.textContent = i + 1; }
        }
    }

    /* ── Calculation ────────────────────────────────────────────────────── */

    /**
     * Recalculates the line total for a single row.
     * @param {HTMLElement} row
     */
    function recalculateRow(row) {
        var qty        = parseFloat(row.querySelector('.qty-input').value)   || 0;
        var unitPrice  = parseFloat(row.querySelector('.price-input').value) || 0;
        var lineTotal  = roundToTwo(qty * unitPrice);
        var totalCell  = row.querySelector('.cell-line-total');
        totalCell.textContent = formatNumber(lineTotal);
        updateFooter();
    }

    /**
     * Sums all line totals, updates the footer and the Invoice Amount field.
     */
    function updateFooter() {
        var rows        = _dom.lineTableBody.querySelectorAll('.grid-row');
        var grandTotal  = 0;

        for (var i = 0; i < rows.length; i++) {
            var cellText = rows[i].querySelector('.cell-line-total').textContent;
            grandTotal  += parseFloat(cellText.replace(/,/g, '')) || 0;
        }

        grandTotal = roundToTwo(grandTotal);
        _dom.footerLineTotal.textContent     = formatNumber(grandTotal);
        _dom.invoiceAmount.value             = grandTotal;
    }

    /**
     * Rounds a number to 2 decimal places.
     * @param {number} value
     * @returns {number}
     */
    function roundToTwo(value) {
        return Math.round(value * 100) / 100;
    }

    /**
     * Formats a number with 2 decimal places and thousands separator.
     * IE-compatible (no toLocaleString with options).
     * @param {number} value
     * @returns {string}
     */
    function formatNumber(value) {
        var fixed  = value.toFixed(2);
        var parts  = fixed.split('.');
        var whole  = parts[0];
        var dec    = parts[1];
        var result = '';
        var len    = whole.length;

        for (var i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 === 0) { result += ','; }
            result += whole[i];
        }

        return result + '.' + dec;
    }

    /* ── HS Code autocomplete ───────────────────────────────────────────── */

    /**
     * Handles typing in an HS Code input field.
     * Debounces the search to avoid rapid XHR calls.
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function onHsCodeInput(input, row) {
        var term = input.value.trim();

        /* Clear hidden ID when user modifies text */
        row.querySelector('.hscode-id').value = '';

        clearTimeout(_hsDebounceTimer);

        if (term.length < 3) {
            closeHsDropdown();
            return;
        }

        _hsDebounceTimer = setTimeout(function () {
            runHsCodeSearch(term, input, row);
        }, 300);
    }

    /**
     * Calls the data service and renders the dropdown results.
     * @param {string}           term
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function runHsCodeSearch(term, input, row) {
        DataService.searchHsCodes(term, function (results, error) {
            if (error) {
                showStatus('HS Code search error: ' + error, true);
                return;
            }
            renderHsDropdown(results, input, row);
        });
    }

    /**
     * Renders the autocomplete dropdown list beneath the active HS input.
     * @param {Array}            results  Array of HS Code records
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function renderHsDropdown(results, input, row) {
        var dropdown    = _dom.hsCodeDropdown;
        var nameField   = Config.hsCode.fieldName;
        var descField   = Config.hsCode.fieldDescription;
        var idField     = Config.hsCode.entityLogicalName + 'id';

        /* Empty the dropdown */
        while (dropdown.firstChild) {
            dropdown.removeChild(dropdown.firstChild);
        }
        _dropdownFocusIdx = -1;

        if (results.length === 0) {
            var noResult       = document.createElement('div');
            noResult.className = 'hscode-no-results';
            noResult.textContent = 'No HS codes found.';
            dropdown.appendChild(noResult);
        } else {
            for (var i = 0; i < results.length; i++) {
                dropdown.appendChild(
                    buildDropdownOption(results[i], nameField, descField, idField, input, row)
                );
            }
        }

        positionDropdownBelowInput(input);
        dropdown.style.display = 'block';
        _activeHsInput = input;
    }

    /**
     * Builds a single dropdown option element.
     * @param {Object}           record
     * @param {string}           nameField
     * @param {string}           descField
     * @param {string}           idField
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     * @returns {HTMLElement}
     */
    function buildDropdownOption(record, nameField, descField, idField, input, row) {
        var option          = document.createElement('div');
        option.className    = 'hscode-option';
        option.setAttribute('role', 'option');

        var codeSpan        = document.createElement('span');
        codeSpan.className  = 'hscode-code';
        codeSpan.textContent = record[nameField] || '';

        var descDiv         = document.createElement('div');
        descDiv.className   = 'hscode-desc';
        descDiv.textContent = record[descField] || '';

        option.appendChild(codeSpan);
        option.appendChild(descDiv);

        option.onclick = function () {
            selectHsCode(record, nameField, descField, idField, input, row);
        };

        return option;
    }

    /**
     * Applies the selected HS Code to the row inputs and closes the dropdown.
     * @param {Object}           record
     * @param {string}           nameField
     * @param {string}           descField
     * @param {string}           idField
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function selectHsCode(record, nameField, descField, idField, input, row) {
        input.value                               = record[nameField] || '';
        row.querySelector('.hscode-id').value     = record[idField]   || '';

        /* Auto-populate goods description if empty */
        var descInput = row.querySelector('.desc-input');
        if (record[descField] && (!descInput.value || descInput.value.trim() === '')) {
            descInput.value = record[descField];
        }

        closeHsDropdown();
        input.focus();
    }

    /**
     * Positions the dropdown directly below the given input element.
     * @param {HTMLInputElement} input
     */
    function positionDropdownBelowInput(input) {
        var rect     = input.getBoundingClientRect();
        var dropdown = _dom.hsCodeDropdown;

        dropdown.style.position = 'fixed';
        dropdown.style.top      = (rect.bottom + 1) + 'px';
        dropdown.style.left     = rect.left + 'px';
        dropdown.style.width    = Math.max(rect.width, 260) + 'px';
    }

    /**
     * Hides the dropdown and resets keyboard focus state.
     */
    function closeHsDropdown() {
        _dom.hsCodeDropdown.style.display = 'none';
        _dropdownFocusIdx = -1;
        _activeHsInput    = null;
    }

    /**
     * Handles keyboard navigation inside the dropdown.
     * @param {KeyboardEvent} evt
     */
    function handleDropdownKeydown(evt) {
        var options = _dom.hsCodeDropdown.querySelectorAll('.hscode-option');
        var key     = evt.keyCode || evt.which;

        if (key === 27) { /* Escape */
            closeHsDropdown();
            return;
        }

        if (key === 40) { /* Arrow down */
            evt.preventDefault();
            moveFocus(options, 1);
        } else if (key === 38) { /* Arrow up */
            evt.preventDefault();
            moveFocus(options, -1);
        } else if (key === 13) { /* Enter */
            if (_dropdownFocusIdx >= 0 && options[_dropdownFocusIdx]) {
                options[_dropdownFocusIdx].onclick();
            }
        }
    }

    /**
     * Moves the visual focus within the dropdown options.
     * @param {NodeList} options
     * @param {number}   direction  +1 (down) or -1 (up)
     */
    function moveFocus(options, direction) {
        if (options.length === 0) { return; }

        /* Remove current focus class */
        if (_dropdownFocusIdx >= 0 && options[_dropdownFocusIdx]) {
            removeClass(options[_dropdownFocusIdx], 'focused');
        }

        _dropdownFocusIdx += direction;

        if (_dropdownFocusIdx < 0)               { _dropdownFocusIdx = options.length - 1; }
        if (_dropdownFocusIdx >= options.length)  { _dropdownFocusIdx = 0; }

        addClass(options[_dropdownFocusIdx], 'focused');
        options[_dropdownFocusIdx].scrollIntoView({ block: 'nearest' });
    }

    /* ── Validation ─────────────────────────────────────────────────────── */

    /**
     * Validates all header and line data.
     * Returns true if valid, false otherwise.
     * Displays inline error messages.
     * @returns {boolean}
     */
    function validateForm() {
        var isValid = true;

        /* Invoice No */
        if (!_dom.invoiceNo.value.trim()) {
            showFieldError(_dom.invoiceNo, _dom.invoiceNoError, 'Invoice No. is required.');
            isValid = false;
        } else {
            clearFieldError(_dom.invoiceNo, _dom.invoiceNoError);
        }

        /* Invoice Date */
        if (!_dom.invoiceDate.value) {
            showFieldError(_dom.invoiceDate, _dom.invoiceDateError, 'Invoice Date is required.');
            isValid = false;
        } else {
            clearFieldError(_dom.invoiceDate, _dom.invoiceDateError);
        }

        /* At least one line item */
        var rows = _dom.lineTableBody.querySelectorAll('.grid-row');
        if (rows.length === 0) {
            showStatus('At least one line item is required.', true);
            isValid = false;
        }

        return isValid;
    }

    /**
     * Marks a field as invalid and shows the error span.
     * @param {HTMLElement} input
     * @param {HTMLElement} errorSpan
     * @param {string}      message
     */
    function showFieldError(input, errorSpan, message) {
        addClass(input, 'invalid');
        errorSpan.textContent    = message;
        errorSpan.style.display  = 'block';
    }

    /**
     * Clears the invalid state from a field.
     * @param {HTMLElement} input
     * @param {HTMLElement} errorSpan
     */
    function clearFieldError(input, errorSpan) {
        removeClass(input, 'invalid');
        errorSpan.textContent   = '';
        errorSpan.style.display = 'none';
    }

    /* ── Collect form data ──────────────────────────────────────────────── */

    /**
     * Reads all form fields and constructs the invoice payload.
     * @returns {Object} invoiceData ready for InvoiceDataService.saveInvoice
     */
    function collectFormData() {
        var rows  = _dom.lineTableBody.querySelectorAll('.grid-row');
        var lines = [];

        for (var i = 0; i < rows.length; i++) {
            lines.push(collectLineData(rows[i]));
        }

        return {
            invoiceNo:          _dom.invoiceNo.value.trim(),
            invoiceDate:        _dom.invoiceDate.value,
            invoiceAmount:      parseFloat(_dom.invoiceAmount.value)      || 0,
            disbursementAmount: parseFloat(_dom.disbursementAmount.value) || 0,
            lines:              lines
        };
    }

    /**
     * Reads data from a single line row.
     * @param {HTMLElement} row
     * @returns {Object}
     */
    function collectLineData(row) {
        return {
            hsCodeId:    row.querySelector('.hscode-id').value   || null,
            hsCodeName:  row.querySelector('.hscode-input').value || '',
            description: row.querySelector('.desc-input').value   || '',
            quantity:    parseFloat(row.querySelector('.qty-input').value)   || 0,
            uom:         row.querySelector('.uom-select').value   || '',
            unitPrice:   parseFloat(row.querySelector('.price-input').value) || 0
        };
    }

    /* ── Event handlers ─────────────────────────────────────────────────── */

    /**
     * Handles the "Add Line" button click.
     */
    function onAddRowClick() {
        addRow();
        /* Scroll to newly added row */
        var rows    = _dom.lineTableBody.querySelectorAll('.grid-row');
        var lastRow = rows[rows.length - 1];
        if (lastRow) { lastRow.scrollIntoView({ block: 'nearest' }); }
    }

    /**
     * Handles the "Save Invoice" button click.
     * Validates, collects data, then delegates to the data service.
     */
    function onSaveClick() {
        clearStatus();

        if (!validateForm()) { return; }

        if (!_parentId) {
            showStatus('Cannot save: parent record ID is missing.', true);
            return;
        }

        var invoiceData = collectFormData();

        enterSavingState();

        DataService.saveInvoice(invoiceData, _parentId, function (success, errorMessage) {
            exitSavingState();

            if (success) {
                showStatus('Invoice saved successfully.');
                refreshParentForm();
            } else {
                showStatus(errorMessage || 'Save failed.', true);
            }
        });
    }

    /* ── UI state helpers ───────────────────────────────────────────────── */

    /**
     * Disables all interactive elements during a save operation.
     */
    function enterSavingState() {
        addClass(document.body, 'is-saving');
        _dom.loadingIndicator.style.display = 'inline';
        _dom.btnSave.disabled   = true;
        _dom.btnAddRow.disabled = true;
    }

    /**
     * Re-enables all interactive elements after a save completes.
     */
    function exitSavingState() {
        removeClass(document.body, 'is-saving');
        _dom.loadingIndicator.style.display = 'none';
        _dom.btnSave.disabled   = false;
        _dom.btnAddRow.disabled = false;
    }

    /**
     * Shows a status message in the toolbar.
     * @param {string}  message
     * @param {boolean} isError
     */
    function showStatus(message, isError) {
        _dom.statusMsg.textContent = message;
        if (isError) {
            addClass(_dom.statusMsg, 'error');
        } else {
            removeClass(_dom.statusMsg, 'error');
        }
    }

    /**
     * Clears the toolbar status message.
     */
    function clearStatus() {
        _dom.statusMsg.textContent = '';
        removeClass(_dom.statusMsg, 'error');
    }

    /**
     * Attempts to refresh the parent CRM form after a successful save.
     * Works for both UCI (Xrm.Page via postMessage) and on-prem iframe.
     */
    function refreshParentForm() {
        try {
            if (window.parent &&
                window.parent.Xrm &&
                window.parent.Xrm.Page &&
                window.parent.Xrm.Page.data) {
                /* On-prem / legacy */
                window.parent.Xrm.Page.data.refresh(false);

            } else if (window.parent &&
                       window.parent.Xrm &&
                       window.parent.Xrm.Page) {
                /* Fallback: try to refresh via UCI form context */
                window.parent.Xrm.Page.data.refresh(false);
            }
        } catch (ignore) {
            /* Parent refresh is best-effort; do not block the user */
        }
    }

    /* ── CSS class helpers (IE-compatible) ─────────────────────────────── */

    /**
     * Adds a CSS class to an element if not already present.
     * @param {HTMLElement} el
     * @param {string}      className
     */
    function addClass(el, className) {
        if (!el) { return; }
        var classes = el.className ? el.className.split(' ') : [];
        for (var i = 0; i < classes.length; i++) {
            if (classes[i] === className) { return; }
        }
        el.className = (el.className + ' ' + className).trim();
    }

    /**
     * Removes a CSS class from an element.
     * @param {HTMLElement} el
     * @param {string}      className
     */
    function removeClass(el, className) {
        if (!el || !el.className) { return; }
        var classes = el.className.split(' ');
        var result  = [];
        for (var i = 0; i < classes.length; i++) {
            if (classes[i] !== className) { result.push(classes[i]); }
        }
        el.className = result.join(' ');
    }

    /* ── DOMContentLoaded ───────────────────────────────────────────────── */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        /* DOMContentLoaded already fired (e.g. script at bottom of <body>) */
        init();
    }

}(InvoiceGrid.Config, InvoiceGrid.InvoiceDataService));
