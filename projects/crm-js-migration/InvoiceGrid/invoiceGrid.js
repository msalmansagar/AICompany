/**
 * invoiceGrid.js  v2
 * Invoice Entry Grid — UI Controller
 * Compatible: CRM On-Prem v9.1 (IE Mode / Edge Chromium), UCI, Dataverse
 *
 * Responsibilities:
 *   1. Boot — read URL params, apply design mode, add first invoice panel
 *   2. Invoice panel management — add / remove / collapse accordion panels
 *   3. Row management — add / delete / renumber rows per panel
 *   4. Column resize — drag right edge of any sortable column header
 *   5. Column sort — click header to cycle asc/desc; re-orders tbody rows
 *   6. HS Code lookup — search button + debounced type-ahead, keyboard nav
 *   7. Goods Description — read-only, auto-populated from HS Code selection
 *   8. Calculation — line total = qty x unitPrice; grand total per panel
 *   9. Validation — Invoice No, Invoice Date, at least one line per panel
 *  10. Save — collect all panels, delegate to InvoiceDataService.saveAllInvoices
 *
 * No arrow functions. No template literals. No const/let. IE 11 safe.
 *
 * Depends on (loaded before this file):
 *   InvoiceGrid.Config             (formIntegration.js)
 *   InvoiceGrid.InvoiceDataService (formIntegration.js)
 */

(function (Config, DataService) {
    'use strict';

    /* ── Module state ───────────────────────────────────────────────────── */

    var _parentId          = null;
    var _panelCounter      = 0;
    var _rowCounter        = 0;

    /* Sort state keyed by panel ID: { colIndex: number, direction: 'asc'|'desc' } */
    var _sortState         = {};

    /* HS Code lookup state */
    var _hsDebounceTimer   = null;
    var _activeHsInput     = null;
    var _activeHsRow       = null;
    var _dropdownFocusIdx  = -1;

    /* ── Cached top-level DOM refs ──────────────────────────────────────── */

    var _dom = {};

    /* ════════════════════════════════════════════════════════════════════════
       BOOT
       ════════════════════════════════════════════════════════════════════════ */

    function init() {
        _dom.btnAddInvoice      = document.getElementById('btnAddInvoice');
        _dom.btnSaveAll         = document.getElementById('btnSaveAll');
        _dom.statusMsg          = document.getElementById('statusMsg');
        _dom.loadingIndicator   = document.getElementById('loadingIndicator');
        _dom.invoicesContainer  = document.getElementById('invoicesContainer');
        _dom.hsCodeDropdown     = document.getElementById('hsCodeDropdown');

        applyDesignMode();
        readUrlParams();
        registerGlobalEvents();
        addInvoicePanel();   /* start with one empty panel */
    }

    function readUrlParams() {
        var params = parseQueryString(window.location.search);
        _parentId  = params.parentId || params.id || null;
        if (!_parentId) {
            showStatus('Warning: no parentId in URL — save will be skipped.', true);
        }
    }

    function applyDesignMode() {
        var params = parseQueryString(window.location.search);
        var design = (params.design || 'uci').toLowerCase();
        if (design === 'legacy') {
            document.body.className = (document.body.className + ' design-legacy').trim();
        }
    }

    function registerGlobalEvents() {
        _dom.btnAddInvoice.onclick = onAddInvoiceClick;
        _dom.btnSaveAll.onclick    = onSaveAllClick;

        /* Close HS dropdown when clicking outside */
        document.onclick = function (evt) {
            var dropdown = _dom.hsCodeDropdown;
            if (dropdown.style.display === 'none') { return; }
            if (dropdown.contains(evt.target))     { return; }
            if (_activeHsInput && _activeHsInput === evt.target) { return; }
            closeHsDropdown();
        };

        document.onkeydown = function (evt) {
            if (_dom.hsCodeDropdown.style.display !== 'none') {
                handleDropdownKeydown(evt);
            }
        };
    }

    /* ════════════════════════════════════════════════════════════════════════
       INVOICE PANEL MANAGEMENT
       ════════════════════════════════════════════════════════════════════════ */

    function onAddInvoiceClick() {
        addInvoicePanel();
    }

    /**
     * Clones the invoice panel template, assigns a unique ID, wires events,
     * and appends it to the invoices container.
     */
    function addInvoicePanel() {
        _panelCounter++;
        var panelId = 'panel-' + _panelCounter;

        var panel = clonePanelTemplate();
        panel.setAttribute('data-panel-id', panelId);

        _sortState[panelId] = { colIndex: -1, direction: 'asc' };

        wirePanelEvents(panel, panelId);
        initColumnResize(panel);
        initColumnSort(panel, panelId);

        _dom.invoicesContainer.appendChild(panel);
        addRow(panel);            /* start with one empty row */
        updatePanelTotal(panel);
        updatePanelTitle(panel);
    }

    /**
     * Wires all events for a newly added panel.
     * @param {HTMLElement} panel
     * @param {string}      panelId
     */
    function wirePanelEvents(panel, panelId) {
        var headerBar   = panel.querySelector('.invoice-panel-header');
        var toggleBtn   = panel.querySelector('.panel-toggle');
        var removeBtn   = panel.querySelector('.btn-remove-panel');
        var addLineBtn  = panel.querySelector('.btn-add-line');
        var invoiceNo   = panel.querySelector('.invoice-no');

        toggleBtn.onclick = function (evt) {
            evt.stopPropagation();
            togglePanelCollapse(panel);
        };

        removeBtn.onclick = function (evt) {
            evt.stopPropagation();
            removeInvoicePanel(panel, panelId);
        };

        headerBar.onclick = function () {
            togglePanelCollapse(panel);
        };

        addLineBtn.onclick = function () {
            addRow(panel);
        };

        invoiceNo.oninput = function () {
            updatePanelTitle(panel);
        };
    }

    /**
     * Collapses or expands a panel body.
     * @param {HTMLElement} panel
     */
    function togglePanelCollapse(panel) {
        if (hasClass(panel, 'is-collapsed')) {
            removeClass(panel, 'is-collapsed');
            var toggleBtn = panel.querySelector('.panel-toggle');
            toggleBtn.setAttribute('aria-expanded', 'true');
        } else {
            addClass(panel, 'is-collapsed');
            var toggleBtn2 = panel.querySelector('.panel-toggle');
            toggleBtn2.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Removes a panel from the DOM and cleans up its sort state.
     * @param {HTMLElement} panel
     * @param {string}      panelId
     */
    function removeInvoicePanel(panel, panelId) {
        delete _sortState[panelId];
        panel.parentNode.removeChild(panel);
    }

    /**
     * Updates the panel accordion header title to show the invoice number.
     * @param {HTMLElement} panel
     */
    function updatePanelTitle(panel) {
        var invoiceNoVal = panel.querySelector('.invoice-no').value.trim();
        var titleEl      = panel.querySelector('.panel-title');
        titleEl.textContent = invoiceNoVal
            ? 'Invoice: ' + invoiceNoVal
            : 'New Invoice';
    }

    /* ════════════════════════════════════════════════════════════════════════
       ROW MANAGEMENT
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Clones the row template and appends it to the panel's tbody.
     * @param {HTMLElement} panel
     */
    function addRow(panel) {
        _rowCounter++;
        var tbody = panel.querySelector('.line-table-body');
        var row   = cloneRowTemplate();

        row.setAttribute('data-row-id', _rowCounter);
        wireRowEvents(row, panel);
        tbody.appendChild(row);
        renumberRows(tbody);
        updatePanelTotal(panel);
    }

    /**
     * Wires all input events for a single line row.
     * @param {HTMLElement} row
     * @param {HTMLElement} panel
     */
    function wireRowEvents(row, panel) {
        var deleteBtn   = row.querySelector('.btn-delete-row');
        var hsInput     = row.querySelector('.lookup-text-input');
        var searchBtn   = row.querySelector('.lookup-search-btn');
        var clearBtn    = row.querySelector('.lookup-clear-btn');
        var qtyInput    = row.querySelector('.qty-input');
        var priceInput  = row.querySelector('.price-input');

        deleteBtn.onclick = function () {
            deleteRow(row, panel);
        };

        hsInput.oninput = function () {
            onHsCodeType(hsInput, row, panel);
        };

        hsInput.onfocus = function () {
            _activeHsInput = hsInput;
            _activeHsRow   = row;
        };

        searchBtn.onclick = function (evt) {
            evt.stopPropagation();
            onLookupSearchClick(hsInput, row);
        };

        clearBtn.onclick = function (evt) {
            evt.stopPropagation();
            onLookupClearClick(hsInput, row);
        };

        qtyInput.oninput = function () {
            recalculateRow(row);
            updatePanelTotal(panel);
        };

        priceInput.oninput = function () {
            recalculateRow(row);
            updatePanelTotal(panel);
        };
    }

    /**
     * Removes a row from the tbody and refreshes numbering and totals.
     * @param {HTMLElement} row
     * @param {HTMLElement} panel
     */
    function deleteRow(row, panel) {
        var tbody = panel.querySelector('.line-table-body');
        tbody.removeChild(row);
        renumberRows(tbody);
        updatePanelTotal(panel);
    }

    /**
     * Re-assigns sequential numbers in the first cell of each row.
     * @param {HTMLElement} tbody
     */
    function renumberRows(tbody) {
        var rows = tbody.querySelectorAll('.grid-row');
        for (var i = 0; i < rows.length; i++) {
            var seqCell = rows[i].querySelector('.cell-seq');
            if (seqCell) { seqCell.textContent = i + 1; }
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       COLUMN RESIZE
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Attaches drag-resize behaviour to every resize handle in a panel's thead.
     * Updating colgroup <col> widths drives the table-layout: fixed columns.
     * @param {HTMLElement} panel
     */
    function initColumnResize(panel) {
        var ths  = panel.querySelectorAll('.grid-header-row th');
        var cols = panel.querySelectorAll('colgroup col');

        for (var i = 0; i < ths.length; i++) {
            (function (th, col) {
                var handle = th.querySelector('.col-resize-handle');
                if (!handle || !col) { return; }
                attachResizeHandle(handle, th, col);
            }(ths[i], cols[i]));
        }
    }

    /**
     * Wires mousedown → mousemove/mouseup on a single resize handle.
     * @param {HTMLElement} handle
     * @param {HTMLElement} th
     * @param {HTMLElement} col   The corresponding <col> in the colgroup
     */
    function attachResizeHandle(handle, th, col) {
        handle.onmousedown = function (evt) {
            evt.preventDefault();
            evt.stopPropagation();  /* prevent sort click */

            var startX     = evt.clientX;
            var startWidth = th.offsetWidth;

            function onMouseMove(moveEvt) {
                var newWidth = startWidth + (moveEvt.clientX - startX);
                if (newWidth >= 44) {
                    col.style.width = newWidth + 'px';
                }
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup',  onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
        };
    }

    /* ════════════════════════════════════════════════════════════════════════
       COLUMN SORT
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Makes every .th-sortable header in a panel clickable for sorting.
     * @param {HTMLElement} panel
     * @param {string}      panelId
     */
    function initColumnSort(panel, panelId) {
        var ths = panel.querySelectorAll('.th-sortable');

        for (var i = 0; i < ths.length; i++) {
            (function (th) {
                th.onclick = function (evt) {
                    /* Ignore clicks directly on the resize handle */
                    if (evt.target && hasClass(evt.target, 'col-resize-handle')) {
                        return;
                    }
                    var colIndex = parseInt(th.getAttribute('data-col-index'), 10);
                    onColumnHeaderClick(panel, panelId, colIndex);
                };
            }(ths[i]));
        }
    }

    /**
     * Toggles sort direction for the clicked column and re-renders rows.
     * @param {HTMLElement} panel
     * @param {string}      panelId
     * @param {number}      colIndex
     */
    function onColumnHeaderClick(panel, panelId, colIndex) {
        var state = _sortState[panelId];
        var direction;

        if (state.colIndex === colIndex) {
            direction = state.direction === 'asc' ? 'desc' : 'asc';
        } else {
            direction = 'asc';
        }

        state.colIndex  = colIndex;
        state.direction = direction;

        var tbody = panel.querySelector('.line-table-body');
        sortGridRows(tbody, colIndex, direction);
        renumberRows(tbody);
        updateSortIndicators(panel, colIndex, direction);
    }

    /**
     * Sorts all .grid-row elements in a tbody by the given column.
     * Moves DOM nodes in-place; does not re-create rows.
     * @param {HTMLElement} tbody
     * @param {number}      colIndex
     * @param {string}      direction  'asc' | 'desc'
     */
    function sortGridRows(tbody, colIndex, direction) {
        var nodeList = tbody.querySelectorAll('.grid-row');
        var rows     = [];
        var i;

        for (i = 0; i < nodeList.length; i++) {
            rows.push(nodeList[i]);
        }

        rows.sort(function (a, b) {
            var av = getRowSortValue(a, colIndex);
            var bv = getRowSortValue(b, colIndex);

            if (typeof av === 'number' && typeof bv === 'number') {
                return direction === 'asc' ? av - bv : bv - av;
            }

            var as = String(av).toLowerCase();
            var bs = String(bv).toLowerCase();
            if (as < bs) { return direction === 'asc' ? -1 :  1; }
            if (as > bs) { return direction === 'asc' ?  1 : -1; }
            return 0;
        });

        for (i = 0; i < rows.length; i++) {
            tbody.appendChild(rows[i]);
        }
    }

    /**
     * Reads a sortable value from a row cell by column index.
     * colIndex matches data-col-index on the <th> elements:
     *   0 = #seq (nosort), 1 = HS Code, 2 = Description,
     *   3 = Qty, 4 = UOM, 5 = Unit Price, 6 = Line Total, 7 = Actions (nosort)
     * @param {HTMLElement} row
     * @param {number}      colIndex
     * @returns {string|number}
     */
    function getRowSortValue(row, colIndex) {
        switch (colIndex) {
            case 1: return (row.querySelector('.lookup-text-input').value  || '').toLowerCase();
            case 2: return (row.querySelector('.desc-input').value         || '').toLowerCase();
            case 3: return parseFloat(row.querySelector('.qty-input').value)   || 0;
            case 4: return (row.querySelector('.uom-select').value         || '').toLowerCase();
            case 5: return parseFloat(row.querySelector('.price-input').value) || 0;
            case 6: return parseFloat(
                        (row.querySelector('.cell-line-total').textContent || '0')
                            .replace(/,/g, '')
                    ) || 0;
            default: return '';
        }
    }

    /**
     * Updates the sort arrow indicator on every sortable column header.
     * @param {HTMLElement} panel
     * @param {number}      activeCol
     * @param {string}      direction
     */
    function updateSortIndicators(panel, activeCol, direction) {
        var ths = panel.querySelectorAll('.th-sortable');

        for (var i = 0; i < ths.length; i++) {
            var indicator = ths[i].querySelector('.sort-indicator');
            if (!indicator) { continue; }

            var colIdx = parseInt(ths[i].getAttribute('data-col-index'), 10);

            removeClass(indicator, 'sort-asc');
            removeClass(indicator, 'sort-desc');

            if (colIdx === activeCol) {
                addClass(indicator, direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       HS CODE LOOKUP
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Handles typing in the HS Code lookup input.
     * Debounces search by 300 ms; requires min 2 characters.
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     * @param {HTMLElement}      panel  (unused here, kept for consistency)
     */
    function onHsCodeType(input, row) {
        /* Clear the stored ID when user modifies text */
        row.querySelector('.hscode-id').value = '';
        toggleLookupClearBtn(row, false);

        clearTimeout(_hsDebounceTimer);

        var term = input.value.trim();
        if (term.length < 2) {
            closeHsDropdown();
            return;
        }

        _hsDebounceTimer = setTimeout(function () {
            runHsSearch(term, input, row);
        }, 300);
    }

    /**
     * Handles the magnifying-glass search button click.
     * Opens the dropdown immediately with whatever text is in the input.
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function onLookupSearchClick(input, row) {
        _activeHsInput = input;
        _activeHsRow   = row;

        var term = input.value.trim();
        if (term.length === 0) {
            /* Show a short list of first results with no filter */
            runHsSearch('', input, row);
            return;
        }
        runHsSearch(term, input, row);
    }

    /**
     * Clears the HS Code selection from a row.
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function onLookupClearClick(input, row) {
        input.value                                    = '';
        row.querySelector('.hscode-id').value          = '';
        row.querySelector('.desc-input').value         = '';
        toggleLookupClearBtn(row, false);
        closeHsDropdown();
        input.focus();
    }

    /**
     * Calls the data service and renders the dropdown.
     * @param {string}           term
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function runHsSearch(term, input, row) {
        DataService.searchHsCodes(term, function (results, error) {
            if (error) {
                showStatus('HS Code search error: ' + error, true);
                return;
            }
            renderHsDropdown(results, input, row);
        });
    }

    /**
     * Empties and rebuilds the shared dropdown below the active input.
     * @param {Array}            results  HS Code records from CRM
     * @param {HTMLInputElement} input
     * @param {HTMLElement}      row
     */
    function renderHsDropdown(results, input, row) {
        var dropdown  = _dom.hsCodeDropdown;
        var nameField = Config.hsCode.fieldName;
        var descField = Config.hsCode.fieldDescription;
        var idField   = Config.hsCode.primaryIdField;

        /* Clear */
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

        positionDropdown(input);
        dropdown.style.display = 'block';
        _activeHsInput = input;
        _activeHsRow   = row;
    }

    /**
     * Builds a single dropdown option element.
     * @returns {HTMLElement}
     */
    function buildDropdownOption(record, nameField, descField, idField, input, row) {
        var option      = document.createElement('div');
        option.className = 'hscode-option';
        option.setAttribute('role', 'option');

        var codeSpan      = document.createElement('div');
        codeSpan.className = 'hscode-option-code';
        codeSpan.textContent = record[nameField] || '';

        var descDiv      = document.createElement('div');
        descDiv.className = 'hscode-option-desc';
        descDiv.textContent = record[descField] || '';

        option.appendChild(codeSpan);
        option.appendChild(descDiv);

        option.onclick = function () {
            selectHsCode(record, nameField, descField, idField, input, row);
        };

        return option;
    }

    /**
     * Applies the selected HS Code to the row: sets text input, hidden ID,
     * and populates the read-only Goods Description field.
     */
    function selectHsCode(record, nameField, descField, idField, input, row) {
        input.value                            = record[nameField]  || '';
        row.querySelector('.hscode-id').value  = record[idField]    || '';
        row.querySelector('.desc-input').value = record[descField]  || '';

        addClass(input, 'has-value');
        toggleLookupClearBtn(row, true);
        closeHsDropdown();
        input.focus();
    }

    /**
     * Positions the dropdown immediately below the active input using fixed coords.
     * @param {HTMLInputElement} input
     */
    function positionDropdown(input) {
        var rect     = input.getBoundingClientRect();
        var dropdown = _dom.hsCodeDropdown;

        dropdown.style.top   = (rect.bottom + 1) + 'px';
        dropdown.style.left  = rect.left + 'px';
        dropdown.style.width = Math.max(rect.width + 52, 280) + 'px';
    }

    /**
     * Hides the dropdown and resets focus tracking.
     */
    function closeHsDropdown() {
        _dom.hsCodeDropdown.style.display = 'none';
        _dropdownFocusIdx = -1;
        _activeHsInput    = null;
        _activeHsRow      = null;
    }

    /**
     * Shows or hides the clear (X) button inside a lookup control.
     * @param {HTMLElement} row
     * @param {boolean}     show
     */
    function toggleLookupClearBtn(row, show) {
        var clearBtn  = row.querySelector('.lookup-clear-btn');
        var searchBtn = row.querySelector('.lookup-search-btn');
        if (!clearBtn || !searchBtn) { return; }
        clearBtn.style.display  = show ? 'inline-block' : 'none';
        searchBtn.style.display = show ? 'none'         : 'inline-block';
    }

    /**
     * Keyboard navigation inside the open dropdown.
     * @param {KeyboardEvent} evt
     */
    function handleDropdownKeydown(evt) {
        var key     = evt.keyCode || evt.which;
        var options = _dom.hsCodeDropdown.querySelectorAll('.hscode-option');

        if (key === 27) { /* Escape */
            closeHsDropdown();
            return;
        }

        if (key === 40) { /* Arrow Down */
            evt.preventDefault();
            moveFocus(options, 1);
        } else if (key === 38) { /* Arrow Up */
            evt.preventDefault();
            moveFocus(options, -1);
        } else if (key === 13) { /* Enter */
            if (_dropdownFocusIdx >= 0 && options[_dropdownFocusIdx]) {
                options[_dropdownFocusIdx].onclick();
            }
        }
    }

    /**
     * Moves keyboard focus within the dropdown options.
     * @param {NodeList} options
     * @param {number}   direction  +1 down / -1 up
     */
    function moveFocus(options, direction) {
        if (options.length === 0) { return; }

        if (_dropdownFocusIdx >= 0 && options[_dropdownFocusIdx]) {
            removeClass(options[_dropdownFocusIdx], 'is-focused');
        }

        _dropdownFocusIdx += direction;
        if (_dropdownFocusIdx < 0)              { _dropdownFocusIdx = options.length - 1; }
        if (_dropdownFocusIdx >= options.length) { _dropdownFocusIdx = 0; }

        addClass(options[_dropdownFocusIdx], 'is-focused');
        options[_dropdownFocusIdx].scrollIntoView({ block: 'nearest' });
    }

    /* ════════════════════════════════════════════════════════════════════════
       CALCULATION
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Recalculates and displays the line total for a single row.
     * @param {HTMLElement} row
     */
    function recalculateRow(row) {
        var qty       = parseFloat(row.querySelector('.qty-input').value)   || 0;
        var unitPrice = parseFloat(row.querySelector('.price-input').value) || 0;
        var total     = roundToTwo(qty * unitPrice);

        row.querySelector('.cell-line-total').textContent = formatNumber(total);
    }

    /**
     * Sums all line totals in a panel and updates the footer and invoice-amount field.
     * @param {HTMLElement} panel
     */
    function updatePanelTotal(panel) {
        var rows       = panel.querySelectorAll('.grid-row');
        var grandTotal = 0;

        for (var i = 0; i < rows.length; i++) {
            var cellText = rows[i].querySelector('.cell-line-total').textContent || '0';
            grandTotal  += parseFloat(cellText.replace(/,/g, '')) || 0;
        }

        grandTotal = roundToTwo(grandTotal);

        var footerTotal    = panel.querySelector('.footer-total');
        var invoiceAmount  = panel.querySelector('.invoice-amount');

        if (footerTotal)   { footerTotal.textContent  = formatNumber(grandTotal); }
        if (invoiceAmount) { invoiceAmount.value       = formatNumber(grandTotal); }
    }

    /* ════════════════════════════════════════════════════════════════════════
       VALIDATION
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Validates all invoice panels.
     * @returns {boolean}  true if all panels are valid
     */
    function validateAllPanels() {
        var panels  = _dom.invoicesContainer.querySelectorAll('.invoice-panel');
        var isValid = true;

        if (panels.length === 0) {
            showStatus('Add at least one invoice before saving.', true);
            return false;
        }

        for (var i = 0; i < panels.length; i++) {
            if (!validatePanel(panels[i], i + 1)) {
                isValid = false;
            }
        }

        return isValid;
    }

    /**
     * Validates a single invoice panel.
     * @param {HTMLElement} panel
     * @param {number}      panelNumber  1-based index for error messages
     * @returns {boolean}
     */
    function validatePanel(panel, panelNumber) {
        var isValid    = true;
        var invoiceNo  = panel.querySelector('.invoice-no');
        var invoiceDate = panel.querySelector('.invoice-date');
        var noError    = invoiceNo.nextElementSibling;
        var dateError  = invoiceDate.nextElementSibling;

        if (!invoiceNo.value.trim()) {
            showFieldError(invoiceNo, noError, 'Invoice No. is required.');
            if (hasClass(panel, 'is-collapsed')) { togglePanelCollapse(panel); }
            isValid = false;
        } else {
            clearFieldError(invoiceNo, noError);
        }

        if (!invoiceDate.value) {
            showFieldError(invoiceDate, dateError, 'Invoice Date is required.');
            if (hasClass(panel, 'is-collapsed')) { togglePanelCollapse(panel); }
            isValid = false;
        } else {
            clearFieldError(invoiceDate, dateError);
        }

        var rows = panel.querySelectorAll('.grid-row');
        if (rows.length === 0) {
            showStatus('Invoice ' + panelNumber + ': at least one line item is required.', true);
            isValid = false;
        }

        return isValid;
    }

    function showFieldError(input, errorSpan, message) {
        addClass(input, 'is-invalid');
        if (errorSpan) {
            errorSpan.textContent   = message;
            errorSpan.style.display = 'block';
        }
    }

    function clearFieldError(input, errorSpan) {
        removeClass(input, 'is-invalid');
        if (errorSpan) {
            errorSpan.textContent   = '';
            errorSpan.style.display = 'none';
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       DATA COLLECTION
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Reads all invoice panels and returns an array of invoice payload objects.
     * @returns {Array}
     */
    function collectAllInvoiceData() {
        var panels = _dom.invoicesContainer.querySelectorAll('.invoice-panel');
        var result = [];

        for (var i = 0; i < panels.length; i++) {
            result.push(collectPanelData(panels[i]));
        }

        return result;
    }

    /**
     * Reads header fields and line rows from one panel.
     * @param {HTMLElement} panel
     * @returns {Object}
     */
    function collectPanelData(panel) {
        var rows  = panel.querySelectorAll('.grid-row');
        var lines = [];

        for (var i = 0; i < rows.length; i++) {
            lines.push(collectLineData(rows[i]));
        }

        return {
            invoiceNo:          panel.querySelector('.invoice-no').value.trim(),
            invoiceDate:        panel.querySelector('.invoice-date').value,
            invoiceAmount:      parseFloat(
                                    (panel.querySelector('.invoice-amount').value || '0')
                                        .replace(/,/g, '')
                                ) || 0,
            disbursementAmount: parseFloat(panel.querySelector('.disbursement-amount').value) || 0,
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
            hsCodeId:    row.querySelector('.hscode-id').value          || null,
            hsCodeName:  row.querySelector('.lookup-text-input').value  || '',
            description: row.querySelector('.desc-input').value         || '',
            quantity:    parseFloat(row.querySelector('.qty-input').value)   || 0,
            uom:         row.querySelector('.uom-select').value         || '',
            unitPrice:   parseFloat(row.querySelector('.price-input').value) || 0
        };
    }

    /* ════════════════════════════════════════════════════════════════════════
       SAVE
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Validates, collects, and delegates to InvoiceDataService.saveAllInvoices.
     */
    function onSaveAllClick() {
        clearStatus();

        if (!validateAllPanels()) { return; }

        if (!_parentId) {
            showStatus('Cannot save: parent record ID is missing.', true);
            return;
        }

        var allInvoicesData = collectAllInvoiceData();

        enterSavingState();

        DataService.saveAllInvoices(allInvoicesData, _parentId, function (success, errorMessage) {
            exitSavingState();

            if (success) {
                showStatus('All invoices saved successfully.');
                refreshParentForm();
            } else {
                showStatus(errorMessage || 'Save failed.', true);
            }
        });
    }

    /**
     * Attempts a best-effort refresh of the parent CRM form.
     */
    function refreshParentForm() {
        try {
            if (window.parent && window.parent.Xrm && window.parent.Xrm.Page &&
                window.parent.Xrm.Page.data) {
                window.parent.Xrm.Page.data.refresh(false);
            }
        } catch (ignore) { /* silent — parent refresh is optional */ }
    }

    /* ════════════════════════════════════════════════════════════════════════
       UI STATE
       ════════════════════════════════════════════════════════════════════════ */

    function showStatus(message, isError) {
        _dom.statusMsg.textContent = message;
        if (isError) { addClass(_dom.statusMsg, 'is-error'); }
        else         { removeClass(_dom.statusMsg, 'is-error'); }
    }

    function clearStatus() {
        _dom.statusMsg.textContent = '';
        removeClass(_dom.statusMsg, 'is-error');
    }

    function enterSavingState() {
        addClass(document.body, 'is-saving');
        _dom.loadingIndicator.style.display = 'inline';
        _dom.btnSaveAll.disabled    = true;
        _dom.btnAddInvoice.disabled = true;
    }

    function exitSavingState() {
        removeClass(document.body, 'is-saving');
        _dom.loadingIndicator.style.display = 'none';
        _dom.btnSaveAll.disabled    = false;
        _dom.btnAddInvoice.disabled = false;
    }

    /* ════════════════════════════════════════════════════════════════════════
       TEMPLATE CLONING
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Clones the invoice panel from the <script type="text/html"> template.
     * Uses innerHTML on a wrapper div — safe for full block-level HTML.
     * @returns {HTMLElement}
     */
    function clonePanelTemplate() {
        var script  = document.getElementById('invoicePanelTemplate');
        var wrapper = document.createElement('div');
        wrapper.innerHTML = script.text || script.innerHTML;
        return wrapper.firstElementChild;
    }

    /**
     * Clones a line row from the <script type="text/html"> row template.
     * Must be wrapped in a table+tbody for correct <tr> parsing in IE.
     * @returns {HTMLElement}  The <tr> element
     */
    function cloneRowTemplate() {
        var script    = document.getElementById('rowTemplate');
        var table     = document.createElement('table');
        var tbody     = document.createElement('tbody');
        tbody.innerHTML = script.text || script.innerHTML;
        table.appendChild(tbody);
        return tbody.removeChild(tbody.firstElementChild);
    }

    /* ════════════════════════════════════════════════════════════════════════
       HELPERS
       ════════════════════════════════════════════════════════════════════════ */

    function parseQueryString(queryString) {
        var result = {};
        var qs     = (queryString || '').replace(/^\?/, '');
        if (!qs) { return result; }
        var pairs  = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            if (pair.length >= 2) {
                result[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
        }
        return result;
    }

    function roundToTwo(value) {
        return Math.round(value * 100) / 100;
    }

    /**
     * Formats a number with 2 decimal places and comma thousands separator.
     * Does not use toLocaleString (IE options support is unreliable).
     * @param {number} value
     * @returns {string}
     */
    function formatNumber(value) {
        var fixed = value.toFixed(2);
        var parts = fixed.split('.');
        var whole = parts[0];
        var dec   = parts[1];
        var out   = '';
        var len   = whole.length;

        for (var i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 === 0) { out += ','; }
            out += whole[i];
        }

        return out + '.' + dec;
    }

    function hasClass(el, className) {
        if (!el || !el.className) { return false; }
        return (' ' + el.className + ' ').indexOf(' ' + className + ' ') !== -1;
    }

    function addClass(el, className) {
        if (!el) { return; }
        if (!hasClass(el, className)) {
            el.className = (el.className + ' ' + className).trim();
        }
    }

    function removeClass(el, className) {
        if (!el || !el.className) { return; }
        var parts  = el.className.split(' ');
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] !== className) { result.push(parts[i]); }
        }
        el.className = result.join(' ');
    }

    /* ── Bootstrap ──────────────────────────────────────────────────────── */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}(InvoiceGrid.Config, InvoiceGrid.InvoiceDataService));
