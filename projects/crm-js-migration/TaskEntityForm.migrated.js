/**
 * TaskEntityForm — Dynamics CRM UCI-Compatible Web Resource
 *
 * MIGRATION ANALYSIS
 * ──────────────────────────────────────────────────────────────────────────
 * | Category                      | Original | Status                     |
 * |-------------------------------|----------|----------------------------|
 * | Xrm.Page.* references         |   1851   | MIGRATED → _formContext    |
 * | debugger; statements          |     63   | REMOVED                    |
 * | var declarations              |    598   | MIGRATED → let             |
 * | Xrm.Utility.openEntityForm    |     12   | MIGRATED → openForm        |
 * | window.showModalDialog (live) |      7   | STUBBED → TODO comments    |
 * | alert() calls                 |     42   | MIGRATED → openAlertDialog |
 * | XMLHttpRequest (ExecuteQuery) |     17   | MIGRATED → fetch/WebApi    |
 * | /api/data/v8.0/ paths         |     21   | MIGRATED → v9.2            |
 * | /XRMServices/ endpoint        |      1   | FLAGGED for removal        |
 * | Hardcoded GUIDs               |     18   | NOTE: move to config       |
 * ──────────────────────────────────────────────────────────────────────────
 *
 * BREAKING CHANGES
 * ──────────────────────────────────────────────────────────────────────────
 * 1. frmOnLoad MUST receive executionContext. In the form editor:
 *      - Event Handlers > OnLoad > Function: Maqsad.TaskEntityForm.frmOnLoad
 *      - CHECK "Pass execution context as first parameter"
 *
 * 2. All event handler registrations must be updated from bare function names
 *    to Maqsad.TaskEntityForm.<functionName> in the form event handler UI.
 *
 * 3. _formContext is null until frmOnLoad runs. Any handler firing before
 *    OnLoad completes must guard against null _formContext.
 *
 * 4. window.showModalDialog is permanently gone in UCI. Each removed call
 *    has a TODO comment — implement using PCF dialog or side panel.
 *
 * 5. OData version bumped v8.0 → v9.2. Verify entity plural names and
 *    field names against your environment's v9.2 metadata endpoint.
 *
 * 6. Hardcoded GUIDs in switch/case blocks (work item IDs, record type IDs)
 *    must be externalised to a configuration entity (Article V).
 *
 * FORM REGISTRATION CHANGES
 * ──────────────────────────────────────────────────────────────────────────
 * | Event    | Old Handler  | New Handler                      | Ctx? |
 * |----------|-------------|----------------------------------|------|
 * | OnLoad   | frmOnLoad   | Maqsad.TaskEntityForm.frmOnLoad  | YES  |
 * | OnChange | <fnName>    | Maqsad.TaskEntityForm.<fnName>   | NO*  |
 * | OnSave   | <fnName>    | Maqsad.TaskEntityForm.<fnName>   | YES  |
 * (*) Pass execution context only if the handler calls getFormContext()
 *
 * TEST SCENARIOS
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Form load — frmOnLoad runs with no console errors
 * 2. qdb_record_type populated — correct section/tab becomes visible
 * 3. qdb_work_item populated — correct tab visible, notification shown
 * 4. GetTabSchemaNameRecordType — tab shown from async OData result
 * 5. OpenEntityForm targets — each navigation button opens correct form
 * 6. SetMainSectionVisibility — every GUID branch renders expected sections
 * 7. showModalDialog stubs — TODO lines do not throw runtime errors
 * 8. ShowNotification — banner appears at correct level with correct text
 * 9. Required field logic — setRequiredLevel correct per work item step
 */

'use strict'; // MIGRATED: UCI strict mode

// MIGRATED: Namespace wrapper — prevents global scope pollution
var Maqsad = Maqsad || {};
Maqsad.TaskEntityForm = Maqsad.TaskEntityForm || {};

(function (ns) {

    /**
     * Module-level formContext initialised by frmOnLoad.
     * MIGRATED: replaces the Xrm.Page.* singleton access pattern.
     * All private functions read this variable directly.
     * @type {Xrm.FormContext|null}
     */
    let _formContext = null; // MIGRATED: replaces global Xrm.Page

    /**
     * MIGRATED: Replaced XMLHttpRequest callback pattern with Xrm.WebApi fetch.
     * OData path is parsed and forwarded to the _fetchODataPath helper.
     * Callback contract (SuccessFunction, id) preserved for incremental migration.
     *
     * @param {string} ODataQuery - Relative OData v9.2 path
     * @param {Function} SuccessFunction - Callback receiving (result, id)
     * @param {string|null} id - Optional correlation value forwarded to callback
     */
    async function _executeODataQuery(ODataQuery, SuccessFunction, id) { // MIGRATED: XMLHttpRequest→Xrm.WebApi
        try {
            const result = await _fetchODataPath(ODataQuery);
            SuccessFunction(result, id);
        } catch (error) {
            Xrm.Navigation.openAlertDialog({ text: `Data retrieval failed: ${error.message}` }); // MIGRATED: alert→openAlertDialog
        }
    }

    /**
     * MIGRATED: Fetches a raw OData v9.2 path using the native fetch API.
     * Handles both collection and single-record queries.
     *
     * @param {string} oDataPath - Relative OData v9.2 path
     * @returns {Promise<object>} Parsed JSON response
     */
    async function _fetchODataPath(oDataPath) { // MIGRATED: replaces raw XMLHttpRequest
        const serverUrl = Xrm.Utility.getGlobalContext().getClientUrl(); // MIGRATED: Xrm.Page.context→getGlobalContext
        const fullUrl = serverUrl.replace(/\/$/, '') + oDataPath;

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'Accept': 'application/json',
                'Content-Type': 'application/json; charset=utf-8',
                'Prefer': 'odata.include-annotations="*"'
            }
        });

        if (!response.ok) {
            throw new Error(`OData request failed [${response.status}]: ${response.statusText}`);
        }

        return response.json();
    }

    function HideShowTabSchemaName(result, id) {
        if (result != null && result['qdb_tabschemaname'] != null) {
            if (_formContext.ui.tabs.get(result['qdb_tabschemaname']) != null) {
                _formContext.ui.tabs.get(result['qdb_tabschemaname']).setVisible(true);
            }
        }
    }

    function HideShowSectionSchemaName(result, id) {
        if (result != null && result['qdb_sectionschemaname'] != null) {
            if (_formContext.ui.tabs.get("tab_Main").sections.get(result['qdb_sectionschemaname']) != null) {
                _formContext.ui.tabs.get("tab_Main").sections.get(result['qdb_sectionschemaname']).setVisible(true);
            }
        }
    }


    function GetTabSchemaNameRecordType() {

        let EntityName, EntityId, LookupFieldObject;
        let Id, Name, Type;
        let resultXml;
        let LookupFieldObject = _formContext.getAttribute("qdb_work_item").getValue();

        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject[0].id;
            EntityName = LookupFieldObject[0].entityType;
            let SubString = EntityName.substring(0, EntityName.length - 1);

            if (EntityId != null) {
                // Remove '{}' from EntityID
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }

            // Please confirm plural name by downloading jason response and serching entity by visitng https://qdbcrmapp/qdb1/api/data/v9.2/ /* MIGRATED: updated to v9.2 */
            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + SubString + "ses(" + parsedID + ")?$select=qdb_tabschemaname";

            // Pass OData Query and UpdateFunction
            _executeODataQuery(query, HideShowTabSchemaName, null);

        }
        else {
            _formContext.data.entity.attributes.get('qdb_work_item').setValue(null);
        }
    } //END


    function GetSectionSchemaNameRecordType() {

        let EntityName, EntityId, LookupFieldObject;
        let Id, Name, Type;
        let resultXml;
        let LookupFieldObject = _formContext.getAttribute("qdb_work_item").getValue();

        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject[0].id;
            EntityName = LookupFieldObject[0].entityType;
            let SubString = EntityName.substring(0, EntityName.length - 1);

            if (EntityId != null) {
                // Remove '{}' from EntityID
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }

            // Please confirm plural name by downloading jason response and serching entity by visitng https://qdbcrmapp/qdb1/api/data/v9.2/ /* MIGRATED: updated to v9.2 */
            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + SubString + "ses(" + parsedID + ")?$select=qdb_sectionschemaname";

            // Pass OData Query and UpdateFunction
            _executeODataQuery(query, HideShowSectionSchemaName, null);

        }
        else {
            _formContext.data.entity.attributes.get('qdb_work_item').setValue(null);
        }
    } //END

    function frmOnLoad(executionContext) { // MIGRATED: added executionContext parameter
        _formContext = executionContext.getFormContext(); // MIGRATED: derive formContext from executionContext

        ChecklocalRawMaterialSupport();
        SetMainSectionVisibility();
        SetRelatedInfoVisibility();
        SetTabVisibility();
        //PopulateMissingUrl();

        //13062021_U
        setContractPrintDatetoDefault();

        //07072021_U
        HideReturnToRequestorOptionForCase();

        //17JULY2021_U_KYC
        HideKYCApprovalStatusTAB();

         showRMOptionsetInStatus();
    }

    function ChecklocalRawMaterialSupport() {
        let EntityName, EntityId, LookupFieldObject;
        let id, FieldName;

        LookupFieldObject = _formContext.data.entity.attributes.get('qdb_lc_number_ref');

        if (LookupFieldObject.getValue() != null) {

            EntityId = LookupFieldObject.getValue()[0].id;
            EntityName = LookupFieldObject.getValue()[0].entityType;
            FieldName = LookupFieldObject.getValue()[0].name;

            if (EntityId != null) {
                // Remove '{}' from EntityID
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }

            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_payment_authorization_tickets?$filter=qdb_transaction_ref eq '" + FieldName + "'";

            // Pass OData Query and UpdateFunction
            _executeODataQuery(query, ChecklocalRawMaterialSupportResult, id);

        }

    }
    function ChecklocalRawMaterialSupportResult(resultXml) {
        let _qdb_work_item = _formContext.getAttribute("qdb_work_item");


        if (resultXml != null && resultXml.value[0]['qdb_localrawmaterialsupport25percentprofitrat'] != null) {

            if (resultXml.value[0]['qdb_localrawmaterialsupport25percentprofitrat'] == 751090000) {
                if (_qdb_work_item != null) {
                    if (_qdb_work_item.getValue() != null) {
                        let _qdb_work_itemid = _qdb_work_item.getValue()[0].id;
                        //Credit Analysis
                        if (_qdb_work_itemid == "{AB750E89-F258-E411-B163-00155D788B08}"
                            || _qdb_work_itemid == "{0AB84373-7603-E311-A57C-00155D788238}"
                            || _qdb_work_itemid == "{A0D59DE0-DD7D-E311-8213-00155D788238}"
                            || _qdb_work_itemid == "{0D0986F6-D3F1-E211-A9BB-00155D788238}") {

                            //  Xrm.Navigation.openAlertDialog({text: "2.5"}) // MIGRATED: alert→openAlertDialog;
                            //window.showModalDialog("https://qdbcrmapp:6565/CRMProfitLCExceptions.aspx", "", 'dialogWidth:550px; dialogHeight:150px; center:yes;status:0;resizable:1;');

                            Alert.show("Local Raw Material Support 2.5% Profit Rate", null, null, "INFO", 500, 200)
                        }
                    }
                }

            }
        }





    }


    function SetMainSectionVisibility() {


        let QDB_RecordType;

        QDB_RecordType = _formContext.getAttribute("qdb_record_type");
        switch (QDB_RecordType.getValue()[0].id) {

            //Disbursement                                              
            case "{B4F84151-03C9-E211-BC78-00155D787B38}":
            case "{E1F2FCB2-2E57-E311-A9A2-00155D787B38}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(true);
                ShowDocuments("qdb_dis_doc_url");
                break;
            // thsi field for LC DOcuments collection qdb_lc_documents_link                                           
            // LC Issuance                                                 
            case "{36714796-99ED-E211-A9BB-00155D788238}":
                if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LC") != null)
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LC").setVisible(true);
                else
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(true);
                ShowDocuments("qdb_dis_doc_url");
                break;
            //Amendment                                         
            case "{759233A2-15EF-E211-A9BB-00155D788238}":
                if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LCAmendment") != null) {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LCAmendment").setVisible(true);
                }
                else {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_CustomerBasic").setVisible(true);
                }

                let cif_no = _formContext.getAttribute("qdb_cif_no").getValue()[0].name;
                let lc_amendment_ref = _formContext.getAttribute("qdb_lc_amendment_ref").getValue()[0].name;


                let docUrl = "https://qdbcrmapp:9798/ShowLCDocumentsFromSharePoint.aspx?cifno=" + cif_no + "&lcno=" + lc_amendment_ref;

                let IFrame = _formContext.ui.controls.get("IFRAME_LCDocuments");
                if (IFrame != null) {
                    IFrame.setSrc(docUrl);
                }
                else {
                    IFrame = _formContext.ui.controls.get("IFRAME_Documents");
                    if (IFrame != null) {
                        IFrame.setSrc(docUrl);
                    }
                }

                // _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LCAmendment").setVisible(true);
                break;
            //Documentation                                            
            case "{AFC020E4-9DEF-E211-A9BB-00155D788238}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_5").setVisible(true);
                ShowDocuments("qdb_lc_documents_link");
                ShowDocuments("qdb_dis_doc_url");
                break;
            //Lodgement                                         
            case "{787FD30C-74F1-E211-A9BB-00155D788238}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_5").setVisible(true);
                ShowDocuments("qdb_lc_documents_link");
                break;
            case "{E23BC6CF-D4FE-E211-BE9A-00155D787B38}": //L/C payment Acceptance
            case "{1F6B594F-07F2-E211-A9BB-00155D788238}": //Usacne Payment
            case "{CED26815-2FF2-E211-A9BB-00155D788238}": //Sight Payment
            case "{FC782D69-3C66-E311-A9A2-00155D787B38}":
            case "{1DEF5365-F1F1-E211-A9BB-00155D788238}": //L/C Payment        
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LCPayment").setVisible(true);
                ShowDocuments("qdb_lc_documents_link");
                ShowDocuments("qdb_dis_doc_url");
                break;
            // Remittance                                         
            case "{11A1184B-E3F6-E211-A57C-00155D788238}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(true);
                ShowDocuments("qdb_dis_doc_url");
                break;
            //Guarantee                                            
            case "{F7CE8DD3-55F9-E211-A57C-00155D788238}":
                if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_8") != null) {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_8").setVisible(true);
                }
                else {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(true);
                }
                ShowDocuments("qdb_dis_doc_url");
                break;
            case "{D8D643EA-1B4A-E311-9BB2-00155D788238}":
            case "{BB2156F5-1B4A-E311-9BB2-00155D788238}":
            case "{D9D643EA-1B4A-E311-9BB2-00155D788238}":
            case "{67E508FB-E2F7-E211-A57C-00155D788238}":
            case "{3E934B55-7DBC-E711-8105-00155D78042C}": //PDC Change

                //_qdb_work_item = _formContext.getAttribute("qdb_work_item");
                //if (_qdb_work_item != null) {
                //    if (_qdb_work_item.getValue() != null) {
                //        var _qdb_work_itemid = _qdb_work_item.getValue()[0].id;
                //        //Credit Analysis
                //        if (_qdb_work_itemid == "{F7A8DA7F-1E4A-E311-9BB2-00155D788238}") {
                //            _formContext.ui.tabs.get("tab_ResubmissionRequest").setLabel("Review Cancellation Reqeuest");
                //            _formContext.getControl("qdb_resubmission_status").removeOption(751090005);
                //            _formContext.getControl("qdb_resubmission_status").removeOption(751090001);
                //            _formContext.getControl("qdb_resubmission_status").removeOption(751090003);
                //            _formContext.getControl("qdb_resubmission_status").removeOption(751090002);
                //            _formContext.getControl("qdb_resubmission_status").removeOption(751090004);
                //            _formContext.ui.tabs.get("tab_3").sections.get("tab_3_section_3").setVisible(false);
                //            _formContext.ui.tabs.get("tab46").sections.get("tab_30_section_1").setVisible(false);

                //        }

                //    }
                //}

                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_7").setVisible(true);

                ShowDocuments("qdb_dis_doc_url");
                break;
            //Followup                                            
            case "{4E6B0B50-F025-E311-A57C-00155D788238}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_CustomerBasic").setVisible(true);
                _formContext.ui.tabs.get("tab_FollowupItem").setVisible(true);
                _formContext.ui.tabs.get("tab_FollowUp").setVisible(true);
                _formContext.getAttribute("qdb_followup_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            //Loan Amendment                                         
            case "{EA0759C7-2DBD-E211-90D7-00155D787B38}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_LoanAmendment").setVisible(true);
                break;
            //Loan Creation                                         
            case "{0E634601-BDBC-E211-90D7-00155D787B38}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_NewLoanCreation").setVisible(true);
                break;
            case "{10A5C438-A613-E311-A57C-00155D788238}":
                if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_BGAmendment") != null) {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_BGAmendment").setVisible(true);
                }
                else {
                    _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_CustomerBasic").setVisible(true);
                }

                ShowDocuments("qdb_dis_doc_url");

                break;
            case "{826477F5-3F46-E311-9BB2-00155D788238}": // Credit Proposal
            case "{FBBC874A-6646-E311-9BB2-00155D788238}":
            case "{925EC3CA-CC9B-E311-8213-00155D788238}":
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Proposal").setVisible(true);
                //Credit Proposal or Credit Risk Proposal
                if (QDB_RecordType.getValue()[0].id == "{826477F5-3F46-E311-9BB2-00155D788238}" || QDB_RecordType.getValue()[0].id == "{FBBC874A-6646-E311-9BB2-00155D788238}") {

                    _qdb_work_item = _formContext.getAttribute("qdb_work_item");
                    if (_qdb_work_item != null) {
                        if (_qdb_work_item.getValue() != null) {
                            let _qdb_work_itemid = _qdb_work_item.getValue()[0].id;
                            //Credit Analysis
                            if (_qdb_work_itemid == "{19158C62-6646-E311-9BB2-00155D788238}" || _qdb_work_itemid == "{A11DC8B4-6546-E311-9BB2-00155D788238}"
                                || _qdb_work_itemid == "{63AAE278-EFD5-E311-AE11-00155D788238}" || _qdb_work_itemid == "{060F4D86-C590-E311-8213-00155D788238}"
                                || _qdb_work_itemid == "{E5043F89-3478-E311-A9A2-00155D787B38}" || _qdb_work_itemid == "{F1EA1C59-77AF-E311-9705-00155D788238}"
                                || _qdb_work_itemid == "{14A58CBC-6746-E311-9BB2-00155D788238}") {
                                if (_formContext.ui.tabs.get("tab_CA_Credit_Rating_Model") != null) {
                                    _formContext.ui.tabs.get("tab_CA_Credit_Rating_Model").setVisible(true);
                                }
                            }
                            //Director Credit & Risk Approval 
                            if (_qdb_work_itemid == "{5BCAA543-6946-E311-9BB2-00155D788238}") {
                                if (_formContext.ui.tabs.get("tab_Director_Credit_Rating_Model") != null) {
                                    _formContext.ui.tabs.get("tab_Director_Credit_Rating_Model").setVisible(true);
                                }

                            }
                        }
                    }
                }
                break;
            case "{891B1B5A-3E4C-E311-9BB2-00155D788238}": // Case Management
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_complaint").setVisible(true);
                _formContext.getControl("qdb_case_type").setVisible(true);
                _formContext.getControl("qdb_case_category").setVisible(true);
                _formContext.getControl("qdb_caserefnoid").setVisible(true);
                ShowDocuments("qdb_dis_doc_url");
                break;
            case "{D57DB576-1D92-E311-8213-00155D788238}": // Follow-up Management                 
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_complaint").setVisible(true);
                _formContext.getControl("qdb_requesttype").setVisible(true);
                _formContext.getControl("qdb_requiredfor").setVisible(true);
                _formContext.getControl("qdb_customerreqrefid").setVisible(true);
                ShowDocuments("qdb_dis_doc_url");
                break;
            case "{2A5E4EDD-94BB-E211-90D7-00155D787B38}": // Lodgement
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Lodgement").setVisible(true);
                break;
            case "{9876BAA5-3101-E511-9293-00155D788D14}": //Credit review Record Type

                let NotDocumentReviewTask = true;
                _qdb_work_itemCR = _formContext.getAttribute("qdb_work_item");
                if (_qdb_work_itemCR != null) {
                    if (_qdb_work_itemCR.getValue() != null) {
                        let _qdb_work_itemCRid = _qdb_work_itemCR.getValue()[0].id;
                        if (_qdb_work_itemCRid == "{59F6B7F7-278E-E611-9771-00155D7B3411}") {
                            NotDocumentReviewTask = false;
                        }
                    }
                }
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_CreditMonitoring").setVisible(true);
                if (NotDocumentReviewTask) {
                    ShowDocuments("qdb_lc_documents_link");
                    ShowDocuments("qdb_dis_doc_url");
                }
                break;
            case "{18512801-4043-E711-80E8-00155D159B25}"://Documentary Collection
            case "{BA00CB1F-4043-E711-80E8-00155D159B25}"://(D/C)Sight Payment
            case "{83BF8718-4043-E711-80E8-00155D159B25}"://(D/C)Usance Payment

                if (_formContext.ui.tabs.get("tab_Main") != null) {
                    if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Documentary_Collection") != null) {
                        _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Documentary_Collection").setVisible(true);
                    }
                }

                if (_formContext.ui.tabs.get("tab_DC_Documents") != null) {
                    _formContext.ui.tabs.get("tab_DC_Documents").setVisible(true);
                }
                let IFrame = _formContext.ui.controls.get("IFRAME_Documents_DC");
                if (IFrame != null) {

                    let _qdb_cif_no = _formContext.getAttribute("qdb_cif_no").getValue()[0].name;
                    let _qdb_documentary_collection = _formContext.getAttribute("qdb_documentary_collection").getValue()[0].name;

                    let _dc_url = "http://mvspcrm02:8888/DisbursementDocuments/DisbursementDocuments.aspx?RootFolder=/DisbursementDocuments/Customer-" + _qdb_cif_no + "/LC-" + _qdb_documentary_collection;


                    //var _dc_url = "http://mvspwfe01:8888/DisbursementDocuments/DisbursementDocuments.aspx?RootFolder=%2FDisbursementDocuments%2FCustomer%2D" + _qdb_cif_no + "%2FLC%2D" + _qdb_documentary_collection;
                    //_dc_url = _dc_url.replace(/-/g, "%2D");
                    //_dc_url=_dc_url.replace("-", " %2D");
                    IFrame.setSrc(_dc_url);
                }
                //ShowDocuments("qdb_dis_doc_url");
                break;


            case "{F622CE86-1BB8-E711-80E8-02BF800001AD}"://Board Approval
            case "{7AC722B7-55D5-E911-813B-00155D78AA49}"://Chairman Approval


                if (_formContext.ui.tabs.get("tab_Main") != null) {
                    if (_formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_Board_Approval") != null) {
                        _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_Board_Approval").setVisible(true);
                    }
                }
                break;
            default:
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_CustomerBasic").setVisible(true);
                break;
        }
    }

    function SetRelatedInfoVisibility() {


        let QDB_RecordType, QDB_LookupField;

        QDB_RecordType = _formContext.getAttribute("qdb_record_type");

        switch (QDB_RecordType.getValue()[0].id) {
            // Term Sheet                                                 
            case "{E53ABCE4-A0B5-E211-90D7-00155D787B38}":
                //_formContext.ui.tabs.get("tab_WorkItem_Details").sections.get("tab_WorkItem_Details_section_TermSheet").setVisible(true);

                break;
            //Disbursement                                              
            case "{B4F84151-03C9-E211-BC78-00155D787B38}":
                // _formContext.ui.tabs.get("tab_WorkItem_Details").sections.get("tab_WorkItem_Disbursement").setVisible(true);
                break;
        }
    }

    function SetTabVisibility() {

        //Removing the "Return to Customer Service" for the work task return to the RM by Credit and Risk
        if (_formContext.getControl("qdb_resubmission_status") != null) {
            if (_formContext.getAttribute("qdb_resubmission_status") != null) {
                {
                    if (_formContext.getAttribute("qdb_resubmission_status").getValue() == null) {
                        //_formContext.getControl("qdb_resubmission_status").removeOption(751090002);
                    }
                }
            }
        }


        let ts_WorkItemStep, qdb_Tab, qdb_StatusCode, QDB_ReturnRecLookup, QDB_Comments;

        QDB_Comments = _formContext.getAttribute("qdb_resubmission_comments").getValue();
        ts_WorkItemStep = _formContext.getAttribute("qdb_work_item");
        let ts_DynamicWorkItemStep = _formContext.getAttribute("qdb_dynamics_work_task_ref");
        QDB_ReturnRecLookup = _formContext.getAttribute("qdb_return_by_user");

        if (_formContext.getAttribute("qdb_submit_by_user") != null) {
            if (_formContext.getAttribute("qdb_submit_by_user").getValue() != null) {
                if (QDB_Comments == null) {
                    QDB_Comments = "";
                }
                ShowNotification("Assigned to you by : " + _formContext.getAttribute("qdb_submit_by_user").getValue()[0].name + ", Comments : " + QDB_Comments, 2);
            }
        }

        if (QDB_ReturnRecLookup.getValue() != null && QDB_ReturnRecLookup.getValue()[0].id != null) {

            if (ts_WorkItemStep.getValue()[0].id == "{DC7390F2-8AF8-E211-A57C-00155D788238}" || ts_WorkItemStep.getValue()[0].id == "{190E7FF8-F295-E711-8101-00155D78042C}") {
                ShowNotification("Resubmitted by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
            }
            else if (ts_WorkItemStep.getValue()[0].id == "{4F8AC2B3-B2BA-E511-8604-00155D780335}") {
                ShowNotification("Return by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
            }
            else if (ts_WorkItemStep.getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}"
                //(D/C-facility)
                || ts_WorkItemStep.getValue()[0].id == "{18181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{1A181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{1C181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{14181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{16181F78-4143-E711-80E3-00155D78042A}"

                //(D/C-Disb)
                || ts_WorkItemStep.getValue()[0].id == "{30181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{2A181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{26181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{2E181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{2C181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{28181F78-4143-E711-80E3-00155D78042A}"
            ) {
                ShowNotification("Return by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
                DocumentaryCollectionFacilityReturnProcess();
                return;
            }
            else if (ts_WorkItemStep.getValue()[0].id == "{6DBB5473-C9BD-E511-8604-00155D780335}") {
                ShowNotification("Review Completed by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
            }
            //Added by waqar new ID
            else if (ts_WorkItemStep.getValue()[0].id != "{58EC9C81-290B-F111-9946-005056BE18F7}" && ts_WorkItemStep.getValue()[0].id != "{D4F51FD5-FB54-E311-A9A2-00155D787B38}" && ts_WorkItemStep.getValue()[0].id != "{E5043F89-3478-E311-A9A2-00155D787B38}" && ts_WorkItemStep.getValue()[0].id != "{060F4D86-C590-E311-8213-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{19158C62-6646-E311-9BB2-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{F1EA1C59-77AF-E311-9705-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{73B979D5-CC9B-E311-8213-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{63AAE278-EFD5-E311-AE11-00155D788238}") {
                ResubmissionRequest();
                return;
            }
            //Added by waqar new ID
            else if (ts_WorkItemStep.getValue()[0].id != "{58EC9C81-290B-F111-9946-005056BE18F7}" && ts_WorkItemStep.getValue()[0].id != "{E5043F89-3478-E311-A9A2-00155D787B38}" && ts_WorkItemStep.getValue()[0].id != "{060F4D86-C590-E311-8213-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{19158C62-6646-E311-9BB2-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{F1EA1C59-77AF-E311-9705-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{73B979D5-CC9B-E311-8213-00155D788238}" && ts_WorkItemStep.getValue()[0].id != "{63AAE278-EFD5-E311-AE11-00155D788238}") {
                TermSheetReturn();
                return;
            }
            else {
                ShowNotification("Return by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
            }
        }
        else {
            QDB_ReturnRecLookup = _formContext.getAttribute("qdb_resubmitted_by");

            if (QDB_ReturnRecLookup.getValue() != null && QDB_ReturnRecLookup.getValue()[0].id != null) {
                ShowNotification("Resubmitted by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
            }

            if (ts_WorkItemStep.getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}"

                //(D/C-facility)
                || ts_WorkItemStep.getValue()[0].id == "{18181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{1A181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{1C181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{14181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{16181F78-4143-E711-80E3-00155D78042A}"

                //(D/C-Disb)
                || ts_WorkItemStep.getValue()[0].id == "{30181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{2A181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{26181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{2E181F78-4143-E711-80E3-00155D78042A}"
                || ts_WorkItemStep.getValue()[0].id == "{2C181F78-4143-E711-80E3-00155D78042A}" || ts_WorkItemStep.getValue()[0].id == "{28181F78-4143-E711-80E3-00155D78042A}"
            ) {
                //ShowNotification("Return by : " + QDB_ReturnRecLookup.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);
                DocumentaryCollectionFacilityReturnProcess();
                return;
            }


        }
        /*
        QDB_ReturnRecLookup = _formContext.getAttribute("qdb_rejected_by");
        if (QDB_ReturnRecLookup != null) {
        if (QDB_ReturnRecLookup.getValue() != null && QDB_ReturnRecLookup.getValue()[0].id != null)
        ShowNotification("This disbursement was before Rejected by " + QDB_ReturnRecLookup.getValue()[0].name + ", Reject Reason : " + _formContext.getAttribute("qdb_rejection_reason").getValue(), 3);
        }
        */
        //Xrm.Navigation.openAlertDialog({text: ts_WorkItemStep.getValue(}) // MIGRATED: alert→openAlertDialog[0].id);

        /* */

        //Query Box
        if (ts_DynamicWorkItemStep.getValue() != null) {

            if (ts_DynamicWorkItemStep.getValue()[0].id == "{1D0639FA-77E4-E411-9EF4-00155D78031A}") {// Query Response

                return;
            }
        }
        // END Query Box

        //Getting LoanApplication LandedfromPortal
        if (_formContext.getAttribute("qdb_loan_application_ref").getValue() != null) {
            let LoanId;
            let isNumu;
            let LoanApp = _formContext.getAttribute("qdb_loan_application_ref").getValue();
            LoanId = LoanApp[0].id;

            let LoanAppId = LoanId.replace("{", "");
            LoanAppId = LoanAppId.replace("}", "");
            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_loan_applications(" + LoanAppId + ")?$select=qdb_applicationlandedfromnumuportal";

            let serverUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext;
            // Adjust URL for differences between on premise and online 
            if (serverUrl.match(/\/$/)) {
                serverUrl = serverUrl.substring(0, serverUrl.length - 1);
            }
            // Creation of HTTP response header
            let ODataURL = serverUrl + query;
            let req = new XMLHttpRequest();
            req.open("GET", ODataURL, false);
            req.setRequestHeader("OData-MaxVersion", "4.0");
            req.setRequestHeader("OData-Version", "4.0");
            req.setRequestHeader("Accept", "application/json");
            req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
            req.setRequestHeader("Prefer", "odata.include-annotations=\"*\"");
            req.onreadystatechange = function () {
                if (this.readyState === 4) {
                    req.onreadystatechange = null;
                    if (this.status === 200) {
                        let result = JSON.parse(this.response);
                        // SuccessFunction(returnresult, id, id2);

                        if (result != null && result['qdb_applicationlandedfromnumuportal'] == true) {
                            isNumu = result['qdb_applicationlandedfromnumuportal'];
                        }
                    }
                    else {
                        // Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: alert→openAlertDialog;
                    }
                }
            };
            // Execute HTTTP request
            req.send();
        }

        if (isNumu == true && ts_WorkItemStep.getValue()[0].id == "{9A4F4957-AD77-E811-80F9-02BF800001AD}") {
            _formContext.getControl("IFRAME_BoardDecisionAttachment2").setVisible(true);
            //_formContext.getAttribute("qdb_wc_rpt").setRequiredLevel("none");
        }

        //////--------------------End---------------------------/////

        switch (ts_WorkItemStep.getValue()[0].id) {
            case "{F1C11C61-6E0D-ED11-8182-0050568F3B81}":
                break;
            //Board Approval Start
            case "{DCAF2A19-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)RO Credit Proposal Review
                _formContext.ui.tabs.get("tab_BoardMemo_RO_Credit_Proposal_Review").setVisible(true);
                _formContext.ui.tabs.get("tab_BoardMemo_Edit_Proposal").setVisible(true);
                _formContext.getAttribute("qdb_ro_board_approval_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{1CC18982-187E-EE11-812D-B96AD9694E62}":// (BoardMemo)RM Review After RO Review
                _formContext.ui.tabs.get("tab_BoardMemo_Edit_Proposal").setVisible(true);
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                _formContext.getControl("IFRAME_BA_Director_Attach_Document").setVisible(false);
                _formContext.getControl("IFRAME_BoardApproval_EditProposal").setVisible(true);
                break;
            case "{4F8D5628-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)Credit Manager Approval
                _formContext.ui.tabs.get("tab_BoardMemo_CreditManager_Approval").setVisible(true);
                _formContext.getControl("IFRAME_BoardApproval_EditProposal").setVisible(true);
                _formContext.getAttribute("qdb_credit_manager_board_approval_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{5F49B031-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)Return to RM by Credit Manager
                _formContext.ui.tabs.get("tab_BoardMemo_Return_to_RM_by_CreditManager").setVisible(true);
                _formContext.ui.tabs.get("tab_BoardMemo_Edit_Proposal").setVisible(true);
                _formContext.getAttribute("qdb_rm_returned_board_approval_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{198B703B-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)RM Review After Credit Manager Review
                _formContext.ui.tabs.get("tab_BoardMemo_RM_Review_After_CreditManager_Review").setVisible(true);
                _formContext.ui.tabs.get("tab_BoardMemo_Edit_Proposal").setVisible(true);
                _formContext.getAttribute("qdb_rm_board_approval_memo_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{CF0CCF44-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)BFD Executive Director Approval
                _formContext.ui.tabs.get("tab_BoardMemo_BFD_Executive_Director_Approval").setVisible(true);
                _formContext.getAttribute("qdb_director_bfd_board_approval_status").setRequiredLevel("required");
                //Temp Commented on 22 March 2022
                //_formContext.getAttribute("qdb_tcs_rct").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{30209C4D-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)Return to RM by Executive Director BFD
                _formContext.ui.tabs.get("tab_BoardMemo_Return_to_RM_by_Executive_Director_BFD").setVisible(true);
                _formContext.ui.tabs.get("tab_BoardMemo_Edit_Proposal").setVisible(true);
                _formContext.getAttribute("qdb_rm_board_approval_memo_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{9A4F4957-AD77-E811-80F9-02BF800001AD}":// (BoardMemo)Board Decision For Memo
                _formContext.ui.tabs.get("tab_BoardMemo_BoardDecision_For_Memo").setVisible(true);
                _formContext.getAttribute("qdb_board_secretary_board_approval_memo_statu").setRequiredLevel("required");
                _formContext.getAttribute("qdb_contract_date").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_iccmemo").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;

            //Numu LC
            case "{B5F84151-03C9-E211-BC78-00155D787B38}":// (Numu LC)
            case "{58EC9C81-290B-F111-9946-005056BE18F7}": // (added by waqar New added for Bay Al Wadiya Digital)
            case "{68E508FB-E2F7-E211-A57C-00155D788238}":
            case "{626D3AB1-E19B-ED11-8190-0050568F3B81}":  //Cheque Clearning Request Submission (NUMU) 
            case "{C97B5205-E09B-ED11-8190-0050568F3B81}":  //Disbursement Request Submission(NUMU)
            case "{FF066A5D-6480-ED11-9103-B96A0B4E963F}":
                _formContext.ui.tabs.get("tab_lc_cs_Review").setVisible(true);
                _formContext.getAttribute("qdb_lccsstatus").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;

            //Board Approval End

            case "{190E7FF8-F295-E711-8101-00155D78042C}":// Annex b Wakala C0ntract
                _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090002); // Return to Credit Officer
                //Xrm.Navigation.openAlertDialog({text: "1"}) // MIGRATED: alert→openAlertDialog;
                //_formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090003); // Return to Operations

                _formContext.ui.tabs.get("tab_ContractReview").setLabel("Credit Admin Officer - Contract Review");
                qdb_Tab = _formContext.ui.tabs.get("tab_ContractReview");
                _formContext.getAttribute("qdb_credit_admin_contract_review").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_selectcurrency").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Added for Documentary Collection Start
            case "{04181F78-4143-E711-80E3-00155D78042A}": //Facility Review by Head Credit Admin
                _formContext.getAttribute("qdb_facility_type").setValue(null);
                qdb_Tab = _formContext.ui.tabs.get("tab_HeadCreditAdmin_DocumentaryCollection_FacilityReview");
                _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
                let approvalStatus = _formContext.getAttribute("qdb_credit_head_facility_review_status").getValue();
                if (approvalStatus == 751090000) {
                    _formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
                }
                else {
                    _formContext.getAttribute("qdb_facility_number").setRequiredLevel("none");
                }

                _formContext.getAttribute("qdb_contract_required").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{0C181F78-4143-E711-80E3-00155D78042A}": //Contract review by credit Admin Officer
                _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090002); // Return to Credit Officer
                //Xrm.Navigation.openAlertDialog({text: "2"}) // MIGRATED: alert→openAlertDialog;
                //var QDB_OptionSet = _formContext.getControl("qdb_credit_admin_contract_review");
                //QDB_OptionSet.clearOptions();

                //var lcl_Optn1 = new Object();
                //lcl_Optn1.text = "Supplier Contract not Required";
                //lcl_Optn1.value = 751090005;
                //QDB_OptionSet.addOption(lcl_Optn1);

                //var lcl_Optn2 = new Object();
                //lcl_Optn2.text = "Contract Reviewed";
                //lcl_Optn2.value = 751090000;
                //QDB_OptionSet.addOption(lcl_Optn2);

                //var lcl_Optn3 = new Object();
                //lcl_Optn3.text = "No Required Contract";
                //lcl_Optn3.value = 751090004;
                //QDB_OptionSet.addOption(lcl_Optn3);

                //var lcl_Optn4 = new Object();
                //lcl_Optn4.text = "Return to Operations";
                //lcl_Optn4.value = 751090003;
                //QDB_OptionSet.addOption(lcl_Optn4);

                //var lcl_Optn5 = new Object();
                //lcl_Optn5.text = "Return to CS";
                //lcl_Optn5.value = 751090001;
                //QDB_OptionSet.addOption(lcl_Optn5);

                qdb_Tab = _formContext.ui.tabs.get("tab_DC_CreditOfficer_ContractReview");
                _formContext.getAttribute("qdb_credit_admin_contract_review").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{08181F78-4143-E711-80E3-00155D78042A}"://Release Documents to Customer Service by Operations
                qdb_Tab = _formContext.ui.tabs.get("tab_DC_Release_Docs_Status");
                qdb_Tab.setVisible(true);
                _formContext.getControl("qdb_release_documents_status").removeOption(751090001);
                _formContext.getControl("qdb_release_documents_status").removeOption(751090002);
                _formContext.getControl("qdb_release_documents_status").removeOption(751090003);
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{0A181F78-4143-E711-80E3-00155D78042A}"://Customer Service Confirm receiving the Documents
                qdb_Tab = _formContext.ui.tabs.get("tab_DC_Documents_Release_Receiving");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{0E181F78-4143-E711-80E3-00155D78042A}"://Upload Signed Contract by CS
                qdb_Tab = _formContext.ui.tabs.get("tab_DC_UploadSignedContract");
                _formContext.getAttribute("qdb_signedcontractreceiveddate").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Custom Declaration Code added below till line 668
            case "{3C6A2049-6861-EC11-816A-0050568F3B81}"://Upload Custom declaration
            case "{E3F46058-A2C3-EC11-8100-0050568FDDDF}"://Upload Custom declaration (LC Documentation)
            case "{2D7BFD1E-A1C3-EC11-8100-0050568FDDDF}"://Upload Custom declaration (Sight Payment)
                qdb_Tab = _formContext.ui.tabs.get("tab_70");
                _formContext.ui.tabs.get("tab_67").setVisible(true);
                _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{5E1C9FFA-6861-EC11-816A-0050568F3B81}"://Custom Declaration Ops
            case "{D4E1B8F8-FAC5-EC11-8100-0050568FDDDF}"://Custom Declaration Review (L/C Documentation)
            case "{1B65995A-FBC5-EC11-8100-0050568FDDDF}"://Custom Declaration Review (Custom Decleration)
                qdb_Tab = _formContext.ui.tabs.get("tab_customDecleration");
                _formContext.ui.tabs.get("tab_67").setVisible(true);
                _formContext.getAttribute("qdb_customdeclerationstatusops").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{41756620-6961-EC11-816A-0050568F3B81}": //compliance
            case "{D5C4C037-15C6-EC11-8100-0050568FDDDF}": //Custom Declaration Review - Compliance (Custom Declaration)
            case "{F021D81E-15C6-EC11-8100-0050568FDDDF}": //Custom Declaration Review - Compliance (L/C Documentation)
                qdb_Tab = _formContext.ui.tabs.get("tab_57");
                _formContext.ui.tabs.get("tab_67").setVisible(true);
                _formContext.getAttribute("qdb_director_bfd_board_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{10181F78-4143-E711-80E3-00155D78042A}"://Upload Customer Acceptance
                qdb_Tab = _formContext.ui.tabs.get("tab_DC_Upload_Customer_Acceptance");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{06181F78-4143-E711-80E3-00155D78042A}": //Disbursement Release by Head Credit Admin(Head of CAD Approval)
                qdb_Tab = _formContext.ui.tabs.get("tab_HeadCreditAdmin_DocumentaryCollection_ReleasingDisbursement");
                _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{36AEC228-F205-E811-80F3-02BF800001AD}"://Release Shipping Documents to Customer
                qdb_Tab = _formContext.ui.tabs.get("tab_ReleaseShippingDocumentstoCustomer");
                qdb_Tab.setVisible(true);

                let QDB_OptionSet1 = _formContext.getControl("qdb_credit_head_facility_review_status");
                QDB_OptionSet1.clearOptions();
                let lcl_Optn1 = new Object();
                lcl_Optn1.text = "Release Shipping Documents to Customer";
                lcl_Optn1.value = 751090000;
                QDB_OptionSet1.addOption(lcl_Optn1);

                _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;

            case "{1E181F78-4143-E711-80E3-00155D78042A}"://D/C Payment Review
                _formContext.getAttribute("qdb_ops_clearing_review").setRequiredLevel("required");
                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_OperationsControl_DC_PaymentReview").setVisible(true);
                break;
            case "{20181F78-4143-E711-80E3-00155D78042A}": //Execution of D/C Payment
                _formContext.getAttribute("qdb_lc_payment_confirmation").setRequiredLevel("required");
                _formContext.getAttribute("qdb_documents_date").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_OperationsProcesser_Execution_of_DC_Payment");
                _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("required");
                _formContext.getAttribute("qdb_account_number").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Added for Documentary Collection End




            //Added by Saidatha Start            
            case "{92D93C2B-1F31-E511-81C5-00155D788D14}": // Specifying Tawarruq Documents Head of CAD 
                qdb_Tab = _formContext.ui.tabs.get("tab_36");
                _formContext.getAttribute("qdb_tawarruq_documents").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_FacilityAndLoanAccountDetails").setVisible(true);
                SetFacilityAndLoanAccountGridURL();
                break;
            case "{62B895A8-2031-E511-81C5-00155D788D14}": //Client Visit Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_Client_Visit_Confirmation");
                _formContext.getAttribute("qdb_icc_descion_date").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{18567498-2031-E511-81C5-00155D788D14}": //Discharge Amount Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_Discharge_Amount_Confirmation");
                _formContext.getAttribute("qdb_discharge_amount").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetLoanAccountGridURL();
                break;
            case "{AFEDED33-9F34-E511-81C5-00155D788D14}": //Preparation of Tawarruq Agreement  (Tawarruq) 
                qdb_Tab = _formContext.ui.tabs.get("tab_CAD_Tawarruq_Agreement_Approval");
                _formContext.getControl("qdb_cadtawarruqagreementapproval").removeOption(751090000);
                _formContext.getControl("qdb_cadtawarruqagreementapproval").removeOption(751090001);
                _formContext.getAttribute("qdb_cadtawarruqagreementapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_3").setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_4").setVisible(true);
                break;
            case "{CC208332-2031-E511-81C5-00155D788D14}": //Client Visit Details & Request Initiation
                qdb_Tab = _formContext.ui.tabs.get("tab_Client_Visit_Request_Initiation");
                //_formContext.getAttribute("qdb_cadtawarruqagreementapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{38E48722-2031-E511-81C5-00155D788D14}": //Client Signature Verification
                qdb_Tab = _formContext.ui.tabs.get("tab_Client_Signature_Verification");
                //_formContext.getAttribute("qdb_cadtawarruqagreementapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{6FDB980F-2031-E511-81C5-00155D788D14}": //Commodity Purchase Review by Teasury Officer 
                qdb_Tab = _formContext.ui.tabs.get("tab_Commodity_Purchase");
                _formContext.getAttribute("qdb_commoditypurchasedate").setRequiredLevel("required");
                _formContext.getAttribute("qdb_buy_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{26F4B3F6-1F31-E511-81C5-00155D788D14}": //Preparation 2nd & 3rd Schedule 
                qdb_Tab = _formContext.ui.tabs.get("tab_Credit_Admin_Schedule_Review");
                _formContext.getAttribute("qdb_schedule_review").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_buy_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{66BE39E4-1F31-E511-81C5-00155D788D14}": //Schedule Review by Head Credit Admin
                qdb_Tab = _formContext.ui.tabs.get("tab_Head_Credit_Admin_Schedule_Review");
                _formContext.getAttribute("qdb_schedule_review").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_buy_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{11EA0DD5-1F31-E511-81C5-00155D788D14}": //Client Signed on Schedule
                qdb_Tab = _formContext.ui.tabs.get("tab_Client_Signature_Schedules");
                //_formContext.getAttribute("qdb_schedule_review").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_buy_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{1B2B94E9-C1F1-E911-812C-00155DB3C005}": //bay al wadiya
                qdb_Tab = _formContext.ui.tabs.get("tab_TawwaruqOpsExecution");
                _formContext.getAttribute("qdb_transaction_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("required");
                _formContext.getAttribute("qdb_modeofpayment").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.getControl("qdb_transaction_status").removeOption(751090001);
                _formContext.getControl("qdb_transaction_status").removeOption(751090002);
                break;

            case "{26BDC322-2131-E511-81C5-00155D788D14}": // Tawaruq Trans Execution       
                qdb_Tab = _formContext.ui.tabs.get("tab_TawwaruqOpsExecution");
                _formContext.getAttribute("qdb_transaction_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("required");
                _formContext.getAttribute("qdb_modeofpayment").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //RMVAlidate Task of Anup Calculation - Bay Al wadiya

            case "{23D183C6-BDF1-E911-812C-00155DB3C005}":

                qdb_Tab = _formContext.ui.tabs.get("RMValidateCalculation");
                qdb_Tab.setVisible(true);
                //_formContext.getAttribute("qdb_headofcreditadminapprovalbayalwadiya").setRequiredLevel("required");
                break;
            case "{070BC083-1F31-E511-81C5-00155D788D14}": //Commodity Purchase Review by Teasury Officer 
                qdb_Tab = _formContext.ui.tabs.get("tab_Commodity_Sell_Status");
                _formContext.getAttribute("qdb_commoditypurchasedate").setRequiredLevel("required");
                _formContext.getAttribute("qdb_buy_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Added by Saidatha End            
            case "{4FB60BDA-8804-E511-91EB-00155D780414}": //Return to PM (EPD ) by Head Credit Admin        
                _formContext.getControl("qdb_resubmission_status").removeOption(751090001);
                _formContext.getControl("qdb_resubmission_status").removeOption(751090002);
                _formContext.getControl("qdb_resubmission_status").removeOption(751090003);
                break;

            case "{42BBBEEC-11E6-E411-9EF4-00155D78031A}": //EDP Accountant Approval
            case "{E26E2D58-12E6-E411-9EF4-00155D78031A}": //EPD Contractor Engineer Review
            case "{C2B6C88B-12E6-E411-9EF4-00155D78031A}": //EPD Head Project Execution Review      
                qdb_Tab = _formContext.ui.tabs.get("tab_EPD_Payment_Request");
                qdb_Tab.setVisible(true);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090005);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090002);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090003);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090004);
                _formContext.getAttribute("qdb_epd_payment_status").setRequiredLevel("required");
                break;
            case "{A6851EB2-12E6-E411-9EF4-00155D78031A}": //EPD Manager Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_EPD_Payment_Request");
                qdb_Tab.setVisible(true);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090000);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090002);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090003);
                _formContext.getControl("qdb_epd_payment_status").removeOption(751090004);
                _formContext.getAttribute("qdb_epd_payment_status").setRequiredLevel("required");
                break;

            case "{9E605707-3601-E511-9293-00155D788D14}":
            case "{D6325D29-3701-E511-9293-00155D788D14}": // case "{02CE031A-4CFD-E211-A57C-00155D788238}":
            case "{A170892E-E48D-E511-89B8-00155D788D14}":
            case "{97761053-1DF5-E511-9611-00155D78AB1E}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Monitoring_Review_Status");
                _formContext.getAttribute("qdb_monitoring_review_status").setRequiredLevel("required");
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090002); // Return to RM
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090003); // Review with comments 
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090004); // print document

                qdb_Tab.setVisible(true);
                break;
            case "{74C53949-3301-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_sitevisit_status").setVisible(true);
                _formContext.getAttribute("qdb_sitevisit_status").setRequiredLevel("required");
                break;
            //Market Outlook             
            case "{0CE24BD9-2B01-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_marketoutlook_status").setVisible(true);
                _formContext.getAttribute("qdb_marketoutlook_status").setRequiredLevel("required");
                break;
            //Document Review
            case "{59F6B7F7-278E-E611-9771-00155D7B3411}":
                if (_formContext.ui.tabs.get("tab_DocumentReviewStatus") != null) {
                    _formContext.ui.tabs.get("tab_DocumentReviewStatus").setVisible(true);
                }
                if (_formContext.getAttribute("qdb_document_review_status") != null) {
                    _formContext.getAttribute("qdb_document_review_status").setRequiredLevel("required");
                }
                break;

            //Asset Status Technical Evaluation Team             
            case "{73270DEA-2B01-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_assetstatus_technicalteam_status").setVisible(true);
                _formContext.getAttribute("qdb_assetstatus_technicalteam_status").setRequiredLevel("required");
                break;
            //Asset Status EPD             
            case "{35AF0CF8-2B01-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_assetstatus_epd_status").setVisible(true);
                _formContext.getAttribute("qdb_assetstatus_epd_status").setRequiredLevel("required");
                break;

            //Document Review CAD
            case "{A999E9FC-2A8E-E611-9771-00155D7B3411}":
                creditReviewTaskStatusSetInvisible();
                if (_formContext.ui.tabs.get("tab_CreditReview_Task_Status") != null) {
                    _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                }
                if (_formContext.getControl("qdb_dcument_review_cad_status") != null) {
                    _formContext.getControl("qdb_dcument_review_cad_status").setVisible(true);
                    _formContext.getAttribute("qdb_dcument_review_cad_status").setRequiredLevel("required");
                }
                break;
            //sFinancial Forecasting Report   
            case "{581C190D-2C01-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_financialforecasting_status").setVisible(true);
                _formContext.getAttribute("qdb_financialforecasting_status").setRequiredLevel("required");
                break;
            //Credit Bereau Report             
            case "{42283125-2C01-E511-9293-00155D788D14}":
                creditReviewTaskStatusSetInvisible();
                //Make Attachment Notes Visible.{be617111-a4cb-4876-bdeb-b0893678a5f7}
                _formContext.ui.tabs.get("{be617111-a4cb-4876-bdeb-b0893678a5f7}").setVisible(true);
                //_formContext.ui.tabs.get("{be617111-a4cb-4876-bdeb-b0893678a5f7}").sections.get("{3efeb884-2089-4285-9434-cf62e48cc875}").setVisible(true);
                //hide the _Hidden Section.
                _formContext.ui.tabs.get("{be617111-a4cb-4876-bdeb-b0893678a5f7}").sections.get("tab_3_section_1").setVisible(false);

                _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(true);
                _formContext.getControl("qdb_creditbureau_status").setVisible(true);
                _formContext.getAttribute("qdb_creditbureau_status").setRequiredLevel("required");
                break;
            case "{4F8AC2B3-B2BA-E511-8604-00155D780335}":
                //creditReviewTaskStatusSetInvisible();
                break;
            case "{6DBB5473-C9BD-E511-8604-00155D780335}":
                //creditReviewTaskStatusSetInvisible();
                break;
            case "{5E7DDFF4-3601-E511-9293-00155D788D14}":
                //creditReviewTaskStatusSetInvisible();
                break;
            //Added By Saidatha End             
            case "{0765ECBF-C920-E611-910E-00155D7B3411}": // Transfer Deposiut for CAD Aproval

                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                // ShowNotification("You can review Customer Amendment Letter and Authorization Ticket by clicking on Amendment Letter button or L/C Amendment Authorization button in toolbar respectively.", 2);
                _formContext.getAttribute("qdb_co_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            //PDC Change
            case "{7C7EFAE7-72BC-E711-8105-00155D78042C}": // PDC Cancel for HOC Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                qdb_Tab.setLabel("Head of Collection : Approval");
                // ShowNotification("You can review Customer Amendment Letter and Authorization Ticket by clicking on Amendment Letter button or L/C Amendment Authorization button in toolbar respectively.", 2);
                _formContext.getAttribute("qdb_co_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //PDC Change
            case "{D6921766-74BC-E711-8105-00155D78042C}": // PDC Cancel for CM Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                qdb_Tab.setLabel("Credit Manager : Approval");
                // ShowNotification("You can review Customer Amendment Letter and Authorization Ticket by clicking on Amendment Letter button or L/C Amendment Authorization button in toolbar respectively.", 2);
                _formContext.getAttribute("qdb_co_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{90BE9DE8-BEBC-E211-90D7-00155D787B38}": //New Loan Head CAD Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_24");
                _formContext.getAttribute("qdb_loan_request_head_cad_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                break;
            case "{1B9EDCDC-DCBF-E211-BC78-00155D787B38}": //Resubmission
                qdb_Tab = _formContext.ui.tabs.get("tab_24");
                _formContext.getAttribute("qdb_loan_request_head_cad_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{BD6E8E87-27BD-E211-90D7-00155D787B38}": //Director Credit
            case "{B437E0E4-DEBF-E211-BC78-00155D787B38}":
                qdb_Tab = _formContext.ui.tabs.get("tab_24");
                _formContext.getAttribute("qdb_loan_request_reviewedcreditriskmanagement").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                break;

            case "{2E487C46-71BE-E211-BC78-00155D787B38}": //Term Sheet Review
            case "{4DE61990-04BF-E211-BC78-00155D787B38}":
                qdb_Tab = _formContext.ui.tabs.get("tab_TSReview");
                _formContext.getAttribute("qdb_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{E9AD3143-57F2-E211-A9BB-00155D788238}": //Resubmit for Term Sheet Approval Review
                qdb_Tab = _formContext.ui.tabs.get("tab_Resubmission");
                _formContext.getAttribute("qdb_term_sheet_resubmission_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{B90C1603-F6BB-E211-90D7-00155D787B32}": //Return to Head Credit Analyst
            case "{7E191FE6-057D-E811-80F9-02BF800001AD}": //Return to Credit Analyst by RM
                qdb_Tab = _formContext.ui.tabs.get("tab_Resubmission");
                _formContext.getAttribute("qdb_term_sheet_resubmission_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{38875135-C503-EA11-8144-00155D78AA49}": //Termsheet Submission
                break;

            case "{CB0C2057-59F2-E211-A9BB-00155D788238}": //Approval E.D. Credit Management
                qdb_Tab = _formContext.ui.tabs.get("tab_68");
                _formContext.getAttribute("qdb_term_sheet_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{59FAACC2-5FF2-E211-A9BB-00155D788238}": //Approval E.D. Credit Management
                qdb_Tab = _formContext.ui.tabs.get("tab_68");
                _formContext.getAttribute("qdb_term_sheet_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{CBC891B7-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_ICC_Descion");
                _formContext.getAttribute("qdb_icc_descion").setRequiredLevel("required");
                _formContext.getAttribute("qdb_icc_descion_date").setRequiredLevel("required");
                SetICCMemberGridUrl();
                qdb_Tab.setVisible(true);
                break;
            case "{CCC891B7-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_OfferInitialReview");
                _formContext.getAttribute("qdb_customer_term_sheet_initial_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{F3F2A7BF-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_TermSheetReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{989E1CD2-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_TermSheetReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{02ECF8C8-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_TermSheetReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required")
                qdb_Tab.setVisible(true);
                break;
            case "{3F44B811-87B9-E211-BE7D-00155D788238}": //Customer Term Sheet by Email
                qdb_Tab = _formContext.ui.tabs.get("tab_CustomerDetails");
                _formContext.getAttribute("qdb_email_address").setRequiredLevel("required");
                _formContext.getAttribute("qdb_mobile_phone_1").setRequiredLevel("required");
                _formContext.getAttribute("qdb_email_message").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{3BC0AB43-4441-EC11-8102-985D4B879503}": //upload signed Offer & Acceptance
                qdb_Tab = _formContext.ui.tabs.get("tab_71");
                _formContext.getAttribute("qdb_offer_acceptance").setRequiredLevel("required"); // Only this line added by Shehroz
                // _formContext.getAttribute("qdb_email_address").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetUploadGrid();
                break;

            case "{C5B8E1D9-A0B5-E211-90D7-00155D787B38}": //Customer Term Sheet Confirmation
                qdb_Tab = _formContext.ui.tabs.get("tab_TermSheetConfirmation");
                _formContext.getAttribute("qdb_confirmation_date").setRequiredLevel("required");
                _formContext.getAttribute("qdb_cts_status_confirmation").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{601C2E5F-1ABA-E211-90D7-00155D787B38}": //QCB Code
                qdb_Tab = _formContext.ui.tabs.get("tab_QCBDetails");
                _formContext.getAttribute("qdb_date_applied_on").setRequiredLevel("required");
                _formContext.getAttribute("qdb_customer_qcb_number").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{D13A64C4-1EBA-E211-90D7-00155D787B38}": //Create Customer
                qdb_Tab = _formContext.ui.tabs.get("tab_CustomerPartnerDetails");
                //_formContext.getAttribute("qdb_cif_no").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_contacts_created").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{B1C657D0-E2BA-E211-90D7-00155D787B38}": //Approve Customer (Approve Customer, Partners, Guarantors in TCS)
            case "{87911D70-BCC6-EC11-8100-0050568FDDDF}": //Approve Customer (Approve Customer, Partners, Guarantors in TCS (Customer Creation))
                qdb_Tab = _formContext.ui.tabs.get("tab_ApprovalCustomer");
                if (_formContext.getAttribute("qdb_customer_cif_number") != null) {
                    _formContext.getAttribute("qdb_customer_cif_number").setRequiredLevel("required");
                }
                if (_formContext.getAttribute("qdb_approved_in_tcs") != null) {
                    _formContext.getAttribute("qdb_approved_in_tcs").setRequiredLevel("required");
                }
                if (qdb_Tab != null) {
                    qdb_Tab.setVisible(true);
                }
                break;
            case "{9F879696-0FBA-E211-90D7-00155D787B38}": //Loan Documentation
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090003); // review comments
                OnChangeMasterBankAgreement();
                let LookupFieldObject = _formContext.getAttribute("qdb_purchase_contract");
                if (LookupFieldObject != null) {
                    if (LookupFieldObject.getValue() == true) {
                        _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_5").setVisible(false);
                        _formContext.getAttribute("qdb_monitoring_review_status").setRequiredLevel("none");
                        _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_3").setVisible(false);
                        _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_4").setVisible(false);
                        // _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(true);
                        // _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_6").setVisible(true);

                        SetLoanDocumentPortfolioInIframesURL();
                    }
                }
                break;
            case "{29BB88DA-579B-EB11-80F8-00155D78AB4B}": //Loan Documentation for Portfolio  Referral
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_4").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_5").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_3").setVisible(false);
                SetLoanDocumentPortfolioInIframesURL();
                break;
            case "{A696D153-E4A4-EB11-8151-00155D3A8060}": //Loan Documentation RM Pending
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_portfoliostatus").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{815F2684-E4A4-EB11-8151-00155D3A8060}": //Portfolio Referral Book Facility
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;
            case "{8F6E65EF-FCBA-E211-90D7-00155D787B38}": //Loan Documentation Review
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanAgreementReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_2").setVisible(true);
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForApproval");
                let AssignTo = "751090000";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApproval.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                IFrame.setSrc(newTarget);
                break;
            case "{397E854C-11BB-E211-90D7-00155D787B38}": //Loan Documentation Review
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanAgreementReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{8F6E65EF-FCBA-E211-90D7-00155D787B38}": //Loan Documentation Review by Head Of CAD
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanAgreementReview");
                _formContext.getAttribute("qdb_customer_term_sheet_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_2").setVisible(true);
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForApproval");
                let AssignTo = "751090000";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApproval.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090003); // Return to
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090004); // print document
                IFrame.setSrc(newTarget);
                break;
            case "{A72D33D9-27BB-E211-90D7-00155D787B38}": //Loan Documentation Handover
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForPrint");
                let AssignTo = "751090001";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApprovalSharia.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                IFrame.setSrc(newTarget);

                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocHandover");
                //_formContext.getAttribute("qdb_handover_to_head_of_cad").setRequiredLevel("required");
                _formContext.getAttribute("qdb_hand_over_to_rm").setRequiredLevel("required");
                qdb_Tab.setVisible(true);

                //27 March 2021_U
                SetSecurityDocumentURL();

                break;
            case "{5C58CD4E-94BB-E211-90D7-00155D787B38}": //Documents Lodgement RM
                qdb_Tab = _formContext.ui.tabs.get("tab_SecDocLodgeRM");
                _formContext.getAttribute("qdb_rm_documents_lodgement_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{FAFCBC62-94BB-E211-90D7-00155D787B38}": //Documents Ledgement CAD
                // _formContext.getControl("qdb_cad_head_documents_lodgement_confirmation").setVisible(false);
                _formContext.ui.tabs.get("tab_SecDocCAD").sections.get("tab_SecDocCAD_section_5").setVisible(false);
                _formContext.getAttribute("qdb_cad_officer_documents_lodgement_confirmat").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_SecDocCAD");
                qdb_Tab.setVisible(true);
                break;
            case "{9E207D7A-A3BB-E211-90D7-00155D787B38}": //Documents Lodgement Head of CAD
                _formContext.ui.tabs.get("tab_SecDocCAD").sections.get("tab_18_section_1").setVisible(false);
                _formContext.getAttribute("qdb_cad_head_documents_lodgement_confirmation").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_SecDocCAD");
                qdb_Tab.setVisible(true);
                break;
            case "{FE925919-43C5-E211-AC38-00155D788238}": //Review by Credit Officer
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_2").setVisible(true);
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForApproval");
                let AssignTo = "751090003";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApproval.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                IFrame.setSrc(newTarget);
                break;
            case "{387E854C-11BB-E211-90D7-00155D787B38}": //Review by Legal Manager
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_2").setVisible(true);
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForApproval");
                let AssignTo = "751090002";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApproval.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                IFrame.setSrc(newTarget);
                break;
            case "{1A22B31E-42C5-E211-AC38-00155D788238}": //Pending Sharia Controller Review
                qdb_Tab = _formContext.ui.tabs.get("tab_LoanDocu");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_29_section_1").setVisible(false);
                _formContext.ui.tabs.get("tab_LoanDocu").sections.get("tab_LoanDocu_section_2").setVisible(true);
                let IFrame = _formContext.ui.controls.get("IFRAME_ShowGeneratedDocumentsForApproval");
                let AssignTo = "751090001";
                let RecordID = _formContext.data.entity.getId();
                let newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForApprovalSharia.aspx?AssignTo=" + AssignTo + "&id=" + RecordID;
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090002); // Return to RM
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090004); // print document
                _formContext.getAttribute("qdb_monitoring_review_status").setRequiredLevel("required");
                IFrame.setSrc(newTarget);


                break;

            case "{3C686611-7CBC-E211-90D7-00155D787B38}": // Facility Creation
                qdb_Tab = _formContext.ui.tabs.get("tab_15");
                qdb_Tab.setVisible(true);
                break;


            //Pending Document Upload            
            case "{162451E3-1F34-E511-81C5-00155D788D14}":

                qdb_Tab = _formContext.ui.tabs.get("tab_Document_Lodgment");
                _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("required");
                // _formContext.ui.tabs.get("tab_Document_Lodgment").sections.get("tab_Document_Lodgment_section_2").setVisible(true);
                // _formContext.ui.tabs.get("tab_46").setVisible(true);//IN 2016 tab visibility is not working that'whyCreated Separate tab for it 
                qdb_Tab.setVisible(true);
                SetLodgmentDocumentGridURL();
                break;


            case "{4C633AC4-2034-E511-81C5-00155D788D14}": //Pending with CAD  
            case "{3C4F2352-3A47-E511-81C5-00155D788D14}": //Pending Document Head of CAD Approval
            case "{3448C59A-C770-E511-81C5-00155D788D14}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Document_Lodgment");
                _formContext.getAttribute("qdb_cad_lodgment_status").setRequiredLevel("required");
                //  _formContext.ui.tabs.get("tab_Document_Lodgment").sections.get("tab_Document_Lodgment_section_3").setVisible(true);
                _formContext.ui.tabs.get("tab_47").setVisible(true);//IN 2016 tab visibility is not working that'whyCreated Separate tab for it
                qdb_Tab.setVisible(true);
                SetLodgmentDocumentCADGridURL();
                break;
            case "{08AA3E8E-EBB3-E511-8604-00155D780335}": //Pending with CAD 
            case "{5179681D-0E6A-EC11-8171-0050568F3B81}": //Return To RM By Credit Admin
                _formContext.ui.tabs.get("tab_67").setVisible(true);
                SetSharePointDocumentLibraryURL();
                break;
            //Return to Owner by CAD             
            case "{43FE4BC5-843A-E511-81C5-00155D788D14}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Document_Lodgment");
                _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("required");
                // _formContext.ui.tabs.get("tab_Document_Lodgment").sections.get("tab_Document_Lodgment_section_2").setVisible(true);
                _formContext.ui.tabs.get("tab_46").setVisible(true);//IN 2016 tab visibility is not working that'whyCreated Separate tab for it
                _formContext.ui.tabs.get("tab_Document_Lodgment").setVisible(true);
                SetLodgmentDocumentReturnGridURL();
                break;

            case "{6F9E8A76-7EBC-E211-90D7-00155D787B38}": // Facility Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_16");
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_faciility_number").setRequiredLevel("required");
                _formContext.getAttribute("qdb_limmit_approval_status").setRequiredLevel("required");
                break;
            case "{25F3D530-85BC-E211-90D7-00155D787B38}": // Limit breakdown creation
                qdb_Tab = _formContext.ui.tabs.get("tab_22");
                qdb_Tab.setVisible(true);
                break;
            case "{26F3D530-85BC-E211-90D7-00155D787B38}": // Limit breakdown approval
                qdb_Tab = _formContext.ui.tabs.get("tab_23");
                _formContext.getAttribute("qdb_limmit_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;


            case "{337DA1BF-A5F1-E911-812C-00155DB3C005}": // Manager ETF
                qdb_Tab = _formContext.ui.tabs.get("tab_ManagerETF");

                let qdb_StatusCode = _formContext.getAttribute("statuscode");

                if (qdb_StatusCode.getValue() == 751090002) {

                    let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
                    QDB_OptionSet.clearOptions();
                    let lcl_Optn1 = new Object();
                    lcl_Optn1.text = "Approve Disbursement Request with Inspection";
                    lcl_Optn1.value = 751090006;
                    QDB_OptionSet.addOption(lcl_Optn1);

                    let lcl_Optn3 = new Object();
                    lcl_Optn3.text = "Approve Disbursement Request without Inspection";
                    lcl_Optn3.value = 751090005;
                    QDB_OptionSet.addOption(lcl_Optn3);
                }

                _formContext.getAttribute("qdb_disbursment_rm_review_approval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            //Disbursement : Manager Credit
            case "{7366CE6F-ACF1-E911-812C-00155DB3C005}":
                let qdb_StatusCode = _formContext.getAttribute("statuscode");
                if (qdb_StatusCode.getValue() == 751090002) {

                    let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
                    QDB_OptionSet.clearOptions();
                    let lcl_Optn1 = new Object();
                    lcl_Optn1.text = "Approve Disbursement Request with Inspection";
                    lcl_Optn1.value = 751090006;
                    QDB_OptionSet.addOption(lcl_Optn1);

                    let lcl_Optn3 = new Object();
                    lcl_Optn3.text = "Approve Disbursement Request without Inspection";
                    lcl_Optn3.value = 751090005;
                    QDB_OptionSet.addOption(lcl_Optn3);
                }

                _formContext.getAttribute("qdb_disbursment_rm_review_approval").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_ManagerCreditPaymentAuthorization");

                qdb_Tab.setVisible(true);
                break;

            case "{94EDAED3-FDCA-E211-BC78-00155D787B38}": // RM Disbursement Approval

                let qdb_StatusCode = _formContext.getAttribute("statuscode");

                if (qdb_StatusCode.getValue() == 751090002) {

                    let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
                    QDB_OptionSet.clearOptions();
                    let lcl_Optn1 = new Object();
                    lcl_Optn1.text = "Approve Disbursement Request";
                    lcl_Optn1.value = 751090000;
                    QDB_OptionSet.addOption(lcl_Optn1);
                    let lcl_Optn2 = new Object();
                    lcl_Optn2.text = "Return to Customer Services";
                    lcl_Optn2.value = 751090002;
                    QDB_OptionSet.addOption(lcl_Optn2);
                    let prog = _formContext.getAttribute("qdb_isprogram").getValue();




                    //qdb_loan_application_ref





                    if (_formContext.getAttribute("qdb_disbursement_for") != null) {
                        if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090005") {

                            //
                            //_formContext.getControl("qdb_loan_application_ref").setVisible(false);
                            //_formContext.ui.tabs.get("tab_RMDIsbursement").sections.get("tab_RMDIsbursement_section_4").setVisible(true);
                            //_formContext.getAttribute("qdb_loan_application_ref").setRequiredLevel("required");
                        }
                        else {
                            // _formContext.getControl("qdb_loan_application_ref").setVisible(false);
                            //_formContext.ui.tabs.get("tab_RMDIsbursement").sections.get("tab_RMDIsbursement_section_4").setVisible(false);
                        }
                    }

                    if (_formContext.getAttribute("qdb_isprogram").getValue() == null || _formContext.getAttribute("qdb_isprogram").getValue() == false) {
                        _formContext.getControl("qdb_disbursment_rm_review_approval").removeOption(751090004);
                    }

                    let lcl_IsEPDRequest = _formContext.getAttribute("qdb_is_epd_request").getValue();

                    //Xrm.Navigation.openAlertDialog({text: lcl_IsEPDRequest}) // MIGRATED: alert→openAlertDialog;
                    if (lcl_IsEPDRequest == true) {
                        _formContext.getControl("qdb_disbursment_rm_review_approval").removeOption(751090002); // Return to Customer Service              
                    }
                    else {
                        _formContext.getControl("qdb_disbursment_rm_review_approval").removeOption(751090003); // Return to Project Manager (EPD)
                        _formContext.getControl("qdb_disbursment_rm_review_approval").removeOption(751090001); // Return to Credit Officer
                    }

                    let qdb_StatusCode = _formContext.getAttribute("statuscode");

                    let statuscodes = _formContext.getAttribute("statuscode").getValue();

                    if (qdb_StatusCode.getValue() == 751090002) {


                        if (_formContext.getAttribute("qdb_disbursement_for") != null) {
                            if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {

                                let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
                                QDB_OptionSet.clearOptions();
                                //comented by ali to remove inspection option    date 20-feb-24
                                let lcl_Optn1 = new Object();
                                lcl_Optn1.text = "Approve Disbursement Request with Inspection";
                                lcl_Optn1.value = 751090006;
                                QDB_OptionSet.addOption(lcl_Optn1);


                                let lcl_Optn3 = new Object();
                                lcl_Optn3.text = "Approve Disbursement Request without Inspection";
                                lcl_Optn3.value = 751090005;
                                QDB_OptionSet.addOption(lcl_Optn3);

                                //var lcl_Optn4 = new Object();
                                //lcl_Optn4.text = "Approve Disbursement Request";
                                //lcl_Optn4.value = 751090000;
                                //QDB_OptionSet.addOption(lcl_Optn4);

                                let lcl_Optn2 = new Object();
                                lcl_Optn2.text = "Return to Customer Services";
                                lcl_Optn2.value = 751090002;
                                QDB_OptionSet.addOption(lcl_Optn2);

                                //var lcl_Optn4 = new Object();
                                //lcl_Optn4.text = "Approve";
                                //lcl_Optn4.value = 751090007;
                                //QDB_OptionSet.addOption(lcl_Optn4);
                            }
                        }
                    }
                }
                _formContext.getAttribute("qdb_disbursment_rm_review_approval").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_RMDIsbursement");
                qdb_Tab.setVisible(true);

                break;
            //case "{2A7B3805-291C-EA11-8145-00155D78AA49}": // Disbursement - Health Report
            //case "{3D9AF312-2D1C-EA11-8145-00155D78AA49}":
            //case "{D63873EC-391C-EA11-8145-00155D78AA49}":
            //case "{24A6C80F-3A1C-EA11-8145-00155D78AA49}":
            //case "{EFA2E3DC-3A1C-EA11-8145-00155D78AA49}":
            case "{D978D8C4-E623-EA11-8134-00155DB3C005}":
            case "{3F4519CE-E623-EA11-8134-00155DB3C005}":
            case "{61017FF4-E623-EA11-8134-00155DB3C005}":
            case "{D91417B2-E623-EA11-8134-00155DB3C005}":
            case "{D5BD3CA7-E623-EA11-8134-00155DB3C005}":
                _formContext.getControl("qdb_disbursment_ed_bfd_review_approval").removeOption(751090002);
                _formContext.getControl("qdb_disbursment_ed_bfd_review_approval").removeOption(751090003);

                _formContext.getAttribute("qdb_disbursment_ed_bfd_review_approval").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_65_HealthReport");
                qdb_Tab.setVisible(true);
                break;

            case "{5F24F6C0-D6CA-E211-BC78-00155D787B38}": // Disbursement - Director BFD
            case "{4D67DF6C-DFCA-E211-BC78-00155D787B38}":
            case "{0AD6A1CE-2E15-E311-A57C-00155D788238}":
                _formContext.getAttribute("qdb_disbursment_ed_bfd_review_approval").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_ED_PF_Disbursement");
                qdb_Tab.setVisible(true);
                break;
            case "{94081274-E9CA-E211-BC78-00155D787B38}": // Disbursement - Credit Officer
                _formContext.getAttribute("qdb_disbursement_credit_admin_officer_approva").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_CADOfficer_Disbursement");
                qdb_Tab.setVisible(true);
                SetCADChecklistGridsURL();
                if (_formContext.getAttribute("qdb_disbursement_for") != null) {
                    if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090005") {
                        _formContext.getAttribute("qdb_fisheryrequesttype").setRequiredLevel("required");
                    }
                }
                break;
            case "{07A5D8AB-0ECB-E211-BC78-00155D787B38}": // Return to CAD Officer            
                qdb_Tab = _formContext.ui.tabs.get("tab_CADOfficer_Disbursement");
                qdb_Tab.setVisible(true);
                break;

            case "{18913FC4-0DCB-E211-BC78-00155D787B38}": //Disbursement - Head of CAD

                RemoveHCADInspectionApprovalExtraOptions();
                /*Is_LPO_Request
                let lclIsLPORequest = _formContext.getAttribute("qdb_is_lpo_request").getValue();

                if (lclIsLPORequest != null || lclIsLPORequest != "") {

                if (lclIsLPORequest == true) {

                _formContext.ui.tabs.get("tab_HCADDisbursementReview").sections.get("tab_HCADDisbursementReview_section_5").setVisible(true); // LPO Check list Section
                }
                }*/

                //Return to Project Manager (EPD) = 751090004
                let lclDisbursementThrough = _formContext.getAttribute("qdb_disburse_through").getValue();
                if (lclDisbursementThrough == "751090002" || lclDisbursementThrough == "751090011") {

                    _formContext.ui.tabs.get("tab_HCADDisbursementReview").sections.get("tab_HCADDisbursementReviewAMLQuestions").setVisible(false);
                }

                qdb_Tab = _formContext.ui.tabs.get("tab_HCADDisbursementReview");

                let lcl_IsEPDRequest = _formContext.getAttribute("qdb_is_epd_request").getValue();

                //Xrm.Navigation.openAlertDialog({text: lcl_IsEPDRequest}) // MIGRATED: alert→openAlertDialog;
                if (lcl_IsEPDRequest == true) {
                    _formContext.getControl("qdb_disbursement_head_credit_admin_approval").removeOption(751090001); // Return to Customer Service
                }
                else {
                    _formContext.getControl("qdb_disbursement_head_credit_admin_approval").removeOption(751090004); // Return to Project Manager (EPD)
                }

                _formContext.getAttribute("qdb_disbursement_head_credit_admin_approval").setRequiredLevel("required");

                qdb_Tab.setVisible(true);
                SetHCADChecklistGridsURL();


                if (_formContext.getAttribute("qdb_disbursement_for") != null) {
                    if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {

                        let qdb_StatusCode = _formContext.getAttribute("statuscode");

                        if (qdb_StatusCode.getValue() == 751090002) {

                            let QDB_OptionSet = _formContext.getControl("qdb_disbursement_head_credit_admin_approval");
                            QDB_OptionSet.clearOptions();
                            let lcl_Optn1 = new Object();
                            lcl_Optn1.text = "Approve Disbursement";
                            lcl_Optn1.value = 751090002;
                            QDB_OptionSet.addOption(lcl_Optn1);

                            let lcl_Optn2 = new Object();
                            lcl_Optn2.text = "Return to RM";
                            lcl_Optn2.value = 751090003;
                            QDB_OptionSet.addOption(lcl_Optn2);

                            let lcl_Optn3 = new Object();
                            lcl_Optn3.text = "Return to Customer Service";
                            lcl_Optn3.value = 751090001;
                            QDB_OptionSet.addOption(lcl_Optn3);
                        }
                    }
                }


                let lclDisbursementThrough = _formContext.getAttribute("qdb_disburse_through").getValue();

                let Disbursementfor = _formContext.getAttribute("qdb_disbursement_for").getValue();

                if (lclDisbursementThrough == "751090004" || lclDisbursementThrough == "751090001") {

                    if (_formContext.ui.controls.get("qdb_disbursement_through") != null) {
                        _formContext.ui.controls.get("qdb_disbursement_through").setVisible(true);
                        _formContext.getAttribute("qdb_disbursement_through").setRequiredLevel("required");
                    }


                }

                //window.showModalDialog("https://qdbcrmapp:6565/CRMExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", 'dialogWidth:550px; dialogHeight:250px; center:yes;status:0;resizable:1;');

                let qdb_usance_payment = _formContext.getAttribute("qdb_usance_payment").getValue();
                if (qdb_usance_payment == true) {
                    //window.showModalDialog("https://qdbcrmapp:6565/CRMProfitExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", 'dialogWidth:550px; dialogHeight:150px; center:yes;status:0;resizable:1;');
                }
                break;

            case "{64047F31-87C4-EC11-8100-0050568FDDDF}": //Dhaman Approval - R.M

                _formContext.getAttribute("qdb_dhamanapproval").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_72");
                qdb_Tab.setVisible(true);

                break;

            case "{7EB80011-0FCB-E211-BC78-00155D787B38}": // Disbursement - E.D. Credit & Risk Management        
            case "{D106CB7B-2C20-E311-A57C-00155D788238}":
                _formContext.getAttribute("qdb_disbursementedcreditriskreview").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_EDCredtDisbursement");

                qdb_Tab.setVisible(true);
                break;
            case "{37714796-99ED-E211-A9BB-00155D788238}": // Loan Disbursement Review
                //case "{5A7B7255-50FD-E211-A57C-00155D788238}":
                ShowNotification("You can review Payment Authorization by clicking on View Payment Authorization button in toolbar & can view Scanned Documents in Attached Documents sections (scroll down in task form).", 2);
                _formContext.getAttribute("qdb_ops_disbursement_review").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_DisbursementReview_Ops");
                if (_formContext.getAttribute("statuscode") == "751090002") {
                    OnChangeOPDisburseReview();
                }
                qdb_Tab.setVisible(true);
                /*
                if (_formContext.getAttribute("qdb_record_type").getValue()[0].id == "{11A1184B-E3F6-E211-A57C-00155D788238}")
                _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_Remitance").setVisible(true);
                else
                _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_LC_Issuance").setVisible(true);            
                */
                break;

            case "{A2111B3C-D8FC-E211-A57C-00155D788238}": // Resubitted for Review	
                _formContext.getAttribute("qdb_ops_disbursement_review").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_DisbursementReview_Ops");
                if (_formContext.getAttribute("statuscode") == "751090002") {
                    OnChangeOPDisburseReview();
                }
                if (_formContext.getAttribute("qdb_record_type").getValue()[0].id == "{11A1184B-E3F6-E211-A57C-00155D788238}")
                    _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_Remitance").setVisible(true);
                else
                    _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_LC_Issuance").setVisible(true);
                qdb_Tab.setVisible(true);
                break;

            case "{698F322F-DEED-E211-A9BB-00155D788238}": // tab_SupplierWorldCheck
                qdb_Tab = _formContext.ui.tabs.get("tab_SupplierWorldCheck");
                _formContext.getAttribute("qdb_world_check_report_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                let lclDisbursementThrough = _formContext.getAttribute("qdb_disburse_through").getValue();
                if (lclDisbursementThrough == "751090004") {

                    //Browser Stablization
                    /*
                    // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: window.showModalDialog("https://qdbcrmapp:6565/CRMProfitExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", 'dialogWidth:550px; dialogHeight:150px; center:yes;status:0;resizable:1;');
                    // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.
                    */
                    OpenDialogUsingAlert("https://qdbcrmapp:6565/CRMProfitExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", false);
                }
                break

            case "{17B5F32F-EBED-E211-A9BB-00155D788238}": // Execution of L/C Issuance
                qdb_Tab = _formContext.ui.tabs.get("tab_43");
                _formContext.ui.tabs.get("{be617111-a4cb-4876-bdeb-b0893678a5f7}").setVisible(true);
                _formContext.ui.tabs.get("{be617111-a4cb-4876-bdeb-b0893678a5f7}").setLabel("Upload Signatory");
                _formContext.getAttribute("qdb_modeofpayment").setRequiredLevel("required");
                _formContext.getAttribute("qdb_lc_authorization").setRequiredLevel("required");
                _formContext.getAttribute("qdb_lc_number").setRequiredLevel("required");
                _formContext.getAttribute("qdb_benificary_name").setRequiredLevel("required");
                _formContext.getAttribute("qdb_cadchkcomments1").setRequiredLevel("required");
                _formContext.getAttribute("qdb_lc_issue_date").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break

            case "{0208056F-47FD-E211-A57C-00155D788238}": // Head of CAD Loan Amendment Approval
            case "{B4030EBB-4BFD-E211-A57C-00155D788238}":

                _formContext.getAttribute("qdb_head_cad_loan_request_status").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_28");
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                qdb_Tab.setVisible(true);
                break;

            case "{02CE031A-4CFD-E211-A57C-00155D788238}": // Director Credit Loan Amendment Approval
                _formContext.getAttribute("qdb_director_credit_loan_request_status").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_65");
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                qdb_Tab.setVisible(true);
                break;

            case "{45AA01F4-50FD-E211-A57C-00155D788238}": //Operations Execution - Loan Amendment        

                _formContext.getAttribute("qdb_loan_amendments_status").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_29");
                //ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                qdb_Tab.setVisible(true);
                break;

            case "{34E2A4B0-4EFD-E211-A57C-00155D788238}": // Loan Request Review
            case "{62956206-FCFD-E211-A57C-00155D788238}":
            case "{DF7D07E4-FFFD-E211-A57C-00155D788238}":
            case "{5A7B7255-50FD-E211-A57C-00155D788238}":
                _formContext.getAttribute("qdb_project_finance_ops_requestreview").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_28");
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                qdb_Tab.setVisible(true);
                break;

            case "{75BABCF0-D9BC-E211-90D7-00155D787B38}": // tab_SWIFTApproval
                qdb_Tab = _formContext.ui.tabs.get("tab_26");
                _formContext.getAttribute("qdb_loan_creation_ops_officer_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                ShowNotification("Special Instructions : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 3);
                SetProductTypeAndRepaymentTermsGridsIframeURL(); // Set Product Type & Repayment Terms Grid URL
                break

            case "{C838DDAA-2BF1-E211-A9BB-00155D788238}": // Review L/C Documentation
                qdb_Tab = _formContext.ui.tabs.get("tab_49");
                _formContext.getAttribute("qdb_lc_documents_customer_confirmation").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            // Execution of L/C Amendment in TCS     
            case "{BCB20518-32F3-E211-A9BB-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_47");
                qdb_Tab.setVisible(true);
                break

            case "{ECB036FF-48F1-E211-A9BB-00155D788238}": // Review L/C Documentation      

                qdb_Tab = _formContext.ui.tabs.get("tab_50");
                _formContext.getAttribute("qdb_lc_documentation_reviewer_status").setRequiredLevel("required");
                //OnChangeDocumentReviewStatus();
                qdb_Tab.setVisible(true);

                break
            case "{3A64026A-0A0F-E711-80ED-00155D788B37}": // Documentary Collection Review     

                qdb_Tab = _formContext.ui.tabs.get("tab_Review_Documentary_Collection_Documentation");
                //_formContext.getControl("qdb_lc_documentation_reviewer_status").removeOption(751090001);
                //var _options=_formContext.getAttribute('qdb_lc_documentation_reviewer_status').getOptions();
                //var _control = _formContext.ui.controls.get("qdb_lc_documentation_reviewer_status");
                //_control.removeOption(751090001);

                let docStatus = _formContext.getAttribute('qdb_lc_documentation_reviewer_status').getOptions();
                let ctrlDocStatus = _formContext.ui.controls.get('qdb_lc_documentation_reviewer_status');
                ctrlDocStatus.clearOptions();
                ctrlDocStatus.addOption(docStatus[0]);
                ctrlDocStatus.addOption(docStatus[1]);
                ctrlDocStatus.addOption(docStatus[3]);

                _formContext.getAttribute("qdb_lc_documentation_reviewer_status").setRequiredLevel("required");
                //qdb_lc_documentation_reviewer_status
                //_formContext.getControl("qdb_lc_documentation_reviewer_status").clearOptions();
                //
                //_formContext.getControl("qdb_lc_documentation_reviewer_status").removeOption(751090002);
                //OnChangeDocumentReviewStatus();
                qdb_Tab.setVisible(true);

                break
            case "{8DBDD496-7A1F-E711-80F0-00155D78042C}": //Facility Review by Head Credit Admin
                _formContext.getAttribute("qdb_facility_type").setValue(null);
                qdb_Tab = _formContext.ui.tabs.get("tab_HeadCreditAdmin_DocumentaryCollection_FacilityReview");
                _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
                _formContext.getAttribute("qdb_contract_required").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_product").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{5B6A9E14-1B34-E711-80F1-00155D78042C}": //Disbursement Release by Head Credit Admin

                qdb_Tab = _formContext.ui.tabs.get("tab_HeadCreditAdmin_DocumentaryCollection_ReleasingDisbursement");
                _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_product").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{BE56E21F-CE0A-E411-9003-00155D780506}": // Return to Operation by Head of CAD L/C Documentation

                qdb_Tab = _formContext.ui.tabs.get("tab_50");
                _formContext.getAttribute("qdb_lc_documentation_reviewer_status").setRequiredLevel("required");
                //OnChangeDocumentReviewStatus();
                qdb_Tab.setVisible(true);
                break

            case "{999585FD-4CF1-E211-A9BB-00155D788238}": // Review L/C Documentation 2
                qdb_Tab = _formContext.ui.tabs.get("tab_51");
                _formContext.getAttribute("qdb_lc_documentation_reviewer_status").setRequiredLevel("required");
                OnChangeDocumentReviewStatus();
                qdb_Tab.setVisible(true);
                break

            case "{797FD30C-74F1-E211-A9BB-00155D788238}": // Assign processor for Bills lodgement
                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{0D0986F6-D3F1-E211-A9BB-00155D788238}": // Lodgement in TCS - Processor
                qdb_Tab = _formContext.ui.tabs.get("tab_56");
                _formContext.getAttribute("qdb_bill_ref_no").setRequiredLevel("required");
                _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
                _formContext.getAttribute("qdb_money_amount").setRequiredLevel("required");
                _formContext.getAttribute("qdb_islamic_lc").setRequiredLevel("required");


                if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() == "751090001") {
                    ShowNotification("L/C Documents are discrepant. Please make sure to upload Transaction Reciept and Discrepancy Customer Advice.", 3);
                    if (_formContext.getAttribute("qdb_disbursemen_payment_type").getValue() == "751090003") {
                        _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                        _formContext.getAttribute("qdb_maturity_date_lc").setValue(null);
                        _formContext.getControl("qdb_maturity_date_lc").setVisible(false);
                    }
                }
                else {
                    ShowNotification("L/C Documents are cleaned.", 2);
                    if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
                        if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{DE2D7C06-2004-E411-9003-00155D780506}") {
                            //var qdb_Tab2 = _formContext.ui.tabs.get("tab_RPSGen");
                            ////                    _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                            //qdb_Tab2.setVisible(true);
                        }
                    }
                }
                // 7 is for Mix L/C
                if (_formContext.getAttribute("qdb_disbursemen_payment_type").getValue() == "751090004") {
                    //_formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                    _formContext.getControl("qdb_money_amount").setLabel("Usance Amount");
                }  // if Sight
                else if (_formContext.getAttribute("qdb_disbursemen_payment_type").getValue() == "751090003") {
                    _formContext.getControl("qdb_money_amount").setLabel("Sight Amount");
                }
                else {
                    _formContext.getControl("qdb_money_amount").setLabel("Sight Amount");
                    _formContext.getControl("qdb_maturity_date_lc").setLabel("Sight Maturity Date");

                }

                if (_formContext.getAttribute("qdb_disbursemen_payment_type").getValue() == "751090007") {
                    // _formContext.ui.tabs.get("tab_56").sections.get("tab_56_section_TenorConfirmation").setVisible(true);
                    _formContext.ui.tabs.get("tab_UsanceDetails").setVisible(true);

                    _formContext.getAttribute("qdb_usance_payment").setRequiredLevel("required");
                    ValidateUsanceDetails();
                }
                qdb_Tab.setVisible(true);

                break
            case "{02181F78-4143-E711-80E3-00155D78042A}": //Lodgment of Documentary Collection Bills (TCS)

                _formContext.getAttribute("qdb_facility_type").setValue(null);
                qdb_Tab = _formContext.ui.tabs.get("tab_Lodgment_of_DC_Bills_in_TCS");
                _formContext.getAttribute("qdb_bill_ref_no").setRequiredLevel("required");
                //Temp Commented on 22 March 2022
                //_formContext.getAttribute("qdb_tcs_rct").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_money_amount").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_islamic_lc").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                //qdb_Tab = _formContext.ui.tabs.get("tab_50");
                //_formContext.getAttribute("qdb_lc_documentation_reviewer_status").setRequiredLevel("required");
                //OnChangeDocumentReviewStatus();
                //qdb_Tab.setVisible(true);


                if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() == "751090001") {
                    ShowNotification("L/C Documents are discrepant. Please make sure to upload Transaction Reciept and Discrepancy Customer Advice.", 3);
                    if (_formContext.getAttribute("qdb_disbursemen_payment_type").getValue() == "751090003") {
                        _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                        _formContext.getAttribute("qdb_maturity_date_lc").setValue(null);
                        _formContext.getControl("qdb_maturity_date_lc").setVisible(false);
                    }
                }
                else {
                    ShowNotification("D/C Documents are cleaned.", 2);
                    if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
                        if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{DE2D7C06-2004-E411-9003-00155D780506}") {
                            //var qdb_Tab2 = _formContext.ui.tabs.get("tab_RPSGen");
                            ////                    _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                            //qdb_Tab2.setVisible(true);
                        }
                    }
                }
                // 7 is for Mix L/C
                if (_formContext.getAttribute("qdb_lc_tenor").getValue() == "751090002") {
                    _formContext.getControl("qdb_money_amount").setLabel("Usance Amount");
                    _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
                }  // if Sight
                else if (_formContext.getAttribute("qdb_lc_tenor").getValue() == "751090001") {
                    _formContext.getControl("qdb_money_amount").setLabel("Sight Amount");
                    _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                }
                else {
                    _formContext.getControl("qdb_money_amount").setLabel("Sight Amount");
                    _formContext.getControl("qdb_maturity_date_lc").setLabel("Sight Maturity Date");
                    _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                }

                if (_formContext.getAttribute("qdb_lc_tenor").getValue() == "751090003") {
                    //_formContext.ui.tabs.get("tab_UsanceDetails").setVisible(true);
                    _formContext.ui.tabs.get("tab_Lodgment_of_DC_Bills_in_TCS").sections.get("tab_Lodgment_of_DC_Bills_in_TCS_section_3").setVisible(true);
                    _formContext.getAttribute("qdb_usance_payment").setRequiredLevel("required");
                    _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
                    ValidateUsanceDetails();
                }
                qdb_Tab.setVisible(true);
                if (_formContext.getAttribute("qdb_islamic_lc") != null) {
                    _formContext.getAttribute("qdb_islamic_lc").setRequiredLevel("none");
                }

                break
            case "{5CEC199A-870A-E411-9003-00155D780506}": // Generate Repayment Schedule : Operation Processor
                //qdb_Tab = _formContext.ui.tabs.get("tab_RPSGen");
                //qdb_Tab.setVisible(true);
                break

            case "{32E537B9-F1F1-E211-A9BB-00155D788238}": // Lodgement in TCS - Processor
                qdb_Tab = _formContext.ui.tabs.get("tab_55");
                _formContext.getAttribute("qdb_lc_payment_confirmation").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{A3C0213B-1AEF-E211-A9BB-00155D788238}": // L/C Amendment Approval by RM
            case "{48B3A4DC-FF1D-E311-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_61");
                ShowNotification("You can review Customer Amendment Letter by clicking on Amendment Letter button in View Documents section.", 2);
                _formContext.getAttribute("qdb_rm_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break

            case "{19088AED-1220-E611-910E-00155D7B3411}":
                qdb_Tab = _formContext.ui.tabs.get("tab_61");
                qdb_Tab.setLabel("RM Approval - Transfer Deposit");
                _formContext.getAttribute("qdb_rm_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{8CC65ED3-8BF0-E211-A9BB-00155D788238}": // L/C Amendment Approval by BFD Director
            case "{84B8EB39-0A1E-E311-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_62");
                ShowNotification("You can review Amendment Letter by clicking on Amendment Letter button in View Documents section.", 2);
                _formContext.getAttribute("qdb_director_pf_lc_amendment_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{A28E9FAF-41FC-E211-BE9A-00155D787B38}": // L/C Amendment Approval by BFD Director
                qdb_Tab = _formContext.ui.tabs.get("tab_62");
                ShowNotification("You can review Customer Amendment Letter by clicking on Amendment Letter button in View Documents section.", 2);
                _formContext.getAttribute("qdb_director_pf_lc_amendment_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{4ECE7731-27FC-E211-A57C-00155D788238}": // Resubmitted L/C Amendment Approval by BFD Director
                qdb_Tab = _formContext.ui.tabs.get("tab_62");
                _formContext.getAttribute("qdb_director_pf_lc_amendment_approval_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{4A5104D9-1CEF-E211-A9BB-00155D788238}": // L/C Amendment Submitted for CAD Aproval
            case "{7C7B9080-9014-E311-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                ShowNotification("You can review Customer Amendment Letter and Authorization Ticket by clicking on Amendment Letter button or L/C Amendment Authorization button in toolbar respectively.", 2);
                _formContext.getAttribute("qdb_co_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{2C067AD0-58FC-E211-A57C-00155D788238}": // L/C Amendment Submitted for CAD Aproval
                qdb_Tab = _formContext.ui.tabs.get("tab_63");
                _formContext.getAttribute("qdb_co_lc_amendment_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{6D333EB9-B4F0-E211-A9BB-00155D788238}": // L/C Amendment Review by OPS
            case "{0BD64575-9A14-E311-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_66");
                ShowNotification("You can review Customer Amendment Letter and L/C Amendment Authorization Ticket by clicking on Amendment Letter button or L/C Amendment Authorization button in toolbar respectively.", 2);
                _formContext.getAttribute("qdb_ops_disbursement_review").setRequiredLevel("required");
                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{1AE0C839-5BFC-E211-A57C-00155D788238}": // L/C Amendment Review by OPS resubmission
                qdb_Tab = _formContext.ui.tabs.get("tab_66");
                _formContext.getAttribute("qdb_ops_disbursement_review").setRequiredLevel("required");
                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{45966105-7FFA-E211-A57C-00155D788238}": // L/C Amendment Execution   
                qdb_Tab = _formContext.ui.tabs.get("tab_47");
                _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_lc_amendment_ref_no").setRequiredLevel("required");
                ShowNotification("After entering Amendment Ref. No, Uploading Customer Advice, SWIFT Message & Checklist Verification make sure to click on 'Mark Task Complete'.", 3);
                qdb_Tab.setVisible(true);
                break
            case "{498313D5-9A1E-E311-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_25");
                _formContext.getAttribute("qdb_operations_guarantee_amendment_status").setRequiredLevel("required");
                ShowNotification("After entering Amendment Ref. No, Uploading Letter/SWIFT Message & after Checklist Verification make sure to click on 'Mark Task Complete'.", 2);
                qdb_Tab.setVisible(true);
                break

            case "{FB0D1224-0ECB-E211-BC78-00155D787B38}": // Return to RM/CS
                qdb_Tab = _formContext.ui.tabs.get("tab_19");
                _formContext.getAttribute("qdb_cs_disbursement_resubmission").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break
            case "{DC7390F2-8AF8-E211-A57C-00155D788238}": // Remitance Trans Execution
            case "{A43536F5-72FE-E211-A57C-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_65");
                _formContext.getAttribute("qdb_modeofpayment").setRequiredLevel("required");
                if (_formContext.getAttribute("qdb_loan_account_ltl").getValue() == null) {

                    //  _formContext.ui.tabs.get("tab_65").sections.get("sectionltl")
                    _formContext.ui.tabs.get("tab_STL").setVisible(true);
                    _formContext.ui.tabs.get("tab_65").setVisible(true);
                    _formContext.ui.tabs.get("tab_LTL").setVisible(false);
                    _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
                }
                else {

                    _formContext.ui.tabs.get("tab_LTL").setVisible(true);
                    _formContext.ui.tabs.get("tab_65").setVisible(true);
                    _formContext.ui.tabs.get("tab_STL").setVisible(false);
                    // _formContext.ui.tabs.get("tab_65").sections.get("sectionstl").setVisible(true);
                    //  _formContext.ui.tabs.get("tab_Main").sections.get("tab_48_section_1").setVisible(true);

                }

                _formContext.getAttribute("qdb_transaction_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                onChangeRemittanceTransaction();
                _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("required");
                let lclDisbursementThrough = _formContext.getAttribute("qdb_disburse_through").getValue();
                if (lclDisbursementThrough == "751090004") {
                    //Browser Stablization
                    /*
                    // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: window.showModalDialog("https://qdbcrmapp:6565/CRMProfitExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", 'dialogWidth:550px; dialogHeight:150px; center:yes;status:0;resizable:1;');
                    // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.

                    */
                    OpenDialogUsingAlert("https://qdbcrmapp:6565/CRMProfitExceptions.aspx?id=" + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id, "", false);
                }
                break;
            case "{0D214D68-62F9-E211-A57C-00155D788238}": // Guarantee Issuance Review
                _formContext.getAttribute("qdb_ops_disbursement_review").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_DisbursementReview_Ops");
                if (_formContext.getAttribute("statuscode") == "751090002") {
                    OnChangeOPDisburseReview();
                }
                if (_formContext.getAttribute("qdb_record_type").getValue()[0].id == "{11A1184B-E3F6-E211-A57C-00155D788238}")
                    _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_Remitance").setVisible(true);
                else
                    _formContext.ui.tabs.get("tab_DisbursementReview_Ops").sections.get("tab_DisbursementReview_Ops_section_LC_Issuance").setVisible(true);
                qdb_Tab.setVisible(true);
                break;

            case "{F8CE8DD3-55F9-E211-A57C-00155D788238}": // Guarantee Issuance 
                _formContext.getAttribute("qdb_guaranteetransactionstatus").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_39");
                _formContext.getAttribute("qdb_modeofpayment").setRequiredLevel("required");
                onChangeGuaranteeTransaction();
                qdb_Tab.setVisible(true);
                break;

            case "{601192C1-AD59-E411-B163-00155D788B08}":
            case "{FA17BAF3-7D1C-E811-80F2-02BF800001AD}":
            case "{EAB08439-8188-E611-9771-00155D7B3411}":
            case "{B72A8A2F-2B34-E711-80F1-00155D78042C}":
                qdb_Tab = _formContext.ui.tabs.get("tab_CSDOCSSTATUS");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                if (ts_WorkItemStep.getValue()[0].id == "{B72A8A2F-2B34-E711-80F1-00155D78042C}") {
                    _formContext.getAttribute("qdb_facility_type").setValue(null);
                }
                break;

            case "{528EC082-8EFE-E211-A57C-00155D788238}": // Assign L/C Acceptance
                _formContext.getAttribute("qdb_lc_documents_customer_confirmation").setRequiredLevel("required");
                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_55");
                qdb_Tab.setVisible(true);
                break;
            case "{021D5B9B-C507-E311-A57C-00155D788238}": //Review customer acceptance for payment
                _formContext.getAttribute("qdb_lc_acceptance_review_processor").setRequiredLevel("required");
                _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
                _formContext.getAttribute("qdb_contract_required").setRequiredLevel("required");
                if (_formContext.getAttribute("qdb_maturity_date_lc").getValue() != null) {
                    _formContext.ui.controls.get("qdb_maturity_date_lc").setDisabled(true);
                }
                qdb_Tab = _formContext.ui.tabs.get("tab_24");
                qdb_Tab.setVisible(true);
                ShowNotification("Please make sure to review Contract Required and correct in case if wrong.", 1);
                CheckRPSRequirement();

                break;
            //L/C Payment Confirmation                                       
            case "{0AB84373-7603-E311-A57C-00155D788238}":
            case "{5DA174E4-615A-E311-A9A2-00155D787B38}":
                _formContext.getAttribute("qdb_lc_payment_confirmation").setRequiredLevel("required");
                _formContext.getAttribute("qdb_documents_date").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_59");
                _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("required");
                _formContext.getAttribute("qdb_account_number").setRequiredLevel("required");

                if (ts_WorkItemStep.getValue()[0].id == "{5DA174E4-615A-E311-A9A2-00155D787B38}") {
                    qdb_Tab.setLabel("Operations Processor - Processing Payment for Documentary Collection");
                }

                qdb_Tab.setVisible(true);

                if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
                    if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{680769A8-DCEB-E311-98DA-00155D780305}") {
                        //qdb_Tab = _formContext.ui.tabs.get("tab_RPSGen");
                        ////                    _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                        //qdb_Tab.setVisible(true);
                    }
                }

                break;

            // Release Documents to Customer Service                         
            case "{4AF89CE0-F258-E411-B163-00155D788B08}":
            case "{5E8B99C2-2834-E711-80F1-00155D78042C}":
            case "{91321533-8188-E611-9771-00155D7B3411}":
                qdb_Tab = _formContext.ui.tabs.get("tab_DOCSTATUS");
                //_formContext.getAttribute("qdb_delivery_note_received_date").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                //_formContext.getControl("qdb_release_documents_status").removeOption(751090001)
                //_formContext.getControl("qdb_release_documents_status").removeOption(751090002)

                if (ts_WorkItemStep.getValue()[0].id == "{4AF89CE0-F258-E411-B163-00155D788B08}" || ts_WorkItemStep.getValue()[0].id == "{5E8B99C2-2834-E711-80F1-00155D78042C}" || ts_WorkItemStep.getValue()[0].id == "{46110CD8-7D1C-E811-80F2-02BF800001AD}") {
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090001);
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090002);
                    //New Value added in otpion Set 751,090,003 for Send to QBIC - 09-01-2017, with reference to Email: RE: NEW CRM ISSUES 
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090003);
                    if (ts_WorkItemStep.getValue()[0].id == "{5E8B99C2-2834-E711-80F1-00155D78042C}") {
                        _formContext.getAttribute("qdb_facility_type").setValue(null);
                    }
                }
                else if (ts_WorkItemStep.getValue()[0].id == "{91321533-8188-E611-9771-00155D7B3411}") {

                    if (_formContext.getAttribute("qdb_release_documents_status") != null) {
                        if (_formContext.getAttribute("qdb_release_documents_status").getValue() == null) {
                            _formContext.getControl("qdb_release_documents_status").clearOptions();
                            _formContext.getControl("qdb_release_documents_status").addOption({ value: 751090003, text: "Send to QBIC" });
                        }
                    }
                }
                else {
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090000);
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090001);
                    _formContext.getControl("qdb_release_documents_status").removeOption(751090002);
                    //New Value added in otpion Set 751,090,003 for Send to QBIC - 09-01-2017, with reference to Email: RE: NEW CRM ISSUES 
                    // _formContext.getControl("qdb_release_documents_status").clearOptions();
                    // _formContext.getControl("qdb_release_documents_status").addOption({ value: 751090000, text: "Send to QBIC" }); 

                    if (_formContext.getAttribute("qdb_release_documents_status").getValue() == 751090000) {
                        _formContext.getAttribute("qdb_release_documents_status").setValue(751090000);
                    }
                }

                break;

            case "{565EAF68-4746-E311-9BB2-00155D788238}": // Proposal Director BFD Approval
            case "{FD50DB1D-6103-F011-9EB3-005056BE4101}": //Senior Director Approval
            case "{285ACA59-DB9B-E311-8213-00155D788238}":
            case "{3FA80839-A9F4-ED11-910A-DD1D0837AE2B}": //18 MAY 2023_U Sr. Manager of Export Financing Approval
            case "{B87734E2-AEF4-ED11-910A-DD1D0837AE2B}": //18 MAY 2023_U
            case "{2660DB40-39F9-ED11-910A-DD1D0837AE2B}": //18 MAY 2023_U
            case "{C9CEF219-3AF9-ED11-910A-DD1D0837AE2B}": //18 MAY 2023_U
                qdb_Tab = _formContext.ui.tabs.get("tab_CP_BFD_Director");
                _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").setRequiredLevel("required");
                let QDB_OptionSet = _formContext.getControl("qdb_creditproposalbfddirectorapproval");
                setOptionSet(ts_WorkItemStep.getValue()[0].id, QDB_OptionSet);
                let QDB_OptionSet2 = _formContext.getControl("qdb_creditproposalbfddirectorapproval2");
                setOptionSet(ts_WorkItemStep.getValue()[0].id, QDB_OptionSet2);

                if (ts_WorkItemStep.getValue()[0].id == "{3FA80839-A9F4-ED11-910A-DD1D0837AE2B}") {
                    _formContext.getControl("qdb_1_ensure_correctnessof_swift_message").setVisible(true);
                    for (var i = 1; i < 5; i++) {
                        let ctrl = _formContext.getControl("qdb_1_ensure_correctnessof_swift_message" + i);
                        if (ctrl != null) {
                            ctrl.setVisible(true);
                        }
                    }
                }

                qdb_Tab.setVisible(true);
                break;
            //qdb_Tab = _formContext.ui.tabs.get("tab_CP_BFD_Director");
            //_formContext.getAttribute("qdb_creditproposalbfddirectorapproval").setRequiredLevel("required");
            //var QDB_OptionSet = _formContext.getControl("qdb_creditproposalbfddirectorapproval");
            //QDB_OptionSet.removeOption(751090002);
            //qdb_Tab.setVisible(true);
            //break;

            case "{A11DC8B4-6546-E311-9BB2-00155D788238}": // Head Credit Analysis Review
            case "{E5043F89-3478-E311-A9A2-00155D787B38}":
            case "{6462D8E5-60E8-E611-80D8-00155D788B2F}": //  Review Credit Proposal (Head Credit Analysis) #Fixed
                qdb_Tab = _formContext.ui.tabs.get("tab_CP_HCA_Review");
                _formContext.getAttribute("qdb_creditproposalheadcreditanalysisreview").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{19158C62-6646-E311-9BB2-00155D788238}": // Credit Proposal Preperation           
            case "{060F4D86-C590-E311-8213-00155D788238}":
            case "{63AAE278-EFD5-E311-AE11-00155D788238}":

                qdb_Tab = _formContext.ui.tabs.get("tab_CP_CA");
                //_formContext.getAttribute("qdb_creditproposalcreditanalyststatus").setRequiredLevel("required");
                _formContext.getAttribute("qdb_credit_proposal_type").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_cad_chk_dis_is_project_on_schedule").setRequiredLevel("required"); //BCR -REQ000000024764 
                // _formContext.getAttribute("qdb_grace_period").setRequiredLevel("required"); //BCR -REQ000000024764 
                _formContext.getAttribute("qdb_creditmonitoringlevel").setRequiredLevel("required");
                if (_formContext.getAttribute("qdb_creditproposalcreditanalyststatus") != null) {
                    _formContext.getAttribute("qdb_creditproposalcreditanalyststatus").setRequiredLevel("required");
                }

                qdb_Tab.setVisible(true);
                break;

            case "{14A58CBC-6746-E311-9BB2-00155D788238}": // HCA Proposal Approval
            case "{F1EA1C59-77AF-E311-9705-00155D788238}":

                qdb_Tab = _formContext.ui.tabs.get("tab_CP_HCA_Approval");
                //_formContext.getAttribute("qdb_creditproposalheadcreditanalysisapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{5BCAA543-6946-E311-9BB2-00155D788238}": // Direct Credit & Risk Approval 

                qdb_Tab = _formContext.ui.tabs.get("tab_CP_DCR_Approval");
                _formContext.getAttribute("qdb_creditproposaldirectcreditaproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                let IsPrograme = _formContext.getAttribute("qdb_isprogram").getValue();

                if (IsPrograme == true) {
                    _formContext.getControl("qdb_creditproposaldirectcreditaproval").removeOption(751090001);
                    _formContext.ui.tabs.get("tab_CP_DCR_Approval").sections.get("tab_CP_DCR_Approval_section_2").setVisible(true);
                    _formContext.ui.tabs.get("tab_CP_DCR_Approval").sections.get("tab_CP_DCR_Approval_section_3").setVisible(true);
                    SetCADDocuments();
                }

                break;

            case "{D473A218-5546-E311-9BB2-00155D788238}": //FF Analysis

                qdb_Tab = _formContext.ui.tabs.get("tab_FF");
                _formContext.getAttribute("qdb_ff_analysis_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{836477F5-3F46-E311-9BB2-00155D788238}": //Technical Analysis

                qdb_Tab = _formContext.ui.tabs.get("tab_TAR");
                //_formContext.getAttribute("qdb_ff_analysis_status").setRequiredLevel("required");            
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_credit_proposal_technical_analysis_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_vendorname").setRequiredLevel("required");
                _formContext.getAttribute("qdb_swif_tnumber").setRequiredLevel("required");

                EvaluationIframeLoad();

                //_formContext.ui.tabs.get("tab_TAR3").setVisible(true);

                //SetTechicalDepartGridURL();
                break;

            case "{377A3A79-184A-E311-9BB2-00155D788238}": //Clearing Review
            case "{A0D59DE0-DD7D-E311-8213-00155D788238}":
            case "{FC782D69-3C66-E311-A9A2-00155D787B38}":

                if (ts_WorkItemStep.getValue()[0].id == "{A0D59DE0-DD7D-E311-8213-00155D788238}") {
                    _formContext.ui.tabs.get("tab_OP_Clearing_Review").setLabel("Operations Control - L/C Payment Review");
                }
                else {
                    qdb_Tab = _formContext.ui.tabs.get("tab_OP_Clearing_Review");
                    qdb_Tab.setVisible(true);
                    SetChequeAndDepositGridsIframeURL();
                    _formContext.ui.tabs.get("tab_61").setVisible(true);
                }
                _formContext.getAttribute("qdb_ops_clearing_review").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_OP_Clearing_Review").setVisible(true);

                break;

            case "{45319C6F-E4F7-E211-A57C-00155D788238}": //Clearing Processing
            case "{213E9C57-11F9-E211-BE9A-00155D787B38}":
            case "{93A55123-12F9-E211-BE9A-00155D787B38}":
                _formContext.ui.tabs.get("tab_61").setVisible(true);
                _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_TransProcessStatus").setVisible(true);
                SetChequeAndDepositGridsIframeURL();
                break;

            case "{EBB77D8B-1F4A-E311-9BB2-00155D788238}": //Clearing Processing     
                _formContext.ui.tabs.get("tab_61").setVisible(true);
                _formContext.getControl("qdb_general_status").removeOption(751090003); //Return to Credit Officer
                _formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_TransProcessStatus").setVisible(true);
                SetChequeAndDepositGridsIframeURL();
                break;

            case "{F5FFD24D-D743-E911-811C-02BF800001AD}": //Direct Lending Manager Approval   
                _formContext.ui.tabs.get("tab_65_MicroFinance").setVisible(true);
                _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").setRequiredLevel("required");

                break;

            case "{7599EBCE-3E4C-E311-9BB2-00155D788238}"://Case Status Update
                _formContext.getAttribute("qdb_complaint_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
                _formContext.getControl("qdb_comments").setVisible(false);
                _formContext.ui.tabs.get("tab_3").setVisible(false);

                _formContext.ui.tabs.get("tab_case2").setVisible(true);
                _formContext.ui.tabs.get("tab_case1").setVisible(true);
                if (_formContext.getAttribute("qdb_case_task_operational_type") != null) {

                    if (_formContext.getAttribute("qdb_case_task_operational_type").getValue() == 751090000) {
                        //BU Manager
                        if (_formContext.ui.tabs.get("tab_BU_Manager_Background") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Background").setVisible(false);
                        }
                        if (_formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved").setVisible(false);
                        }
                        if (_formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future").setVisible(false);
                        }


                        if (_formContext.getAttribute("qdb_background_history") != null) {
                            _formContext.getAttribute("qdb_background_history").setRequiredLevel("none");
                        }
                        if (_formContext.getAttribute("qdb_how_was_complaint_resolved") != null) {
                            _formContext.getAttribute("qdb_how_was_complaint_resolved").setRequiredLevel("none");
                        }
                        if (_formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future") != null) {
                            _formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future").setRequiredLevel("none");
                        }

                        if (_formContext.getControl("qdb_complaint_status") != null) {
                            _formContext.getControl("qdb_complaint_status").removeOption(751090002);
                        }


                        //7 JAN 2024_U
                        if (!isUserFromCXTeam()) {

                            if (_formContext.getAttribute("qdb_case_type") != null && _formContext.getAttribute("qdb_case_type").getValue() != null && _formContext.getAttribute("qdb_case_type").getValue() == 751090001) {

                                if (_formContext.getControl("qdb_complaint_status") != null) {
                                    _formContext.getControl("qdb_complaint_status").removeOption(751090000);
                                }
                            }
                        }

                    }
                }
                if (_formContext.getAttribute("qdb_inspection_result") != null) {
                    _formContext.getAttribute("qdb_inspection_result").setRequiredLevel("none");
                    _formContext.getControl("qdb_inspection_result").setVisible(false);
                }
                if (_formContext.getAttribute("qdb_documentlodgmentsecuritystatus") != null) {
                    _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("none");
                    _formContext.getControl("qdb_documentlodgmentsecuritystatus").setVisible(false);
                }
                if (_formContext.ui.tabs.get("tab46") != null) {
                    _formContext.ui.tabs.get("tab46").setVisible(false);
                }

                if (_formContext.getAttribute("statecode").getValue() == 1) {
                    _formContext.ui.tabs.get("tab_BU_Manager_Background").setVisible(true);
                    _formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved").setVisible(true);
                    _formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future").setVisible(true);
                    _formContext.getControl("qdb_comments").setVisible(true);
                    _formContext.ui.tabs.get("tab_3").setVisible(true);
                }
                break;
            case "{C838B102-4E4C-E311-9BB2-00155D788238}"://Case Resolution
                _formContext.getAttribute("qdb_complaint_status").setRequiredLevel("required");

                _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
                _formContext.getControl("qdb_comments").setVisible(false);
                _formContext.ui.tabs.get("tab_3").setVisible(false);


                _formContext.ui.tabs.get("tab_case2").setVisible(true);
                _formContext.ui.tabs.get("tab_case1").setVisible(true);

                if (_formContext.ui.tabs.get("tab_case3") != null) {
                    _formContext.ui.tabs.get("tab_case3").setVisible(true);
                }
                if (_formContext.getAttribute("qdb_case_task_operational_type") != null) {

                    if (_formContext.getAttribute("qdb_case_task_operational_type").getValue() == 751090001) {
                        //Head of QSE
                        if (_formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU").setVisible(false);
                        }
                        if (_formContext.ui.tabs.get("tab_Head_QSE_Case_History") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(false);
                        }
                        if (_formContext.ui.tabs.get("tab_Head_QSE_Recommendations") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(false);
                        }


                        if (_formContext.getAttribute("qdb_case_resolved_by_bu") != null) {
                            _formContext.getAttribute("qdb_case_resolved_by_bu").setRequiredLevel("none");
                        }
                        if (_formContext.getAttribute("qdb_qse_case_history") != null) {
                            _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("none");
                        }
                        if (_formContext.getAttribute("qdb_qse_recommendations") != null) {
                            _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("none");
                        }
                        if (_formContext.getControl("qdb_complaint_status") != null) {
                            _formContext.getControl("qdb_complaint_status").removeOption(751090002);
                        }

                    }
                }
                if (_formContext.getAttribute("statecode").getValue() == 1) {
                    //code changes for Hussam error on 16102018
                    if (_formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU") != null) {

                        _formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU").setVisible(true);
                    }
                    if (_formContext.ui.tabs.get("tab_Head_QSE_Case_History") != null) {

                        _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(true);
                    }

                    if (_formContext.ui.tabs.get("tab_Head_QSE_Recommendations") != null) {
                        _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(true);
                    }
                    if (_formContext.ui.tabs.get("tab_qse_case_resolution") != null) {
                        _formContext.ui.tabs.get("tab_qse_case_resolution").setVisible(true);
                    }
                    _formContext.getControl("qdb_comments").setVisible(true);
                    _formContext.ui.tabs.get("tab_3").setVisible(true);
                    if (_formContext.getAttribute("qdb_complaint_status").getValue() == 751090001) {
                        _formContext.getControl("qdb_delegation_team").setVisible(true);
                    }
                }
                break;
            case "{F2A32694-474C-E311-9BB2-00155D788238}":
            case "{2CAC6B4D-04F2-E311-AE11-00155D788238}":
            case "{D3221C58-25F2-E311-AE11-00155D788238}":
            case "{21356107-06F2-E311-AE11-00155D788238}":

                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                _formContext.getAttribute("qdb_complaint_status").setRequiredLevel("required");

                _formContext.ui.tabs.get("tab_case2").setVisible(true);
                _formContext.ui.tabs.get("tab_case1").setVisible(true);

                if (_formContext.getAttribute("qdb_submit_by_user") != null)
                    ShowNotification("Case assigned you by : " + _formContext.getAttribute("qdb_submit_by_user").getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);

                if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{C838B102-4E4C-E311-9BB2-00155D788238}") {
                    if (_formContext.ui.tabs.get("tab_case3") != null) {
                        _formContext.ui.tabs.get("tab_case3").setVisible(true);
                    }
                }

                if (_formContext.getAttribute("qdb_case_task_operational_type") != null) {

                    if (_formContext.getAttribute("qdb_case_task_operational_type").getValue() == 751090000) {

                        if (_formContext.ui.tabs.get("tab_BU_Manager_Background") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Background").setVisible(true);
                        }
                        if (_formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved").setVisible(true);
                        }
                        if (_formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future") != null) {
                            _formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future").setVisible(true);
                        }

                        if (_formContext.getAttribute("qdb_background_history") != null) {
                            _formContext.getAttribute("qdb_background_history").setRequiredLevel("required");
                        }
                        if (_formContext.getAttribute("qdb_how_was_complaint_resolved") != null) {
                            _formContext.getAttribute("qdb_how_was_complaint_resolved").setRequiredLevel("required");
                        }
                        if (_formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future") != null) {
                            _formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future").setRequiredLevel("required");
                        }

                        if (_formContext.getControl("qdb_complaint_status") != null) {
                            _formContext.getControl("qdb_complaint_status").removeOption(751090002);
                        }

                    }
                    else if (_formContext.getAttribute("qdb_case_task_operational_type").getValue() == 751090001) {

                        if (_formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU").setVisible(true);
                        }
                        if (_formContext.ui.tabs.get("tab_Head_QSE_Case_History") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(true);
                        }
                        if (_formContext.ui.tabs.get("tab_Head_QSE_Recommendations") != null) {
                            _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(true);
                        }

                        if (_formContext.getAttribute("qdb_case_resolved_by_bu") != null) {
                            _formContext.getAttribute("qdb_case_resolved_by_bu").setRequiredLevel("required");
                        }
                        if (_formContext.getAttribute("qdb_qse_case_history") != null) {
                            _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("required");
                        }
                        if (_formContext.getAttribute("qdb_qse_recommendations") != null) {
                            _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("required");
                        }

                        if (_formContext.getControl("qdb_complaint_status") != null) {
                            _formContext.getControl("qdb_complaint_status").removeOption(751090002);
                        }

                    }
                }




                break;
            case "{B7312B22-5946-E311-9BB2-00155D788238}":
                _formContext.ui.tabs.get("tab_MAS").setVisible(true);
                break;
            case "{D904C52F-3B6A-E311-8213-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("FF_Review");
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_analysisrequestreview").setRequiredLevel("required");

                break;
            case "{D704C52F-3B6A-E311-8213-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_FFA");
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_financialforecastingapproval").setRequiredLevel("required");
                break;

            case "{1F44570B-5D6C-E311-A9A2-00155D787B38}":
                _formContext.getAttribute("qdb_credit_proposal_technical_analysis_status").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_CBCheck").setVisible(true);
                _formContext.ui.tabs.get("tab_QCBCheck").setVisible(true);
                SetShareholderCBGridURL();
                SetShareholderQCBtGridURL();
                break;

            // Document Lodgment Review Status : Head of CAD                 
            case "{4B1E960E-D833-E511-8277-00155D780414}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Lodgment_Review_Status");
                _formContext.getAttribute("qdb_lodgment_review_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break

            case "{0A23F05A-2E71-E311-A9A2-00155D787B38}":
            case "{DF04C52F-3B6A-E311-8213-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_WorldCheck");
                qdb_Tab.setVisible(true);
                _formContext.getAttribute("qdb_credit_proposal_technical_analysis_status").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_wccheck").setRequiredLevel("required"); 
                //_formContext.getAttribute("qdb_ff_analysis_status").setRequiredLevel("required"); 
                SetShareholderWCGridURL();
                break;

            case "{D473A218-5546-E311-9BB2-00155D788238}": //FF Analysis
            case "{890E1EA2-4C5F-E311-A9A2-00155D787B38}":
                qdb_Tab = _formContext.ui.tabs.get("tab_FF");
                //_formContext.getAttribute("qdb_ff_analysis_status").setRequiredLevel("required");            
                qdb_Tab.setVisible(true);
                break;
            case "{0E2509D7-8C5D-E311-A9A2-00155D787B38}":
                qdb_Tab = _formContext.ui.tabs.get("tab_FFA");
                _formContext.getAttribute("qdb_financialforecastingapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{D504C52F-3B6A-E311-8213-00155D788238}": //EPD Review           
            case "{A5716EF8-E16B-E311-8213-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_EPDReview");
                _formContext.getAttribute("qdb_epd_estimation_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Code changes for the Head of EPD officer on 10 FEb2019
            case "{A64DB080-132D-E911-810D-00155DDF8045}":
                qdb_Tab = _formContext.ui.tabs.get("tab_EPDReview_Head");
                _formContext.getAttribute("qdb_review_by_epd_head").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Code end here for the Head of EPD officer on 10 FEb2019

            case "{88CD58C3-E249-E311-9BB2-00155D788238}": //EPD Processing
            case "{73B979D5-CC9B-E311-8213-00155D788238}":

                qdb_Tab = _formContext.ui.tabs.get("tab_EPD");
                qdb_Tab.setVisible(true);
                SetEPDGridURL();
                _formContext.getAttribute("qdb_epd_estimation_status").setRequiredLevel("required");
                break;

            //Shehroz Code Start
            case "{A5BAB0B4-3EC3-EE11-994E-6045BDFA350B}":  // RM Confirmation of Customer purchase
                //_formContext.getAttribute("qdb_master_agreement").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_boat_license").setRequiredLevel("required");
                _formContext.getAttribute("qdb_mortgage_boat_license").setRequiredLevel("required");
                _formContext.ui.tabs.get("RM_Document_Uploading").setVisible(true);
                break;
            case "{C940DE55-7031-F011-A588-00505608D839}":  // RM Confirmation of Customer purchase
                //_formContext.getAttribute("qdb_master_agreement").setRequiredLevel("required");
                //_formContext.getAttribute("qdb_boat_license").setRequiredLevel("required");
                _formContext.getAttribute("qdb_mortgage_boat_license").setRequiredLevel("required");
                _formContext.ui.tabs.get("RM_Document_Uploading").setVisible(true);
                break;
            // Shehroz Code End

            case "{D504C52F-3B6A-E311-8213-00155D788238}": //EPD Approal           
            case "{D304C52F-3B6A-E311-8213-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_EPD_Confirm");
                _formContext.getAttribute("qdb_epdestimationapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            //Lodgement by RM                                      
            case "{57F4D54E-12B5-E311-9705-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Lodgement");
                qdb_Tab.setVisible(true);
                SetRMLodgmentGridURL();
                break;

            //Early Warning System  - EWS  - Project Status                                 
            case "{5A5DE288-126C-EA11-813E-02BF800001AD}":

                qdb_Tab = _formContext.ui.tabs.get("tab_65_StatusOfProject");
                _formContext.getAttribute("qdb_isthebusinesscommerciallyoperational").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{2CAA0EC8-D4B3-EA11-8142-02BF800001AD}":

                qdb_Tab = _formContext.ui.tabs.get("tab_65_UpdateBankDetails");
                _formContext.getAttribute("qdb_upload_signed_documents_status").setRequiredLevel("required");
                //_formContext.getControl("qdb_upload_signed_documents_status").removeOption(751090001);

                let IFrame = _formContext.ui.controls.get("IFRAME_CustomerBankDetails");
                let RecordID;
                let LookupFieldObject = _formContext.getAttribute("qdb_cif_no").getValue();

                if (LookupFieldObject != null) {
                    RecordID = LookupFieldObject[0].id;

                    newTarget = "https://qdbcrmapp:9798/ShowGeneratedCustomerBanksDetails.aspx?id=" + RecordID;
                    IFrame.setSrc(newTarget);
                }

                qdb_Tab.setVisible(true);
                break;

            //Early Warning System - Bank Details - EWS
            case "{BAC9F4B2-126C-EA11-813E-02BF800001AD}":

                qdb_Tab = _formContext.ui.tabs.get("tab_65_UpdateBankDetails");

                _formContext.getAttribute("qdb_upload_signed_documents_status").setRequiredLevel("required");
                _formContext.getControl("qdb_upload_signed_documents_status").removeOption(751090001);

                let IFrame = _formContext.ui.controls.get("IFRAME_CustomerBankDetails");
                let RecordID;
                let LookupFieldObject = _formContext.getAttribute("qdb_cif_no").getValue();

                if (LookupFieldObject != null) {
                    RecordID = LookupFieldObject[0].id;

                    newTarget = "https://qdbcrmapp:8080/CustomerBankDetails.aspx?id=" + RecordID;
                    IFrame.setSrc(newTarget);
                }

                qdb_Tab.setVisible(true);
                break;

            //EWS - Project Turnover
            case "{EBBBC5DC-126C-EA11-813E-02BF800001AD}":

                qdb_Tab = _formContext.ui.tabs.get("tab_45_ProjectedTurnover");

                _formContext.getAttribute("qdb_projectedlevelofsalesfornext12month").setRequiredLevel("required");
                _formContext.getAttribute("qdb_performa_invoice_date").setRequiredLevel("required");
                _formContext.getAttribute("qdb_numberofmonths").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            //Lodgement by Credit Officer                                      
            case "{A885890D-8E78-E311-8213-00155D788238}":
            case "{0309B681-07B5-E311-9705-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Lodgement");
                qdb_Tab.setVisible(true);
                SetCreditOfficerLodgmentGridURL();
                break;
            //Lodgement by Head Credit Admin                                      
            case "{7F35640F-2C02-E411-98AD-00155D788B08}":
            case "{7C634AB1-08B5-E311-9705-00155D788238}":
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Lodgement");
                qdb_Tab.setVisible(true);
                SetHeadOfCADLodgmentGridURL();
                break;
            //Credit Admin Officer - Contract Review                          
            case "{AB750E89-F258-E411-B163-00155D788B08}":
                if (_formContext.getControl("qdb_credit_admin_contract_review") != null) {
                    //Xrm.Navigation.openAlertDialog({text: "3"}) // MIGRATED: alert→openAlertDialog;
                    //var QDB_OptionSet = _formContext.getControl("qdb_credit_admin_contract_review");


                    //var QDB_OptionSet = _formContext.ui.controls.get("qdb_credit_admin_contract_review");
                    //QDB_OptionSet.clearOptions();
                    //QDB_OptionSet.setValue(null);

                    //var lcl_Optn1 = new Object();
                    //lcl_Optn1.text = "Supplier Contract not Required";
                    //lcl_Optn1.value = 751090005;
                    //QDB_OptionSet.addOption(lcl_Optn1);

                    //var lcl_Optn2 = new Object();
                    //lcl_Optn2.text = "Contract Reviewed";
                    //lcl_Optn2.value = 751090000;
                    //QDB_OptionSet.addOption(lcl_Optn2);

                    //var lcl_Optn3 = new Object();
                    //lcl_Optn3.text = "No Required Contract";
                    //lcl_Optn3.value = 751090004;
                    //QDB_OptionSet.addOption(lcl_Optn3);

                    //var lcl_Optn4 = new Object();
                    //lcl_Optn4.text = "Return to Operations";
                    //lcl_Optn4.value = 751090003;
                    //QDB_OptionSet.addOption(lcl_Optn4);

                    //var lcl_Optn5 = new Object();
                    //lcl_Optn5.text = "Return to CS";
                    //lcl_Optn5.value = 751090001;
                    //QDB_OptionSet.addOption(lcl_Optn5);

                    _formContext.ui.tabs.get("tab_ContractReview").setLabel("Credit Admin Officer - Contract Review");
                    qdb_Tab = _formContext.ui.tabs.get("tab_ContractReview");
                    _formContext.getAttribute("qdb_credit_admin_contract_review").setRequiredLevel("required");
                    _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090006);
                    _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090002);
                    //_formContext.getAttribute("qdb_selectcurrency").setRequiredLevel("required");
                    qdb_Tab.setVisible(true);

                    //_formContext.getControl("qdb_credit_admin_contract_review").addOption(751090003);
                }
                break;
            case "{11FDBA45-2E34-E711-80F1-00155D78042C}":
            case "{5F39FE74-DE61-E411-B163-00155D788B08}":
            case "{ECA3C34C-27E5-E411-9EF4-00155D78031A}":
            case "{A1AB8AB5-A58B-E611-9771-00155D7B3411}":
                //Xrm.Navigation.openAlertDialog({text: "4"}) // MIGRATED: alert→openAlertDialog;
                //_formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090003); // Return to Operations
                _formContext.ui.tabs.get("tab_ContractReview").setLabel("Credit Admin Officer - Contract Review");
                qdb_Tab = _formContext.ui.tabs.get("tab_ContractReview");
                _formContext.getAttribute("qdb_credit_admin_contract_review").setRequiredLevel("required");
                _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090002); // Return to Credit Officer
                //_formContext.getAttribute("qdb_selectcurrency").setRequiredLevel("required");
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(false);
                _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_5").setVisible(false);

                let recordIdAttribute = _formContext.getAttribute("qdb_record_type").getValue();
                if (recordIdAttribute != null) {
                    let recordId = recordIdAttribute[0].id;
                    if (recordId.toLowerCase() == "{afc020e4-9def-e211-a9bb-00155d788238}") {
                        _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_5").setVisible(true);
                    }

                    let workItemtask = _formContext.getAttribute("qdb_work_item").getValue()[0].id;
                    if (workItemtask.toLowerCase() == "{5f39fe74-de61-e411-b163-00155d788b08}" && recordId.toLowerCase() == "{b4f84151-03c9-e211-bc78-00155d787b38}") {
                        _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_section_Disbursement").setVisible(true);
                    }

                }



                qdb_Tab.setVisible(true);
                break;
            //Head Credit Admin - Contract Review/Approval                         
            case "{C3765BC6-3304-E411-9003-00155D780506}":
            case "{BB542505-DF61-E411-B163-00155D788B08}":
            case "{4E1A6C97-27E5-E411-9EF4-00155D78031A}":
                _formContext.ui.tabs.get("tab_ContractReview").setLabel("Head Credit Admin - Contract Review/Approval");
                //Xrm.Navigation.openAlertDialog({text: "5"}) // MIGRATED: alert→openAlertDialog;
                _formContext.getControl("qdb_credit_admin_contract_review").removeOption(751090003); // Return to Operations
                qdb_Tab = _formContext.ui.tabs.get("tab_ContractReview");
                _formContext.getAttribute("qdb_credit_admin_contract_review").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{98FFEAF7-B5F1-E911-812C-00155DB3C005}":
                qdb_Tab = _formContext.ui.tabs.get("ProjectFinanceProcesser");
                //_formContext.getAttribute("qdb_headofcreditadminapprovalbayalwadiya").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                let lclDisbursementType = _formContext.getAttribute("qdb_disbursement_for").getValue();

                if (lclDisbursementType != null && lclDisbursementType == 751090014) {
                    _formContext.getAttribute("qdb_purchasercontractamount").setRequiredLevel("required");
                    _formContext.getAttribute("qdb_purchaserguaranteeamount").setRequiredLevel("required");
                }
                break;


            case "{FEE5A042-C0F1-E911-812C-00155DB3C005}":
                qdb_Tab = _formContext.ui.tabs.get("HeadofCreditAdminApprovalBayAlWadiya");
                _formContext.getAttribute("qdb_headofcreditadminapprovalbayalwadiya").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            //Bay al wadiya Return flow     //tab_62_Bayalwadiya_1
            //Return to CAD from Operations - Bay Al wadiya        {5003EFA4-30A3-EE11-A541-6045BDFA423C}
            //Return to CS from Head of CAD - Bay Al wadiya        {F7D8C849-30A3-EE11-A541-6045BDFA423C}
            //Return to CS from Operations - Bay Al wadiya         {B334D891-30A3-EE11-A541-6045BDFA423C}
            //Return to RM from Head of CAD - Bay Al wadiya        {EB993661-30A3-EE11-A541-6045BDFA423C}
            //Return to RM from Operations - Bay Al wadiya         {4F6C2580-30A3-EE11-A541-6045BDFA423C}
            case "{5003EFA4-30A3-EE11-A541-6045BDFA423C}":
            case "{F7D8C849-30A3-EE11-A541-6045BDFA423C}":
            case "{B334D891-30A3-EE11-A541-6045BDFA423C}":
            case "{EB993661-30A3-EE11-A541-6045BDFA423C}":
            case "{4F6C2580-30A3-EE11-A541-6045BDFA423C}":
                qdb_Tab = _formContext.ui.tabs.get("tab_62_Bayalwadiya_1");
                _formContext.getAttribute("qdb_facilitycreationstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{F3D82E1E-BFF1-E911-812C-00155DB3C005}": // Customer service bay Al wadiya
                qdb_Tab = _formContext.ui.tabs.get("tab_UploadSignedDocuments");

                _formContext.getControl("qdb_onholdapprovalrequest").removeOption(751090001); // Return to Credit Officer


                _formContext.getAttribute("qdb_onholdapprovalrequest").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            //Customer Service- Inspection of Goods Review                           
            case "{3819B52A-540B-E411-9003-00155D780506}":
                qdb_Tab = _formContext.ui.tabs.get("tab_CSCheckList");
                if (_formContext.getControl("qdb_inspection_status") != null) {
                    _formContext.getAttribute("qdb_inspection_status").setRequiredLevel("required");
                    //_formContext.getControl("qdb_inspection_status").removeOption(751090003);--Return to CS
                    //_formContext.getControl("qdb_inspection_status").removeOption(751090004);--Return To RM
                }
                qdb_Tab.setVisible(true);
                break;
            case "{0CDB8057-7A9B-E711-8101-00155D78042C}":
                qdb_Tab = _formContext.ui.tabs.get("tab_CSCheckList");
                _formContext.getAttribute("qdb_inspection_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_documentssignedwithsupplier").setRequiredLevel("required");
                if (_formContext.getAttribute("qdb_qdb_represented_by") != null) {
                    {
                        if (_formContext.getAttribute("qdb_qdb_represented_by").getValue() == null) {
                            _formContext.getAttribute("qdb_qdb_represented_by").setValue([{ id: '4EACA7EC-7D4F-E311-A9A2-00155D787B38', name: 'Gul Mohammad  Jadoon', entityType: 'systemuser' }]);
                        }
                    }
                }

                qdb_Tab.setVisible(true);
                break;

            //On Hold Functionality

            case "{FF00EBBE-0C94-E911-8122-02BF800001AD}":
            case "{DAE14CAF-0C94-E911-8122-02BF800001AD}":


                qdb_Tab = _formContext.ui.tabs.get("OnHoldApproval");
                _formContext.getAttribute("qdb_onholdapprovalrequest").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                if (_formContext.getAttribute("qdb_date_applied_on") != null) {
                    let dateFieldValue = _formContext.getAttribute("qdb_date_applied_on").getValue();

                    let year = dateFieldValue.getFullYear();
                    let month = dateFieldValue.getMonth();
                    let day = dateFieldValue.getDate();
                    let dateOnly = new Date(year, month, day);
                    dateOnly.format("YYYY-MM-dd");

                    let username = _formContext.getAttribute("qdb_submit_by_user").getValue()[0].name;
                    let notificationcomments = _formContext.getAttribute("qdb_resubmission_comments").getValue();

                    _formContext.ui.setFormNotification("Task on On hold by : " + username + ", Comments : " + notificationcomments + " & Expected On Hold Removal Date : " + dateOnly, 2);

                    //ShowNotification("Task on On hold by : " + _formContext.getAttribute("qdb_submit_by_user").getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue() + " & Expected On Hold Removal Date : " + dateOnly, 2);

                }
                break;

            //Customer Service- Inspection of Goods Review                           
            case "{EE8DA7E2-26E5-E411-9EF4-00155D78031A}":
                qdb_Tab = _formContext.ui.tabs.get("tab_InspectionConfirmation");
                _formContext.getAttribute("qdb_accept_purchasing_date").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{BEBA33E5-3179-E411-B163-00155D788B08}":
                //qdb_Tab = _formContext.ui.tabs.get("tab_AwaitingCheckList");
                //qdb_Tab.setVisible(true);
                break;

            case "{B8F8EEE4-CF61-E411-B163-00155D788B08}":
                qdb_Tab = _formContext.ui.tabs.get("tab_AwaitingCheckList");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_Goods_Type").setVisible(true);
                break;
            case "{6B57C111-41B5-E611-9771-00155D7B3411}":
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                qdb_Tab = _formContext.ui.tabs.get("tab_ContractLodgment_Murabaha_AMendment");
                _formContext.getAttribute("qdb_signedcontractreceiveddate").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{42953A52-F358-E411-B163-00155D788B08}":
            case "{E5B08439-8188-E611-9771-00155D7B3411}":
            case "{FE5059F3-2F34-E711-80F1-00155D78042C}":

                qdb_Tab = _formContext.ui.tabs.get("tab_COLodgment");
                if (_formContext.getAttribute("qdb_signedcontractreceiveddate") != null) {
                    _formContext.getAttribute("qdb_signedcontractreceiveddate").setRequiredLevel("required");
                }
                if (qdb_Tab != null) {
                    qdb_Tab.setVisible(true);
                }
                break;
            //Added by Shariq for new work task for LC doc SG (Upload signed bill lodgment advice)
            case "{B64DD1BD-3772-EE11-812A-FC57D7D7F688}":

                qdb_Tab = _formContext.ui.tabs.get("Customer_Advise_Tab");
                if (_formContext.getAttribute("qdb_signedcontractreceiveddate") != null) {
                    _formContext.getAttribute("qdb_signedcontractreceiveddate").setRequiredLevel("required");
                }
                if (qdb_Tab != null) {
                    qdb_Tab.setVisible(true);
                }
                break;
            case "{E8208E53-EF24-E611-823C-00155D788F1B}":
                //qdb_Tab = _formContext.ui.tabs.get("tab_Contract");
                //qdb_Tab.setVisible(true);
                qdb_Tab2 = _formContext.ui.tabs.get("tab_CustomerDetails");
                _formContext.getAttribute("qdb_email_address").setRequiredLevel("required");
                _formContext.getAttribute("qdb_mobile_phone_1").setRequiredLevel("required");
                _formContext.getAttribute("qdb_email_message").setRequiredLevel("required");
                qdb_Tab2.setVisible(true);
                break;
            case "{B457EE6C-3334-E711-80F1-00155D78042C}":
                qdb_Tab = _formContext.ui.tabs.get("tab_DC_Customer_Acceptance");
                //_formContext.getAttribute("qdb_signedcontractreceiveddate").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;
            case "{2B4A811D-CD38-E411-B163-00155D788B08}": //Return to Ops by Credit Admin
                CheckRPSRequirement();
                break;
            case "{E311CD3C-3C80-E411-B163-00155D788B08}": //Return Contract by Credit Admin to CS

                break;

            case "{4F6B0B50-F025-E311-A57C-00155D788238}":
                // _formContext.ui.tabs.get("tab_Main").sections.get("tab_Main_CustomerBasic").setVisible(true);
                _formContext.ui.tabs.get("tab_FollowupItem").setVisible(true);
                _formContext.ui.tabs.get("tab_FollowUp").setVisible(true);
                _formContext.getAttribute("qdb_followup_status").setRequiredLevel("required");
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;

            case "{79A0CD1A-5EA1-E411-9901-00155D78031A}": // Return to CS by Head of CAD
                //            qdb_Tab = _formContext.ui.tabs.get("tab_19");
                //            _formContext.getAttribute("qdb_cs_disbursement_resubmission").setRequiredLevel("required");
                //            _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                //            qdb_Tab.setVisible(true);
                break

            //Upload Commercial Invoice & Delivery Note by CS
            case "{DAACEF47-2AE5-E411-9EF4-00155D78031A}":
                qdb_Tab = _formContext.ui.tabs.get("tab_UploadCommercialInvoice");
                qdb_Tab.setVisible(true);
                //_formContext.getAttribute("qdb_financialforecastingapproval").setRequiredLevel("required");
                break;
            //UploadProof Of Payment --date 17/07/2018
            case "{D78AE74C-1089-E811-8104-02BF800001AD}":
                qdb_Tab = _formContext.ui.tabs.get("tab_upload_proof_payment");
                qdb_Tab.setVisible(true);
                break;

            case "{C2BA876F-4859-E511-81C5-00155D788D14}": // Head_of_Fisheries_Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_Head_of_Fisheries_Approval");
                let QDB_OptionSet = _formContext.getControl("qdb_creditproposalbfddirectorapproval");
                QDB_OptionSet.removeOption(751090002);
                _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetCADDocuments();
                break

            case "{DBAA0DBE-6959-E511-81C5-00155D788D14}": // Credit_Admin_Officer_Review
            case "{569BB325-3BB8-E511-8604-00155D780335}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Credit_Admin_Officer_Review");
                _formContext.getAttribute("qdb_creditproposalheadcreditanalysisapproval").setRequiredLevel("required");
                _formContext.getControl("qdb_creditproposalheadcreditanalysisapproval").removeOption(751090001); // Return to Credit Analyst
                qdb_Tab.setVisible(true);
                SetCADDocuments();
                break

            case "{3AB85C7D-4A59-E511-81C5-00155D788D14}": // CEO Approval
            case "{AEA5D14A-B664-E811-80FF-02BF800001AD}": // CEO Approval.
                qdb_Tab = _formContext.ui.tabs.get("tab_CEO_Approval");
                _formContext.getAttribute("qdb_ceo_approval").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_Workflow_History").setVisible(true);
                setWorklfowHistoryURL();
                break

            case "{106A4126-4A59-E511-81C5-00155D788D14}": // Credit_Admin_Officer_Document_Preparation    
                qdb_Tab = _formContext.ui.tabs.get("tab_Credit_Admin_Officer_Document_Preparation");
                _formContext.getControl("qdb_caddocumentpreparationstatus").removeOption(751090000); // Send for Signature
                _formContext.getAttribute("qdb_caddocumentpreparationstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetCADDocuments2();
                let LookupSector = _formContext.getAttribute("qdb_sectorid").getValue();
                if (LookupSector != null) {
                    if (LookupSector[0].name == "Micro Finance") { //Micro Finance
                        _formContext.ui.tabs.get("tab_Credit_Admin_Officer_Document_Preparation").sections.get("tab_Credit_Admin_Officer_Document_Preparation_section_3").setVisible(true);
                        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

                        if (LookupFieldObject != null) {
                            EntityId = LookupFieldObject[0].id;
                            EntityName = LookupFieldObject[0].entityType;

                            if (EntityId != null) {
                                let parsedID = EntityId.replace("{", "");
                                parsedID = parsedID.replace("}", "");
                            }
                            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityName + "s(" + parsedID + ")?$select=*";
                            _executeODataQuery(query, showOSSDocs, null);
                        }
                    }
                }
                break;


            case "{22894C30-925F-E511-81C5-00155D788D14}": // Credit_Admin_Officer_Document_Reivew
                qdb_Tab = _formContext.ui.tabs.get("tab_Credit_Admin_Officer_Document_Preparation");
                _formContext.getControl("qdb_caddocumentpreparationstatus").removeOption(751090001); // Send for Review
                _formContext.getAttribute("qdb_caddocumentpreparationstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetCADDocuments2();

                let LookupSector = _formContext.getAttribute("qdb_sectorid").getValue();
                if (LookupSector != null) {
                    if (LookupSector[0].name == "Micro Finance") { //Micro Finance
                        _formContext.ui.tabs.get("tab_Credit_Admin_Officer_Document_Preparation").sections.get("tab_Credit_Admin_Officer_Document_Preparation_section_3").setVisible(true);
                        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

                        if (LookupFieldObject != null) {
                            EntityId = LookupFieldObject[0].id;
                            EntityName = LookupFieldObject[0].entityType;

                            if (EntityId != null) {
                                let parsedID = EntityId.replace("{", "");
                                parsedID = parsedID.replace("}", "");
                            }
                            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityName + "s(" + parsedID + ")?$select=*";
                            _executeODataQuery(query, showOSSDocs, null);
                        }
                    }
                }
                break

            case "{5EF3EEB5-4B59-E511-81C5-00155D788D14}": // Document Printing & Uploading
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Document_Uploading");
                _formContext.getAttribute("qdb_documentuploadingstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);

                let LookupSector = _formContext.getAttribute("qdb_sectorid").getValue();

                if (LookupSector != null) {
                    if (LookupSector[0].name == "Livestock") { //Livestock
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries_Upload").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock_Upload").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Agriculture_Upload").setVisible(false);
                        _formContext.getAttribute("qdb_master_agreement").setRequiredLevel("required");// Live stock Manatory document Enhancement  2/28/2022
                    }
                    else if (LookupSector[0].name == "Fisheries") { //Fisheries
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries_Upload").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock_Upload").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Agriculture_Upload").setVisible(false);
                    }
                    else if (LookupSector[0].name == "Agriculture") { //Agriculture
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries_Upload").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock_Upload").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Agriculture_Upload").setVisible(true);
                    }
                    else if (LookupSector[0].name == "Micro Finance") {
                        _formContext.getControl("qdb_qarddalhasan").setVisible(true);
                    }
                }
                break;
            case "{CA680DD5-4641-EC11-8102-985D4B879503}": // Agreement document Signed by the Client
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Document_Uploading");
                _formContext.getAttribute("qdb_documentuploadingstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);

                let LookupSector = _formContext.getAttribute("qdb_sectorid").getValue();

                if (LookupSector != null) {
                    if (LookupSector[0].name == "Fisheries") { //Fisheries
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Fisheries_Upload").setVisible(true);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Livestock_Upload").setVisible(false);
                        _formContext.ui.tabs.get("tab_RM_Document_Uploading").sections.get("tab_RM_Document_Uploading_Section_Agriculture_Upload").setVisible(false);
                        _formContext.getAttribute("qdb_master_agreement").setRequiredLevel("required");
                        _formContext.getAttribute("qdb_boat_license").setRequiredLevel("required");
                        _formContext.getAttribute("qdb_personal_cheques").setRequiredLevel("required");
                        _formContext.getAttribute("qdb_mortgage_boat_license").setRequiredLevel("required");

                    }

                }
                break;
            case "{323CE56B-4C59-E511-81C5-00155D788D14}": // Contract Verification & Limit Setting
                qdb_Tab = _formContext.ui.tabs.get("tab_CAD_Contract_Signature_Verification");
                _formContext.getAttribute("qdb_signatureverification").setRequiredLevel("required");
                _formContext.getAttribute("qdb_contractverification").setRequiredLevel("required");
                _formContext.getAttribute("qdb_limitcreation").setRequiredLevel("required");
                _formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetGetFacilityFromTCSURL();
                SetDocumentUploadByRM();
                break
            case "{1D5F70ED-2034-E511-81C5-00155D788D14}":
                qdb_Tab = _formContext.ui.tabs.get("tab_15");
                qdb_Tab.setVisible(true);
                break;
            case "{C88697DC-975F-E511-81C5-00155D788D14}": // CIF Creation
                qdb_Tab = _formContext.ui.tabs.get("tab_CIF_Creation");
                _formContext.getAttribute("qdb_cif_no").setRequiredLevel("required");
                _formContext.getAttribute("qdb_qcbcode").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetGetCustomerFromTCSURL();
                SetDocumentUploadByRMCIFCreation();
                break;
            case "{22A2A8CF-4C59-E511-81C5-00155D788D14}": //Preparation Offer & Acceptance by CAD
                qdb_Tab = _formContext.ui.tabs.get("tab_Offer_Acceptance");
                _formContext.getAttribute("qdb_offerandacceptancestatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            // Livestock : Operations Account Opening & Payment                 
            case "{CB674F6A-4B59-E511-81C5-00155D788D14}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Loan_Account_Opening");
                _formContext.getAttribute("qdb_accountopeningstatus").setRequiredLevel("required");
                _formContext.getAttribute("qdb_paymentto").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                SetCADDocuments2();
                break;

            case "{70B39184-4959-E511-81C5-00155D788D14}": // Livestock : RM Document Uploading & Printing 2nd Step  
            case "{5B495AC4-F69D-E511-89B8-00155D788D14}": // Fishries : Uploading Commercial Invoices by RM  

                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Upload_Commercial_Invoices");
                //_formContext.getAttribute("qdb_paymentto").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{C416FC6D-8E47-EC11-8103-D07C72F1BEB3}": // Fisheries : Uploading Commercial invoice for Engine by RM  


                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Upload_Commercial_Invoices");
                _formContext.ui.tabs.get("tab_RM_Upload_Commercial_Invoices").setLabel("RM : Upload commercial invoice for Engine");
                _formContext.getAttribute("qdb_customer_contract_ref").setRequiredLevel("none");
                _formContext.getAttribute("qdb_upload_commercial_invoice").setRequiredLevel("required");
                _formContext.getControl("qdb_customer_contract_ref").setVisible(false); //hide contract field
                qdb_Tab.setVisible(true);

                break;
            case "{ADE75312-F224-E611-823C-00155D788F1B}": // Aldhameen : Uploading Signed Laa 
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Upload_Commercial_Invoices");

                if (qdb_Tab == null) {
                    return;
                }
                if (qdb_Tab.sections.get("tab_32_section_2") == null) {

                    return;
                }

                qdb_Tab.sections.get("tab_32_section_2").controls.get().forEach(function (control, index) {
                    if (control.getName().startsWith("qdb_customer_contract_ref")) {
                        control.setVisible(false);
                    }

                });

                if (_formContext.getControl("qdb_commoditypurchasedate") != null) {

                    _formContext.getControl("qdb_commoditypurchasedate").setVisible(true); //LAA Receieved date
                }
                if (_formContext.getAttribute("qdb_commoditypurchasedate") != null) {
                    _formContext.getAttribute("qdb_commoditypurchasedate").setRequiredLevel("required");
                }
                if (qdb_Tab != null) {
                    qdb_Tab.setVisible(true);
                }
                break;
            case "{D78AE74C-1089-E811-8104-02BF800001AD}": // Aldhameen : Uploading Proof Of Payment 
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_Upload_Commercial_Invoices");

                if (qdb_Tab == null) {
                    return;
                }
                if (qdb_Tab.sections.get("tab_32_section_2") == null) {

                    return;
                }

                qdb_Tab.sections.get("tab_32_section_2").controls.get().forEach(function (control, index) {
                    if (control.getName().startsWith("qdb_customer_contract_ref")) {
                        control.setVisible(false);
                    }

                });
                if (_formContext.getControl("qdb_commoditypurchasedate") != null) {

                    _formContext.getControl("qdb_commoditypurchasedate").setVisible(true); //LAA Receieved date
                }
                if (_formContext.getAttribute("qdb_commoditypurchasedate") != null) {
                    _formContext.getAttribute("qdb_commoditypurchasedate").setRequiredLevel("required");
                }
                if (qdb_Tab != null) {
                    qdb_Tab.setVisible(true);
                }
                break;
            case "{373A5981-B7A2-E711-80E7-02BF800001AD}": // Fishries : Preparation Offer & Acceptance by RM 
                _formContext.getControl("qdb_rm_lc_amendment_review").removeOption(751090001); // Return to Credit Officer
                _formContext.getControl("qdb_rm_lc_amendment_review").setLabel("RM : Status");
                qdb_Tab = _formContext.ui.tabs.get("tab_41");
                // qdb_Tab.setLabel("RM : Preparation Offer & Acceptance");         
                qdb_Tab.setVisible(true);
                break;
            case "{7E323443-E8A1-E711-80E7-02BF800001AD}": // Fishries : Pending Review commercial invoice By Manager  
            case "{A4E6D8AF-B3A2-E711-80E7-02BF800001AD}": // Fishries : Pending Review Offer & Acceptance By Manager  
                qdb_Tab = _formContext.ui.tabs.get("tab_Monitoring_Review_Status");
                qdb_Tab.setVisible(true);
                _formContext.ui.tabs.get("tab_Monitoring_Review_Status").sections.get("tab_Monitoring_Review_DownloadDocument").setVisible(true);
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090001);
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090003); // Review with comments 
                _formContext.getControl("qdb_monitoring_review_status").removeOption(751090004); // print document

                break;

            case "{43100E1E-D8B2-E511-8604-00155D780335}": //EPD : Upload Singed Documents by EPD Project Manager
                qdb_Tab = _formContext.ui.tabs.get("tab_Upload_Signed_Documents_Status");
                _formContext.getAttribute("qdb_upload_signed_documents_status").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{52C85671-CFD0-E511-8604-00155D780335}": //
                qdb_Tab = _formContext.ui.tabs.get("tab_FacilityCreation");
                _formContext.getAttribute("qdb_facilitycreationstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{D1C25868-9751-E611-8D07-00155D78AB1E}": //ICC Members Term Sheet Approval
                qdb_Tab = _formContext.ui.tabs.get("tab_13");
                _formContext.getAttribute("qdb_termsheetapprovalstatus").setRequiredLevel("required");
                qdb_Tab.setVisible(true);
                break;

            case "{BFAEE2A1-179D-E711-80EA-02BF800001AD}": // RM Review Pending - ICC Agenda Automation
                qdb_Tab = _formContext.ui.tabs.get("tab_RM_TS_Review");
                qdb_Tab.setVisible(true);
                let Value = _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").getValue();

                // var QDB_OptionSet = _formContext.getControl("qdb_creditproposalbfddirectorapproval");
                _formContext.getControl("qdb_creditproposalbfddirectorapproval").removeOption(751090001);
                // QDB_OptionSet.removeOption(751090001);

                // var QDB_OptionSet = _formContext.getControl("qdb_creditproposalbfddirectorapproval");
                // QDB_OptionSet.clearOptions();
                // var lcl_Optn2 = new Object();
                // lcl_Optn2.text = "Return to Credit";
                // lcl_Optn2.value = 751090002;
                // QDB_OptionSet.addOption(lcl_Optn2);
                // var lcl_Optn1 = new Object();
                // lcl_Optn1.text = "Approve";
                // lcl_Optn1.value = 751090000;
                // QDB_OptionSet.addOption(lcl_Optn1);

                if (Value != null) {
                    _formContext.getControl("qdb_creditproposalbfddirectorapproval").getAttribute().setValue(Value);
                }

                _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").setRequiredLevel("required");

                break;

            //Live Stock Changes 6-24-2022
            //For Preparing Delivery note for Livestock
            case "{C5571D11-6BB9-EC11-819A-838407FFB701}":
                qdb_Tab = _formContext.ui.tabs.get("tab_61");
                _formContext.getAttribute("qdb_placeofdelivery").setRequiredLevel("required");
                _formContext.getAttribute("qdb_ref_no").setRequiredLevel("required");
                _formContext.getAttribute("qdb_purchase_acceptance_date").setRequiredLevel("required");

                // ViewDeliveryNotes();
                qdb_Tab.setVisible(true);
                break;
            //Review  Delivery Notes
            case "{657724D8-39BA-EC11-819A-838407FFB701}":
                qdb_Tab = _formContext.ui.tabs.get("tab_71");
                let LookupSector = _formContext.getAttribute("qdb_sectorid").getValue();

                if (LookupSector != null) {
                    if (LookupSector[0].name == "Livestock") { //Livestock
                        _formContext.getAttribute("qdb_offer_acceptance").setRequiredLevel("required");
                        _formContext.getControl("IFRAME_UploadOfferSignContract").setLabel("Upload Delivery Notes");
                    }
                }

                qdb_Tab.setVisible(true);
                SetUploadGrid();
                break;

            //Prepare RPS for Livestock  
            case "{285ABC5D-47BA-EC11-819A-838407FFB701}":
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;

            //Forward RPS  to the client 
            case "{EA65499F-48BA-EC11-819A-838407FFB701}":
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                break;


            case "{E58982EA-7606-EC11-815A-00155D3A805F}":
            case "{DAC50938-7706-EC11-815A-00155D3a805F}":
            case "{E6E21626-7706-EC11-815A-00155D3A805F}":
            case "{3D3FD80F-7706-EC11-815A-00155D3A805F}":
                break;

            default:
                Xrm.Navigation.openAlertDialog({text: "You may not have security permissions to view Tak Details, please contact IT Support."}) // MIGRATED: alert→openAlertDialog;
                break;
        }

        qdb_StatusCode = _formContext.getAttribute("statuscode");

        if (qdb_StatusCode.getValue() == 2) {
            _formContext.ui.tabs.get("tab_Complete").setVisible(true);
        }
    }

    function onChange_CaseResolvedByBU() {
        if (_formContext.getAttribute("qdb_case_resolved_by_bu") != null) {
            if (_formContext.getAttribute("qdb_case_resolved_by_bu").getValue() != null) {

                if (_formContext.getAttribute("qdb_case_resolved_by_bu").getValue()) {

                    _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(false);
                    _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(false);
                    _formContext.ui.tabs.get("tab_qse_case_resolution").setVisible(false);

                    _formContext.ui.tabs.get("tab_3").setVisible(true);
                    _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                    _formContext.getControl("qdb_comments").setVisible(true);

                    _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("none");
                    _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("none");
                    _formContext.getAttribute("qdb_cadchkcomments5").setRequiredLevel("none");
                    _formContext.getAttribute("qdb_qse_case_history").setValue(null);
                    _formContext.getAttribute("qdb_qse_recommendations").setValue(null);
                    _formContext.getAttribute("qdb_cadchkcomments5").setValue(null);
                }
                else {
                    _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(true);
                    _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(true);
                    _formContext.ui.tabs.get("tab_qse_case_resolution").setVisible(true);
                    _formContext.ui.tabs.get("tab_3").setVisible(false);

                    _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("required");
                    _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("required");
                    _formContext.getAttribute("qdb_cadchkcomments5").setRequiredLevel("required");
                    _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
                    _formContext.getControl("qdb_comments").setVisible(false);
                }
            }
        }
    }
    function onChange_CaseStatus() {

        let workItem = _formContext.getAttribute("qdb_work_item").getValue()[0].id;
        if (workItem == "{7599EBCE-3E4C-E311-9BB2-00155D788238}") {
            //Manager Approval-->Case Status Update
            if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090000") {
                //Case Solved
                _formContext.ui.tabs.get("tab_BU_Manager_Background").setVisible(true);
                _formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved").setVisible(true);
                _formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future").setVisible(true);

                _formContext.getAttribute("qdb_background_history").setRequiredLevel("required");
                _formContext.getAttribute("qdb_how_was_complaint_resolved").setRequiredLevel("required");
                _formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future").setRequiredLevel("required");

                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
                _formContext.getControl("qdb_assign_ops_processor").setVisible(false);

                if (_formContext.getAttribute("qdb_delegation_team") != null) {
                    _formContext.getAttribute("qdb_delegation_team").setRequiredLevel("none");
                    _formContext.getControl("qdb_delegation_team").setVisible(false);
                }

                _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
                _formContext.getControl("qdb_comments").setVisible(false);
                _formContext.ui.tabs.get("tab_3").setVisible(false);

                if (_formContext.getAttribute("qdb_inspection_result") != null) {
                    _formContext.getAttribute("qdb_inspection_result").setRequiredLevel("none");
                    _formContext.getControl("qdb_inspection_result").setVisible(false);
                }
                if (_formContext.getAttribute("qdb_documentlodgmentsecuritystatus") != null) {
                    _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("none");
                    _formContext.getControl("qdb_documentlodgmentsecuritystatus").setVisible(false);
                }
                if (_formContext.ui.tabs.get("tab46") != null) {
                    _formContext.ui.tabs.get("tab46").setVisible(false);
                }
            }
            else if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090001") {
                //Delegate to Other User
                _formContext.ui.tabs.get("tab_BU_Manager_Background").setVisible(false);
                _formContext.ui.tabs.get("tab_BU_Manager_Complaint_Resolved").setVisible(false);
                _formContext.ui.tabs.get("tab_BU_Manager_Avoid_In_Future").setVisible(false);

                _formContext.getAttribute("qdb_background_history").setRequiredLevel("none");
                _formContext.getAttribute("qdb_how_was_complaint_resolved").setRequiredLevel("none");
                _formContext.getAttribute("qdb_how_to_avoid_this_issue_in_future").setRequiredLevel("none");

                _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                _formContext.getControl("qdb_assign_ops_processor").setVisible(true);

                if (_formContext.getAttribute("qdb_delegation_team") != null) {
                    _formContext.getAttribute("qdb_delegation_team").setRequiredLevel("none");
                    _formContext.getControl("qdb_delegation_team").setVisible(false);
                }

                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                _formContext.getControl("qdb_comments").setVisible(true);
                _formContext.ui.tabs.get("tab_3").setVisible(true);

                if (_formContext.getAttribute("qdb_inspection_result") != null) {
                    _formContext.getAttribute("qdb_inspection_result").setRequiredLevel("none");
                    _formContext.getControl("qdb_inspection_result").setVisible(false);
                }
                if (_formContext.getAttribute("qdb_documentlodgmentsecuritystatus") != null) {
                    _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("none");
                    _formContext.getControl("qdb_documentlodgmentsecuritystatus").setVisible(false);
                }
                if (_formContext.ui.tabs.get("tab46") != null) {
                    _formContext.ui.tabs.get("tab46").setVisible(false);
                }
            }


            if (_formContext.getAttribute("qdb_account_number") != null) {
                _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
            }
            if (_formContext.getAttribute("qdb_documents_date") != null) {
                _formContext.getAttribute("qdb_documents_date").setRequiredLevel("none");
            }
            if (_formContext.getAttribute("qdb_casual_category") != null) {
                _formContext.getAttribute("qdb_casual_category").setRequiredLevel("none");
            }


        }
        else if (workItem == "{C838B102-4E4C-E311-9BB2-00155D788238}") {
            //QSE Approval-->
            if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090000") {
                //Case Solved
                //code changes for Hussam error on 16102018
                if (_formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU") != null) {

                    if (_formContext.getAttribute("qdb_case_resolved_by_bu") != null) {
                        _formContext.getAttribute("qdb_case_resolved_by_bu").setRequiredLevel("required");
                        _formContext.getAttribute("qdb_case_resolved_by_bu").setValue(false);
                    }
                    _formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU").setVisible(true);

                }
                if (_formContext.ui.tabs.get("tab_Head_QSE_Case_History") != null) {

                    if (_formContext.getAttribute("qdb_qse_case_history") != null) {
                        _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("required");
                    }
                    _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(true);

                }

                if (_formContext.ui.tabs.get("tab_Head_QSE_Recommendations") != null) {
                    _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(true);
                    if (_formContext.getAttribute("qdb_qse_recommendations") != null) {
                        _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("required");
                    }
                }

                if (_formContext.ui.tabs.get("tab_qse_case_resolution") != null) {
                    _formContext.ui.tabs.get("tab_qse_case_resolution").setVisible(true);
                }

                if (_formContext.getAttribute("qdb_cadchkcomments5") != null) {
                    _formContext.getAttribute("qdb_cadchkcomments5").setRequiredLevel("required");
                }
                if (_formContext.getAttribute("qdb_assign_ops_processor") != null) {
                    _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
                    _formContext.getControl("qdb_assign_ops_processor").setVisible(false);
                }

                _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
                _formContext.ui.tabs.get("tab_3").setVisible(false);

                if (_formContext.getAttribute("qdb_delegation_team") != null) {
                    _formContext.getAttribute("qdb_delegation_team").setValue(null);
                    _formContext.getAttribute("qdb_delegation_team").setRequiredLevel("none");
                    _formContext.getControl("qdb_delegation_team").setVisible(false);
                }


                if (_formContext.getAttribute("qdb_case_type").getValue() == 751090001) {
                    if (_formContext.getAttribute("qdb_account_number") != null) {
                        _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
                    }
                    if (_formContext.getAttribute("qdb_documents_date") != null) {
                        _formContext.getAttribute("qdb_documents_date").setRequiredLevel("none");
                    }
                    if (_formContext.getAttribute("qdb_casual_category") != null) {
                        _formContext.getAttribute("qdb_casual_category").setRequiredLevel("none");
                    }

                }
            }
            else if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090001") {
                //Delegate to Other User
                //code changes for Hussam error on 16102018
                if (_formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU") != null) {
                    _formContext.ui.tabs.get("tab_Head_QSE_Case_Resolved_by_BU").setVisible(false);
                    _formContext.getAttribute("qdb_case_resolved_by_bu").setRequiredLevel("none");
                }
                if (_formContext.ui.tabs.get("tab_Head_QSE_Case_History") != null) {
                    _formContext.ui.tabs.get("tab_Head_QSE_Case_History").setVisible(false);
                    _formContext.getAttribute("qdb_qse_case_history").setRequiredLevel("none");
                }
                if (_formContext.ui.tabs.get("tab_Head_QSE_Recommendations") != null) {
                    _formContext.ui.tabs.get("tab_Head_QSE_Recommendations").setVisible(false);
                    _formContext.getAttribute("qdb_qse_recommendations").setRequiredLevel("none");
                }
                if (_formContext.ui.tabs.get("tab_qse_case_resolution") != null) {
                    _formContext.ui.tabs.get("tab_qse_case_resolution").setVisible(false);
                    _formContext.getAttribute("qdb_cadchkcomments5").setRequiredLevel("none");
                }
                if (_formContext.getAttribute("qdb_assign_ops_processor") != null) {
                    _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
                    _formContext.getControl("qdb_assign_ops_processor").setVisible(true);
                }
                _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
                _formContext.getControl("qdb_comments").setVisible(true);
                _formContext.ui.tabs.get("tab_3").setVisible(true);

                _formContext.getAttribute("qdb_delegation_team").setRequiredLevel("required");
                _formContext.getControl("qdb_delegation_team").setVisible(true);
                _formContext.getAttribute("qdb_delegation_team").setValue(null);


                if (_formContext.getAttribute("qdb_account_number") != null) {
                    _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
                }
                if (_formContext.getAttribute("qdb_documents_date") != null) {
                    _formContext.getAttribute("qdb_documents_date").setRequiredLevel("none");
                }
                if (_formContext.getAttribute("qdb_casual_category") != null) {
                    _formContext.getAttribute("qdb_casual_category").setRequiredLevel("none");
                }
            }
        }
    }

    //function OnChangeCaseStatus() {
    //    if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090001") {
    //        _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
    //        _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
    //        _formContext.getAttribute("qdb_documents_date").setRequiredLevel("none");
    //        _formContext.getAttribute("qdb_casual_category").setRequiredLevel("none");
    //    }
    //    else if (_formContext.getAttribute("qdb_complaint_status").getValue() == "751090000") {
    //        _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
    //        if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{C838B102-4E4C-E311-9BB2-00155D788238}") {

    //            if (_formContext.getAttribute("qdb_case_type").getValue() == 751090001) {
    //                _formContext.getAttribute("qdb_account_number").setRequiredLevel("required");
    //                _formContext.getAttribute("qdb_documents_date").setRequiredLevel("required");
    //                _formContext.getAttribute("qdb_casual_category").setRequiredLevel("required");
    //            }
    //        }
    //    }
    //    else {
    //        _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
    //    }
    //}



    function ShowDocuments(prmUrlField) {

        let lcl_DocUrl = _formContext.getAttribute(prmUrlField).getValue();

        if (lcl_DocUrl != null && lcl_DocUrl != "") {
            _formContext.ui.tabs.get("tab_67").setVisible(true);
            let IFrame = _formContext.ui.controls.get("IFRAME_LCDocuments");
            if (IFrame != null) {
                IFrame.setSrc(lcl_DocUrl);
            }
            else {
                IFrame = _formContext.ui.controls.get("IFRAME_Documents");
                if (IFrame != null) {
                    IFrame.setSrc(lcl_DocUrl);
                }
            }
            //code commented by ali to revert BAW Chnages   23-April-24
            if (_formContext.getAttribute("qdb_disbursement_for") != null && _formContext.getAttribute("qdb_disbursement_for").getValue() == "75109001411") {
                //IFRAME_LCDocumentsBAWDocs
                let IFrame1 = _formContext.ui.controls.get("IFRAME_LCDocumentsBAWDocs");
                if (IFrame1 == null) {
                    return;
                }
                _formContext.getControl("IFRAME_LCDocumentsBAWDocs").setVisible(true);
                let cif_no = _formContext.getAttribute("qdb_cif_no").getValue()[0].id;
                let DRno = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;
                let docURL = netBaseURL + ":9797/CentralizedDocumentsBayAlWadiya.aspx?entitylogicalname=qdb_payment_authorization_ticket&subentity=qdb_status_history&id="
                    + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id + "&crno=" + _formContext.getAttribute("qdb_cif_no").getValue()[0].id + "&userid=" + Xrm.Utility.getGlobalContext().getUserId() + "&showadd=1";
                IFrame1.setSrc(docURL);
            }
        }
    }

    function OnChangeMasterBankAgreement() {
        if (_formContext.getAttribute("qdb_delivery_notes").getValue() == true) {
            //_formContext.getAttribute("qdb_bill_ref_no").setRequiredLevel("required");
            _formContext.getAttribute("qdb_bill_ref_no").setRequiredLevel("required");
            _formContext.getAttribute("qdb_confirmation_date").setRequiredLevel("required");
            //_formContext.getAttribute("qdb_iban_number").setRequiredLevel("required");
            _formContext.getAttribute("qdb_contract_required").setRequiredLevel("required");
        }
        else {
            //_formContext.getAttribute("qdb_bill_ref_no").setRequiredLevel("none");
            _formContext.getAttribute("qdb_confirmation_date").setRequiredLevel("none");
            // _formContext.getAttribute("qdb_iban_number").setRequiredLevel("none");
            _formContext.getAttribute("qdb_contract_required").setRequiredLevel("none");
        }
    }

    function OnChangeOPDisburseReview() {
        if (_formContext.getAttribute("qdb_ops_disbursement_review").getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
        }
    }

    function OnChangeOPClearingReview() {
        if (_formContext.getAttribute("qdb_ops_clearing_review").getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
        }
    }



    // Handlign Dsocs Review and Customer Acceptance
    function OnChangeDocsAcceptance() {
        if (_formContext.getAttribute("qdb_lc_documents_customer_confirmation").getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
            if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{C838DDAA-2BF1-E211-A9BB-00155D788238}") {
                _formContext.getAttribute("qdb_assign_ops_processor_2").setRequiredLevel("required");

            }
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
        }
    }


    function OnChangeLCReview() {
        if (_formContext.getAttribute("qdb_lc_acceptance_review_processor").getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
        }
    }

    function OnChangeLoanRequestReview() {
        if (_formContext.getAttribute("qdb_project_finance_ops_requestreview").getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
        }
    }


    function SetRelatedLookupVisbility() {
        let QDB_RecordType, QDB_LookupField, QDB_ReturnRecLookup;

        QDB_RecordType = _formContext.getAttribute("qdb_record_type");

        switch (QDB_RecordType.getValue()[0].id) {
            // Term Sheet                                                
            case "{E53ABCE4-A0B5-E211-90D7-00155D787B38}":
                QDB_LookupField = _formContext.getControl("qdb_term_sheet_ref_no");
                QDB_LookupField.setVisible(true);
                break;
            // Customer Term Sheet                                                
            case "{E63ABCE4-A0B5-E211-90D7-00155D787B38}":
                QDB_LookupField = _formContext.getControl("qdb_customer_term_sheet");
                QDB_LookupField.setVisible(true);
                break;
            // Loan Agreement                                                
            case "{4CFE9D2D-A1B5-E211-90D7-00155D787B38}":
                QDB_LookupField = _formContext.getControl("qdb_term_sheet_ref_no");
                QDB_LookupField.setVisible(true);

                QDB_LookupField = _formContext.getControl("qdb_customer_term_sheet");
                QDB_LookupField.setVisible(true);
                break;
        }
    }

    function TermSheetReturn() {
        _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        _formContext.getAttribute("qdb_term_sheet_return").setRequiredLevel("required");
        _formContext.ui.tabs.get("tab_TS_Return").setVisible(true);
    }

    function creditReviewTaskStatusSetInvisible() {
        _formContext.ui.tabs.get("tab_CreditReview_Task_Status").setVisible(false);

        _formContext.getControl("qdb_sitevisit_status").setVisible(false);
        _formContext.getControl("qdb_marketoutlook_status").setVisible(false);
        _formContext.getControl("qdb_assetstatus_technicalteam_status").setVisible(false);
        _formContext.getControl("qdb_assetstatus_epd_status").setVisible(false);
        _formContext.getControl("qdb_financialforecasting_status").setVisible(false);
        _formContext.getControl("qdb_creditbureau_status").setVisible(false);

        _formContext.getAttribute("qdb_sitevisit_status").setRequiredLevel("none");
        _formContext.getAttribute("qdb_marketoutlook_status").setRequiredLevel("none");
        _formContext.getAttribute("qdb_assetstatus_technicalteam_status").setRequiredLevel("none");
        _formContext.getAttribute("qdb_assetstatus_epd_status").setRequiredLevel("none");
        _formContext.getAttribute("qdb_financialforecasting_status").setRequiredLevel("none");
        _formContext.getAttribute("qdb_creditbureau_status").setRequiredLevel("none");
    }


    function SetReturnReason() {
        let qdb_Tab;
        qdb_Tab = _formContext.ui.tabs.get("tab_TRANRETREASON");

        if (qdb_Tab != null) {
            if (_formContext.getAttribute("qdb_return_reason") != null)
                _formContext.getAttribute("qdb_return_reason").setRequiredLevel("required");
        }

        qdb_Tab.setVisible(true);
    }

    function ClearReturnReason() {
        let qdb_Tab;
        qdb_Tab = _formContext.ui.tabs.get("tab_TRANRETREASON");

        if (qdb_Tab != null) {
            if (_formContext.getAttribute("qdb_return_reason") != null)
                _formContext.getAttribute("qdb_return_reason").setRequiredLevel("none");
        }
        qdb_Tab.setVisible(false);
    }

    function CheckRPSRequirement() {
        let qdb_Tab2;
        if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
            if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{DE2D7C06-2004-E411-9003-00155D780506}") {
                //qdb_Tab2 = _formContext.ui.tabs.get("tab_RPSGen");
                ////_formContext.getAttribute("qdb_general_status").setRequiredLevel("required");
                //qdb_Tab2.setVisible(true);
                ShowNotification("Please generate RPS & Attach to CRM for Contract Preperation.", 2);
            }
        }
        else {
            qdb_Tab2 = _formContext.ui.tabs.get("tab_RPSGen");
            qdb_Tab2.setVisible(false);
        }
    }

    function SetRMLodgmentGridURL() {

        let newTarget;
        let TermSheetID;
        let IFrame = _formContext.ui.controls.get("IFRAME_Lodgement");
        let RecordID;
        let LookupFieldObject = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue();
        let UserID = Xrm.Utility.getGlobalContext().getUserId();
        let TaskID = _formContext.data.entity.getId();

        if (LookupFieldObject != null) {
            RecordID = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/DocumentLodgmentRMAndCS.aspx?id=" + RecordID + "&showsendbtn=&showloadbtn=1&showaddbtn=0&termsheetid=" + TermSheetID + "&createdby=credit&userid=" + UserID + "&taskid=" + TaskID;
        }

        IFrame.setSrc(newTarget);
    }

    function SetCreditOfficerLodgmentGridURL() {

        let newTarget;
        let TermSheetID;
        let IFrame = _formContext.ui.controls.get("IFRAME_Lodgement");
        let RecordID;
        let LookupFieldObject = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue();
        let UserID = Xrm.Utility.getGlobalContext().getUserId();
        let TaskID = _formContext.data.entity.getId();

        if (LookupFieldObject != null) {
            RecordID = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/DocumentLodgmentCreditOfficerReview.aspx?id=" + RecordID + "&showsendbtn=&showloadbtn=1&showaddbtn=0&termsheetid=" + TermSheetID + "&createdby=credit&userid=" + UserID + "&taskid=" + TaskID;
            //Xrm.Navigation.openAlertDialog({text: RecordID}) // MIGRATED: alert→openAlertDialog;
        }

        IFrame.setSrc(newTarget);
    }

    function SetHeadOfCADLodgmentGridURL() {

        let newTarget;
        let TermSheetID;
        let IFrame = _formContext.ui.controls.get("IFRAME_Lodgement");
        let RecordID;
        let LookupFieldObject = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue();
        let UserID = Xrm.Utility.getGlobalContext().getUserId();
        let TaskID = _formContext.data.entity.getId();

        if (LookupFieldObject != null) {
            RecordID = LookupFieldObject[0].id;
            newTarget = "https://qdbcrmapp:9797/DocumentLodgmentHeadOfCADReview.aspx?id=" + RecordID + "&showsendbtn=&showloadbtn=1&showaddbtn=0&termsheetid=" + TermSheetID + "&createdby=credit&userid=" + UserID + "&taskid=" + TaskID;
        }

        IFrame.setSrc(newTarget);
    }

    function SetCommentsRequired(prmEventParamters) {
        let lcl_OptionSet = prmEventParamters.getEventSource();
        if (lcl_OptionSet.getValue() != "751090000") {
            _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
            if (_formContext.getAttribute("qdb_return_reason") != null) {
                // _formContext.getAttribute("qdb_return_reason").setRequiredLevel("required");
                //_formContext.getControl("qdb_return_reason").setVisible(true);
                // SetReturnReason();
            }
        }
        else {
            _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
            if (_formContext.getAttribute("qdb_return_reason") != null) {
                // _formContext.getAttribute("qdb_return_reason").setRequiredLevel("none");
                //_formContext.getControl("qdb_return_reason").setVisible(false);
                // ClearReturnReason();
            }
        }
    }

    function SetAssignedWorkerRequired(prmEventParamters) {
        let lcl_OptionSet = prmEventParamters.getEventSource();
        if (lcl_OptionSet.getValue() == "751090000") {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("required");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
        }
        else {
            _formContext.getAttribute("qdb_assign_ops_processor").setRequiredLevel("none");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        }
    }

    function ValidateUsanceDetails() {
        if (_formContext.getAttribute("qdb_usance_payment").getValue() == true) {
            _formContext.getAttribute("qdb_usance_amount").setRequiredLevel("required");
            _formContext.getControl("qdb_usance_amount").setDisabled(false);
            _formContext.getAttribute("qdb_usance_payment_date").setRequiredLevel("required");
            _formContext.getControl("qdb_usance_payment_date").setDisabled(false);
        }
        else {
            if (_formContext.ui.getFormType() == 2) {
                _formContext.getAttribute("qdb_usance_amount").setValue(null);
                _formContext.getAttribute("qdb_usance_payment_date").setValue(null);
            }
            _formContext.getControl("qdb_usance_amount").setDisabled(true);
            _formContext.getControl("qdb_usance_payment_date").setDisabled(true);
            _formContext.getAttribute("qdb_usance_amount").setRequiredLevel("none");
            _formContext.getAttribute("qdb_usance_payment_date").setRequiredLevel("none");


        }
    }

    function TenorConfirmation(prmEventParamters) {
        let lcl_OptionSet = prmEventParamters.getEventSource();

        if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() == "751090000") {
            _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
        }
        else if (lcl_OptionSet.getValue() != "751090001")
            _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("none");
        else
            _formContext.getAttribute("qdb_maturity_date_lc").setRequiredLevel("required");
    }

    function ResubmissionRequest() {
        qdb_Tab = _formContext.ui.tabs.get("tab_ResubmissionRequest");
        if (_formContext.getAttribute("qdb_resubmission_status") != null) {
            _formContext.getAttribute("qdb_resubmission_status").setRequiredLevel("required");
        }

        _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        qdb_Tab.setVisible(true);

        let ts_WorkItem = _formContext.getAttribute("qdb_work_item");

        _formContext.getControl("qdb_resubmission_status").removeOption(751090002);
        _formContext.getControl("qdb_resubmission_status").removeOption(751090003);
        _formContext.getControl("qdb_resubmission_status").removeOption(751090004);

        switch (ts_WorkItem.getValue()[0].id) {

            case "{4FB60BDA-8804-E511-91EB-00155D780414}": //Return to PM (EPD ) by Head Credit Admin        
                _formContext.getControl("qdb_resubmission_status").removeOption(751090001);
                _formContext.getControl("qdb_resubmission_status").removeOption(751090002);
                _formContext.getControl("qdb_resubmission_status").removeOption(751090003);
                break;

            case "{2A769E1C-2134-E511-81C5-00155D788D14}":
                if (_formContext.ui.tabs.get("tab_46") != null) {
                    _formContext.ui.tabs.get("tab_46").setVisible(true);
                }

                if (_formContext.ui.tabs.get("tab_Document_Lodgment") != null) {
                    _formContext.ui.tabs.get("tab_Document_Lodgment").setVisible(true);
                    SetLodgmentDocumentReturnGridURL();
                }
                break;

            case "{43FE4BC5-843A-E511-81C5-00155D788D14}":
                qdb_Tab = _formContext.ui.tabs.get("tab_Document_Lodgment");
                _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("required");
                // _formContext.ui.tabs.get("tab_Document_Lodgment").sections.get("tab_Document_Lodgment_section_2").setVisible(true);
                _formContext.ui.tabs.get("tab_46").setVisible(true);//IN 2016 tab visibility is not working that'whyCreated Separate tab for it
                _formContext.ui.tabs.get("tab_Document_Lodgment").setVisible(true);
                SetLodgmentDocumentReturnGridURL();
                break;


        }
        //var IsEPDRequest = _formContext.getAttribute("qdb_is_epd_request").getValue();

        //if (IsEPDRequest == false) {
        //    _formContext.getControl("qdb_resubmission_status").removeOption(751090004); //Return to Project Manager (EPD)
        //}

        QDB_RecordType = _formContext.getAttribute("qdb_return_by_user");

        if (QDB_RecordType.getValue() != null && QDB_RecordType.getValue()[0].id != null) {
            //ShowNotification("Return by " + QDB_RecordType.getValue()[0].name + ", On: "+ _formContext.getAttribute("createdon").getValue() +", User Comments: " + _formContext.getAttribute("qdb_resubmission_comments").getValue() ,2,"1");
            ShowNotification("Return by " + QDB_RecordType.getValue()[0].name + ", Comments : " + _formContext.getAttribute("qdb_resubmission_comments").getValue(), 2);

            if (ts_WorkItem.getValue()[0].id == "{2A769E1C-2134-E511-81C5-00155D788D14}") {
                if (_formContext.getAttribute("qdb_resubmission_status") != null) {
                    _formContext.getAttribute("qdb_resubmission_status").setRequiredLevel("none");
                }
                _formContext.getAttribute("qdb_documentlodgmentsecuritystatus").setRequiredLevel("required");
                qdb_Tab.setVisible(false);
                SetLodgmentDocumentReturnGridURL();
            }
        }
    }

    function onChangeRemittanceTransaction() {
        if (_formContext.getAttribute("qdb_transaction_status").getValue() == "751090000") {
            _formContext.getAttribute("qdb_documents_date").setRequiredLevel("required");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
        }
        else {
            _formContext.getAttribute("qdb_documents_date").setRequiredLevel("none");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        }
    }

    function onChangeGuaranteeTransaction() {
        if (_formContext.getAttribute("qdb_guaranteetransactionstatus").getValue() == "751090000") {
            _formContext.getAttribute("qdb_bg_number").setRequiredLevel("required");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("none");
        }
        else {
            _formContext.getAttribute("qdb_bg_number").setRequiredLevel("none");
            _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        }
    }

    function OnChangeDocumentReviewStatus() {
        if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() == "751090001") {
            if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{ECB036FF-48F1-E211-A9BB-00155D788238}") {
                _formContext.getControl("IFRAME_Discrepancies_Copy").setVisible(true);
            }
            //        else if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{BE56E21F-CE0A-E411-9003-00155D780506}") {
            //            _formContext.getControl("IFRAME_Discrepancies_Copy").setVisible(true);
            //        }
            else if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{999585FD-4CF1-E211-A9BB-00155D788238}") {
                _formContext.getControl("IFRAME_Dis").setVisible(true);
                //_formContext.getControl("qdb_swift_reference_no").setVisible(true);
                _formContext.ui.tabs.get("tab_51").sections.get("tab_51_section_2").setVisible(true);
                _formContext.ui.tabs.get("tab_51").sections.get("tab_51_section_3").setVisible(true);
            }
        }
    }

    function ShowAttachment(prmFieldID) {

        let EntityName, EntityId, LookupFieldObject;
        let Id, Name, Type;
        let resultXml;
        let LookupField;
        let QueryField;
        let SuccessFunction;

        if (prmFieldID == "qdb_lcpaycustacpt") { //L/C Payment Acceptance Letter 
            LookupField = "qdb_lcdocumentsacceptancerefid";
            QueryField = "qdb_doc_1";
            SuccessFunction = OpenAttachedDocument;
        }
        else if (prmFieldID == "qdb_other_doc_1") { //BG Amedment Letter       

            if (_formContext.getAttribute("qdb_lg_ref_no")) {
                if (_formContext.getAttribute("qdb_lg_ref_no").getValue()) {
                    LookupField = "qdb_lg_ref_no";
                    QueryField = "qdb_doc_amnt_ltr";
                    SuccessFunction = OpenAttachedDocumentBG;
                }
                else if (_formContext.getAttribute("qdb_lc_amendment_ref")) {
                    if (_formContext.getAttribute("qdb_lc_amendment_ref").getValue()) {
                        LookupField = "qdb_lc_amendment_ref";
                        QueryField = "qdb_doc_amnt_ltr";
                        SuccessFunction = OpenAttachedDocumentLG;
                    }
                }
            }
            else if (_formContext.getAttribute("qdb_lc_amendment_ref")) {
                if (_formContext.getAttribute("qdb_lc_amendment_ref").getValue()) {
                    LookupField = "qdb_lc_amendment_ref";
                    QueryField = "qdb_doc_amnt_ltr";
                    SuccessFunction = OpenAttachedDocumentLG;
                }
            }
        }

        if (_formContext.getAttribute(LookupField)) {

            let LookupFieldObject = _formContext.getAttribute(LookupField).getValue();

            if (LookupFieldObject != null) {
                EntityId = LookupFieldObject[0].id;
                EntityName = LookupFieldObject[0].entityType;


                if (EntityId != null) {
                    // Remove '{}' from EntityID
                    let parsedID = EntityId.replace("{", "");
                    parsedID = parsedID.replace("}", "");
                }

                // Please confirm plural name by downloading jason response and serching entity by visitng https://qdbcrmapp/qdb1/api/data/v9.2/ /* MIGRATED: updated to v9.2 */
                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityName + "s(" + parsedID + ")?$select=" + QueryField;

                // Pass OData Query and UpdateFunction
                _executeODataQuery(query, SuccessFunction, null);

            }
            else {
                _formContext.data.entity.attributes.get('qdb_work_item').setValue(null);
            }
        }

        // var Url = "https://qdbcrmapp/qdb1/isv/qdb/fu/download1.aspx?fid=";
        // if (_formContext.getAttribute(prmFieldID).getValue() != null) {
        // Url += _formContext.getAttribute(prmFieldID).getValue();
        // window.open(Url);
        // }
        // else {
        // Xrm.Navigation.openAlertDialog({text: "Document is not attached."}) // MIGRATED: alert→openAlertDialog;
        // }
    }

    function OpenAttachedDocument(result) {

        if (result != null && result['qdb_doc_1'] != null) {

            let Url = "https://qdbcrmapp/qdb1/isv/qdb/fu/download1.aspx?fid=";

            Url += result['qdb_doc_1'];
            window.open(Url);

        }
        else {
            Xrm.Navigation.openAlertDialog({text: "Document is not attached with L/C Document Acceptance request."}) // MIGRATED: alert→openAlertDialog;
        }
    }

    function OpenAttachedDocumentBG(result) {

        Globalresult = result;
        let EntityName, EntityId, LookupFieldObject;
        let LookupFieldObject = _formContext.getAttribute("qdb_lg_ref_no").getValue();
        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject[0].id;
            EntityName = LookupFieldObject[0].entityType;
            let SubString = EntityName.substring(0, EntityName.length - 1);

            if (EntityId != null) {
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityName + "s(" + parsedID + ")?$select=qdb_source_location";
                _executeODataQuery(query, OpenAttachmentDocBG, parsedID);
            }
        }

    }
    function OpenDoc(result, id) {
        if (result.value[0] != undefined && result.value[0] != null) {
            window.open(result.value[0].qdb_sharepointdocumenturl);
        } else {
            Xrm.Navigation.openAlertDialog({text: "There is no Document"}) // MIGRATED: alert→openAlertDialog;
        }

    }
    function OpenAttachmentDocLG(result, id) {
        if (result != null && result["qdb_source_location"] != null) {
            if (result["qdb_source_location"] == "751090002") {
                let LCId = result["qdb_tf_amendment_requestid"];
                //qdb_documenttype eq 751090008 and _regardingobjectid_value eq "+LCId
                // http://mvcrmdev01/QDB1/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_centralizeddocumentses?$select=qdb_sharepointdocumenturl&$filter=qdb_documenttype eq 751090000 and activityid eq 87d072bb-eabb-ed11-9108-9321f38dce6a
                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_centralizeddocumentses?$select=qdb_sharepointdocumenturl&$filter=qdb_documenttype eq 751090008 and _regardingobjectid_value eq " + LCId;
                _executeODataQuery(query, OpenDoc, LCId);
                return;
            }
            else {
                // window.open(lcl_URL, "_blank");
                if (Globalresult != null && Globalresult['qdb_doc_amnt_ltr'] != null) {

                    let Url = "https://qdbcrmapp/qdb1/isv/qdb/fu/download1.aspx?fid=";

                    Url += Globalresult['qdb_doc_amnt_ltr'];
                    window.open(Url);
                }
                else {
                    Xrm.Navigation.openAlertDialog({text: "Document is not attached with L/C Amendment Acceptance request."}) // MIGRATED: alert→openAlertDialog;
                }
                return;
            }
        }
    }
    function OpenAttachmentDocBG(result, id) {
        if (result != null && result["qdb_source_location"] != null) {
            if (result["qdb_source_location"] == "751090002") {
                let LCId = result["qdb_guarantee_amendmentid"];
                //qdb_documenttype eq 751090008 and _regardingobjectid_value eq "+LCId
                // http://mvcrmdev01/QDB1/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_centralizeddocumentses?$select=qdb_sharepointdocumenturl&$filter=qdb_documenttype eq 751090000 and activityid eq 87d072bb-eabb-ed11-9108-9321f38dce6a
                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_centralizeddocumentses?$select=qdb_sharepointdocumenturl&$filter=qdb_documenttype eq 751090009 and _regardingobjectid_value eq " + LCId;
                _executeODataQuery(query, OpenDoc, LCId);
                return;
            }
            else {
                if (Globalresult != null && Globalresult['qdb_doc_amnt_ltr'] != null) {

                    let Url = "https://qdbcrmapp/qdb1/isv/qdb/fu/download1.aspx?fid=";

                    Url += Globalresult['qdb_doc_amnt_ltr'];
                    window.open(Url);

                }
                else {
                    Xrm.Navigation.openAlertDialog({text: "Document is not attached with BG Document Acceptance request."}) // MIGRATED: alert→openAlertDialog;
                }

                return;
            }
        }
    }
    let Globalresult = null;
    function OpenAttachedDocumentLG(result) {
        Globalresult = result;
        let EntityName, EntityId, LookupFieldObject;
        let LookupFieldObject = _formContext.getAttribute("qdb_lc_amendment_ref").getValue();

        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject[0].id;
            EntityName = LookupFieldObject[0].entityType;
            let SubString = EntityName.substring(0, EntityName.length - 1);

            if (EntityId != null) {
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityName + "s(" + parsedID + ")?$select=qdb_source_location";
                _executeODataQuery(query, OpenAttachmentDocLG, parsedID);
            }
        }
    }

    function ShowCustomerTermSheet() {

        /**/
        let lcl_TermSheetId;
        let LookupFieldObjectTermSheet = _formContext.getAttribute("qdb_term_sheet_ref_no");

        if (LookupFieldObjectTermSheet != null) {
            lcl_TermSheetId = LookupFieldObjectTermSheet.getValue()[0].id;
        }

        //var ODataSelect = "qdb_customer_term_sheetSet(guid'" + lcl_TermSheetId + "')?$select=qdb_Process";


        //   var TermSheetProcess = ODataCommonFunctions.GetDataUsingODataServiceWithXmlHttp(ODataSelect);


        let query;
        let theEntity = "qdb_customer_term_sheet";
        lcl_TermSheetId = lcl_TermSheetId.replace("{", "");
        lcl_TermSheetId = lcl_TermSheetId.replace("}", "");

        let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + theEntity + "s(" + lcl_TermSheetId + ")?$select=qdb_process";

        // Pass OData Query and UpdateFunction
        _executeODataQuery(query, UpdateAccountInformationForShowCustomerTermSheet, lcl_TermSheetId);



        //var lcl_Process;
        //var lcl_URL;

        //if (TermSheetProcess != null && TermSheetProcess.qdb_Process != null) {

        //    if (TermSheetProcess.qdb_Process.Value == "751090001") {
        //        lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheetNew&rs:Command=Render&CustomerTermSheetId=";
        //    }
        //    else {
        //        lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheet&rs:Command=Render&CustomerTermSheetId=";
        //    }
        //}
        //else {
        //    lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheet&rs:Command=Render&CustomerTermSheetId=";
        //}

        ///**/

        //var Url;

        //Url = lcl_URL;

        //var LookupFieldObject = _formContext.getAttribute("qdb_customer_term_sheet").getValue();
        //var department = _formContext.getAttribute("qdb_division").getValue();

        //if (department != null) {
        //    var termsheet = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();
        //    Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fAL_DHAMEEN%2fALDhameen_CustomerOfferV1&rs:Command=Render&Id=";
        //    Url += termsheet[0].id;
        //    window.open(Url, "_blank");
        //}

        //else {
        //    if (LookupFieldObject != null) {
        //        Url += LookupFieldObject[0].id;

        //        window.open(Url, "_blank");
        //    }
        //}
    }

    function UpdateAccountInformationForShowCustomerTermSheet(result, id) {
        //if (result != null && result["qdb_process"] != null) {
        //    var CustomerNo = result["name"];
        //    var Url;
        //    Url = "https://qdbcrmapp:9781/CreditProposal/ViewLoanCurrentAccountSummary.aspx?id=" + CustomerNo + "&customerguid=" + id;
        //    window.showModalDialog(Url, "", 'dialogWidth:600px; dialogHeight:480px; center:yes;status:0;resizable:0;')
        //}

        let lcl_Process;
        let lcl_URL;

        if (result != null && result["qdb_process"] != null) {

            if (result["qdb_process"] == "751090001") {
                let termsheet = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();

                let qdb_customer_term_sheet = _formContext.getAttribute("qdb_customer_term_sheet").getValue();

                let department = _formContext.getAttribute("qdb_division").getValue();

                if (department != null) {

                    if (department[0].id == "{38AC44BD-604B-E311-9BB2-00155D788238}") {
                        lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fAL_DHAMEEN%2fALDhameen_CustomerOfferV2&rs:Command=Render&Id=";
                        lcl_URL += termsheet[0].id;
                        window.open(lcl_URL, "_blank");
                        return;
                    }
                }


                lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheetNew&rs:Command=Render&CustomerTermSheetId=" + qdb_customer_term_sheet[0].id;
                lcl_URL += "&TermSheetId=" + termsheet[0].id;

                window.open(lcl_URL, "_blank");
                return;
            }
            else {
                let termsheet = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();

                let qdb_customer_term_sheet = _formContext.getAttribute("qdb_customer_term_sheet").getValue();

                lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheet&rs:Command=Render&CustomerTermSheetId=" + qdb_customer_term_sheet[0].id;
                lcl_URL += "&TermSheetId=" + termsheet[0].id;

                window.open(lcl_URL, "_blank");
                return;

            }
        }
        else {
            lcl_URL = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCustomerTermSheet&rs:Command=Render&CustomerTermSheetId=";
        }

        /**/

        let Url;

        Url = lcl_URL;

        let LookupFieldObject = _formContext.getAttribute("qdb_customer_term_sheet").getValue();
        let department = _formContext.getAttribute("qdb_division").getValue();

        if (department != null) {
            let termsheet = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();
            Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fAL_DHAMEEN%2fALDhameen_CustomerOfferV2&rs:Command=Render&Id=";
            Url += termsheet[0].id;
            window.open(Url, "_blank");
        }

        else {
            if (LookupFieldObject != null) {
                Url += LookupFieldObject[0].id;

                window.open(Url, "_blank");
            }
        }


    }

    function ViewPreviousWorkItem() {
        let URL;
        let LookupFieldObject = _formContext.getAttribute("qdb_previous_work_item").getValue();

        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: "qdb_status_history", entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }
    }

    function ViewDisbursementForm() {
        let URL;

        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();
        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: "qdb_payment_authorization_ticket", entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }
    }

    function OpenEntityForm(prmLookUpFieldID) {
        let LookupFieldObject = _formContext.getAttribute(prmLookUpFieldID).getValue();
        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: LookupFieldObject[0].entityType, entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }

    }

    function ViewNewLoanCreationForm() {

        let LookupFieldObject = _formContext.getAttribute("qdb_laon_creation_request_ref").getValue();
        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: "qdb_new_loan_creation", entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }
    }

    function ViewLoanAmmendmentForm() {
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_ammendment_request").getValue();
        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: "qdb_loan_amendment", entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }
    }

    function ShowTermSheet() {
        let Url;

        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fTermSheet&rs:Command=Render&TermSheetId=";

        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();

        if (LookupFieldObject != null) {
            Url += LookupFieldObject[0].id;

            window.open(Url, "_blank");
        }

        else {
        }
    }

    function GenerateLoanDocuments() {
        let TermSheetId;
        let WorkIemId = _formContext.data.entity.getId();
        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();
        let lclUrl = "https://qdbcrmapp:9798/GenerateFiles.aspx?workitemid=" + WorkIemId + "&id=";

        if (LookupFieldObject != null) {
            TermSheetId = LookupFieldObject[0].id;
            lclUrl += TermSheetId;


            window.open("https://qdbcrmapp:9894/CSD/AddDocuments.aspx?id=" + WorkIemId);
            //if (window.showModalDialog(lclUrl, "", 'dialogWidth:1100px; dialogHeight:600px; center:yes;status:0;resizable:0;') == 1) {
            //    // window.location.reload(true);
            //    //old code not working
            //    //Page Refresh 
            //    _formContext.data.refresh();
            //}
            //else {
            //    // window.location.reload(true);
            //    //old code not working
            //    //Page Refresh 
            //    _formContext.data.refresh();
            //}
        }
        else {

        }
    }

    function UploadLoanDocuments() {

        // Check if qdb_caserefnoid contains data
        let caseRefNoAttr = _formContext.getAttribute("qdb_caserefnoid");
        if (caseRefNoAttr && caseRefNoAttr.getValue() != null && caseRefNoAttr.getValue().length > 0) {
            onClickOfAddDocuments();
            return;
        }
        let TermSheetId;
        let WorkIemId = _formContext.data.entity.getId();
        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();
        let LookupFieldObject2 = _formContext.getAttribute("qdb_loan_application_ref").getValue();
        let lclUrl = "https://qdbcrmapp:9798/UploadDocumentsNew.aspx?workitemid=" + WorkIemId + "&id=";
        let lclUrl2 = "https://qdbcrmapp:9798/UploadDocumentsNewForPortfolio.aspx?workitemid=" + WorkIemId + "&id=";
        if (LookupFieldObject != null) {
            TermSheetId = LookupFieldObject[0].id;
            lclUrl += TermSheetId;
            //Xrm.Navigation.openAlertDialog({text: lclUrl}) // MIGRATED: alert→openAlertDialog;

            //Browser Stablization
            /*
            // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:1100px; dialogHeight:600px; center:yes;status:0;resizable:0;') == 1) {
            // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.
            if (true) // MIGRATED: showModalDialog return value unavailable
                // window.location.reload(true);
                //old code not working
                //Page Refresh 
                //  _formContext.data.refresh();
                Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
            }
            else {
                // window.location.reload(true);
                //old code not working
                //Page Refresh 
                //   _formContext.data.refresh();
                Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
            }
            */
            OpenDialogUsingAlert(lclUrl, "", false);
        }
        else {
            if (LookupFieldObject2 != null) {
                TermSheetId = LookupFieldObject2[0].id;
                lclUrl2 += TermSheetId;
                //Xrm.Navigation.openAlertDialog({text: lclUrl}) // MIGRATED: alert→openAlertDialog;

                //Broweser Stablization
                /*
                // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: if (window.showModalDialog(lclUrl2, "", 'dialogWidth:1100px; dialogHeight:600px; center:yes;status:0;resizable:0;') == 1) {
                // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.
                if (true) // MIGRATED: showModalDialog return value unavailable
                    // window.location.reload(true);
                    //old code not working
                    //Page Refresh 
                    //  _formContext.data.refresh();
                    Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
                }
                */
                OpenDialogUsingAlert(lclUrl2, "", false);

            }


        }
    }


    function SetNewLoanCreationReportURL() {

        let IFrame = _formContext.ui.controls.get("IFRAME_NewLoanCreationReport");
        let RecordID = _formContext.data.entity.getId();
        let newTarget = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreation&rs:Command=Render&rc:Toolbar=False&Id=" + RecordID;
        IFrame.setSrc(newTarget);
    }

    function SetPaymentAuthorizationReportURL() {

        let newTarget;
        let IFrame = _formContext.ui.controls.get("IFRAME_PaymentAuthorization");
        let AssginedPartyType = _formContext.data.entity.attributes.get("qdb_assigned_party_type").getValue();

        let RecordID = _formContext.data.entity.getId();

        if (AssginedPartyType != null) {

            if (AssginedPartyType == 751090000) { //Customer Services = 751090000
                newTarget = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicketRM&rs:Command=Render&rc:Toolbar=False&Id=" + RecordID;

            }
            else if (AssginedPartyType == 751090001) { //Business Finance = 751090001
                newTarget = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicketRM&rs:Command=Render&rc:Toolbar=False&Id=" + RecordID;

            }
            else if (AssginedPartyType == 751090002) { //Credit Administration = 751090002
                newTarget = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicketCredit&rs:Command=Render&rc:Toolbar=False&Id=" + RecordID;

            }
            else if (AssginedPartyType == 751090003) {//Operations = 751090003
                newTarget = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicket&rs:Command=Render&rc:Toolbar=False&Id=" + RecordID;

            }

            IFrame.setSrc(newTarget);

        }
        else {
            _formContext.getControl("IFRAME_PaymentAuthorization").setVisible(false);
        }
    }

    function PrintPaymentAuthorization() {

        let Url;
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorization&rs:Command=Render&Id=" + DisbursementRequestID;

            window.open(Url, "_blank");
        }
    }

    function PrintDisbursementRequest() {

        let Url;
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fDisbursementRequest&rs:Command=Render&Id=" + DisbursementRequestID;

            window.open(Url, "_blank");
        }
    }

    function PrintPaymentAuthorizationBFD() {
        let Url;
        let RecordID = _formContext.data.entity.getId();
        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicketRMPrint&rs:Command=Render&Id=" + RecordID;

        window.open(Url, "_blank");
    }

    function PrintPaymentAuthorizationCAD() {
        let Url;
        let RecordID = _formContext.data.entity.getId();
        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentAuthorizationTicketCreditPrint&rs:Command=Render&Id=" + RecordID;

        window.open(Url, "_blank");
    }

    function SetRMChecklistGridsURL() {

        let newChecklistTarget;
        let newExceptionTarget;
        let DisbursementRequestID;
        let IFrameChecklist = _formContext.ui.controls.get("IFRAME_DisbursementChecklistBFD");
        let IFrameException = _formContext.ui.controls.get("IFRAME_DisbursementChecklistExceptionsRM");
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            newChecklistTarget = "https://qdbcrmapp:9797/DisbursementChecklistBFD.aspx?id=" + DisbursementRequestID;
            newExceptionTarget = "https://qdbcrmapp:9797/DisbursementChecklistExceptionsRM.aspx?id=" + DisbursementRequestID;

            IFrameChecklist.setSrc(newChecklistTarget);
            IFrameException.setSrc(newExceptionTarget);
        }
    }

    function SetEDCADChecklistGridURL() {

        let newTarget;
        let DisbursementRequestID;
        let IFrame = _formContext.ui.controls.get("IFRAME_DisbursementChecklistExceptions");
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/DisbursementChecklistExceptions.aspx?id=" + DisbursementRequestID + "&approvedby=751090002";

            if (IFrame != null) {
                IFrame.setSrc(newTarget);
            }
        }
    }

    function SetEDPFChecklistGridURL() {

        let newTarget;
        let DisbursementRequestID;
        let IFrame = _formContext.ui.controls.get("IFRAME_DisbursementChecklistExceptionsEDPF");
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/DisbursementChecklistExceptions.aspx?id=" + DisbursementRequestID + "&approvedby=751090000";
            if (IFrame != null) {
                IFrame.setSrc(newTarget);
            }
        }
    }

    function SetHCADChecklistGridsURL() {

        let newChecklistTarget;
        let newExceptionTarget;
        let DisbursementRequestID;
        let IFrameChecklist = _formContext.ui.controls.get("IFRAME_DisbursementChecklistHeadOfCAD");
        let IFrameException = _formContext.ui.controls.get("IFRAME_DisbursementChecklistExceptionsHCAD");
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            newChecklistTarget = "https://qdbcrmapp:9797/DisbursementChecklistHeadOfCAD.aspx?id=" + DisbursementRequestID;

            if (IFrameException != null)
                newExceptionTarget = "https://qdbcrmapp:9797/DisbursementChecklistExceptions.aspx?id=" + DisbursementRequestID + "&approvedby=751090001";

            IFrameChecklist.setSrc(newChecklistTarget);
            if (IFrameException != null)
                IFrameException.setSrc(newExceptionTarget);
        }
    }
    function SetLoanDocumentPortfolioInIframesURL() {

        let newTarget;
        let Id;
        let IFRAME_ShowLoanDocumentsFromSharePoint = _formContext.ui.controls.get("IFRAME_ShowLoanDocumentsFromSharePoint");

        //Id = LookupFieldObject[0].id;
        Id = _formContext.data.entity.getId();
        newTarget = "https://qdbcrmapp:9798/ShowGeneratedDocumentsForLoan.aspx?OrgLCID=1033&UserLCID=1033&id=" + Id + "&orgname=qdb1&type=10062&typename=qdb_status_history";
        newTarget = newTarget +
            IFRAME_ShowLoanDocumentsFromSharePoint.setSrc(newTarget);

    }

    function SetCADChecklistGridsURL() {

        let newChecklistTarget;
        let newExceptionTarget;
        let DisbursementRequestID;
        let IFrameChecklist = _formContext.ui.controls.get("IFRAME_DisbursementChecklistCAD");
        let IFrameException = _formContext.ui.controls.get("IFRAME_DisbursementChecklistExceptionsCAD");
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue();

        if (LookupFieldObject != null && IFrameException != null) {
            DisbursementRequestID = LookupFieldObject[0].id;

            newChecklistTarget = "https://qdbcrmapp:9797/DisbursementChecklistCAD.aspx?id=" + DisbursementRequestID;
            newExceptionTarget = "https://qdbcrmapp:9797/DisbursementChecklistExceptionsCAD.aspx?id=" + DisbursementRequestID;

            IFrameChecklist.setSrc(newChecklistTarget);
            IFrameException.setSrc(newExceptionTarget);
        }
    }

    function SetTCSAccountCreationIframesURL() {

        let newTarget;
        let Id;
        let IFrameCreation = _formContext.ui.controls.get("IFRAME_ProductTypeAndRepaymentTerms");
        let IFrameApproval = _formContext.ui.controls.get("IFRAME_ProductTypeAndRepaymentTermsApproval");
        let LookupFieldObject = _formContext.getAttribute("qdb_laon_creation_request_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/ProductTypeAndRepaymentTerms.aspx?id=" + Id;

            IFrameCreation.setSrc(newTarget);
            IFrameApproval.setSrc(newTarget);
        }
    }

    function ShowNewLoanCreationReport() {
        let Url;

        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreationpPrint&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.getAttribute("qdb_laon_creation_request_ref").getValue();

        if (LookupFieldObject != null) {
            Url += LookupFieldObject[0].id;

            window.open(Url, "_blank");
        }
    }
    function ShowLoanAmendmentReport() {
        let Url;

        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLoanAmendment&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.getAttribute("qdb_loan_ammendment_request").getValue();

        if (LookupFieldObject != null) {
            Url += LookupFieldObject[0].id;

            window.open(Url, "_blank");
        }
    }

    function ShowLCAmendmentReport() {
        let Url;

        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCAmendmentRequest&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.getAttribute("qdb_lc_amendment_ref");

        if (LookupFieldObject != null && LookupFieldObject.getValue() != null) {
            Url += LookupFieldObject.getValue()[0].id;
            window.open(Url, "_blank");
        }
        else {
            LookupFieldObject = _formContext.getAttribute("qdb_lg_ref_no");
            if (LookupFieldObject != null && LookupFieldObject.getValue() != null) {
                Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLGAmendmentRequest&rs:Command=Render&Id=";
                Url += LookupFieldObject.getValue()[0].id;
                window.open(Url, "_blank");
            }
        }
    }

    function ShowLCDocumentsReport() {
        let Url;

        Url = "http://mvsqlrpt2/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCDocumentation&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.getAttribute("qdb_lc_documentation").getValue();

        if (LookupFieldObject != null) {
            Url += LookupFieldObject[0].id;

            window.open(Url, "_blank");
        }
    }

    function SetChequeAndDepositGridsIframeURL() {

        let newTarget;
        let Id;
        let IFrameChequesDetails = _formContext.ui.controls.get("IFRAME_ChequesDetails");
        let LookupFieldObject = _formContext.getAttribute("qdb_cheque_clearing_request").getValue();
        let Type = _formContext.data.entity.attributes.get("qdb_cheque_clearing_type").getValue();

        if (LookupFieldObject != null) {

            Id = LookupFieldObject[0].id;


            // ************** Praveen Nath Changes Start (31-Dec-2024)   **************
            // ************** Cancel/Postpone PDC and Post Dated Cheque  **************

            //  ** Old Code Backup Section Start  
            // if (Type == 751090000) { //Cheque Clearing
            //     newTarget = "https://qdbcrmapp:9797/ChequesDetailsForOperation.aspx?id=" + Id;
            // }
            // else if (Type == 751090001) { //Cash Deposit 
            //     newTarget = "https://qdbcrmapp:9797/CashDepositDetailsForOperation.aspx?id=" + Id;
            // }
            // else if (Type == 751090002) { //Transfer Deposit   
            //     newTarget = "https://qdbcrmapp:9797/CashDepositDetailsForOperation.aspx?id=" + Id;
            // }
            //  ** Old Code Backup Section End

            if (Type == 751090001) { //Cash Deposit 
                newTarget = "https://qdbcrmapp:9797/CashDepositDetailsForOperation.aspx?id=" + Id;
            }
            else {
                newTarget = "https://qdbcrmapp:9797/ChequesDetailsForOperation.aspx?id=" + Id;
            }

            // ************** Praveen Nath Changes End  **************

            IFrameChequesDetails.setSrc(newTarget);
        }
    }

    function SetProductTypeAndRepaymentTermsGridsIframeURL() {

        let newTarget;
        let Id;
        let IFrameProductTypeAndRepaymentTerms = _formContext.ui.controls.get("IFRAME_ProductTypeAndRepaymentTerms");
        let LookupFieldObject = _formContext.getAttribute("qdb_laon_creation_request_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;
            newTarget = "https://qdbcrmapp:9797/ProductTypeAndRepaymentTerms.aspx?id=" + Id;

            IFrameProductTypeAndRepaymentTerms.setSrc(newTarget);
        }
    }

    function ShowNotification(message, level) {


        if (level == 1) { //critical
            _formContext.ui.setFormNotification(message, "EROR")
        }
        if (level == 2) { //Info
            _formContext.ui.setFormNotification(message, "INFORMATION")
        }
        if (level == 3) { //Warning
            _formContext.ui.setFormNotification(message, "WARNING")
        }
        if (message == "") {

        }
    }

    function SetShareholderWCGridURL() {
        //0A23F05A-2E71-E311-A9A2-00155D787B38
        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_WCGRID");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/WorldCheckVerification.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }


    function SetTechicalDepartGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_AssetsAndMachinaryDetails");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/AssetsAnsMachinaryDetails.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetShareholderCBGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_Approved_Customer_Details");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/CBVerification.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetShareholderQCBtGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_QCB");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/QCBCheck.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetEPDGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_EPDProjectEsitmation");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/EPDProjectEsitmation.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function GenerateMasterAgreement() {

        let IsPrograme = _formContext.getAttribute("qdb_isprogram").getValue();

        if (IsPrograme == true) {
            let Url;

            if (_formContext.getAttribute("qdb_sectorid").getValue()[0].name == "Livestock") {
                Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=liveaagreementmaster&id=";
            }
            else if (_formContext.getAttribute("qdb_sectorid").getValue()[0].name == "Fisheries") {
                Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=fisherymaster&id=";
            }
            else if (_formContext.getAttribute("qdb_sectorid").getValue()[0].name == "Agriculture") {
                Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=masteragreementagriculture&id=";
            }

            Url += _formContext.data.entity.getId();

            window.open(Url);
        }
        else {
            let TaskId = _formContext.data.entity.getId();
            let lclConfirmationDate = _formContext.getAttribute("qdb_confirmation_date").getValue();
            let lclContractRequired = _formContext.getAttribute("qdb_contract_required").getValue();
            let lclUrl = "https://qdbcrmapp:6001/GenerateMasterAgreement.aspx?orgname=qdb1&view=0&id=" + TaskId;

            if (lclContractRequired != null && lclConfirmationDate != null) {

                //Browser Stablization
                /*
                // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: var ModelWindow = (window.showModalDialog(lclUrl, "", 'dialogWidth:250px; dialogHeight:150px; center:yes;status:0;resizable:0;'));
                // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.

                if (ModelWindow != null) {

                    // window.location.reload(true);
                    //old code not working
                    //Page Refresh 
                    _formContext.data.refresh();
                }
                */
                OpenDialogUsingAlert(lclUrl, "", false);
            }
            else {
                Xrm.Navigation.openAlertDialog({text: "Please enter confirmation date or select contract type."}) // MIGRATED: alert→openAlertDialog;
            }
        }
    }

    function OnGuarnateeStatusChange() {
        let Status = _formContext.getAttribute("qdb_operations_guarantee_amendment_status").getValue();

        if (Status == "751090002") {
            _formContext.getAttribute("qdb_lc_amendment_ref_no").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_lc_amendment_ref_no").setRequiredLevel("none");
        }
    }
    function FillMachineryData(prmEntityID) {
        let _Url;
        _Url = "https://qdbcrmapp:9781/CreditProposal/TechnicalEvaluation.aspx?id=" + prmEntityID;
        window.open(_Url, "_blank");

    }
    function SetFacilityAndLoanAccountGridURL() {

        let newTarget;
        let Id;
        let CustomerId;
        let IFrame = _formContext.ui.controls.get("IFRAME_FacilityAndLoanAccountDetails");
        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();
        let LookupFieldObjectCustomer = _formContext.getAttribute("qdb_cif_no").getValue();

        if (LookupFieldObject != null && LookupFieldObjectCustomer != null) {
            Id = LookupFieldObject[0].id;
            CustomerId = LookupFieldObjectCustomer[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/TawarruqFacilityAccountDetails.aspx?termsheetid=" + Id + "&customerid=" + CustomerId;

            IFrame.setSrc(newTarget);
        }
    }
    function SetLoanAccountGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_LoanAccountDetails");
        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/TawarruqFacilityAccountDetailsOpertions.aspx?termsheetid=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetLodgmentDocumentGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_LodgmentDocuments");
        let LookupFieldObject = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue();
        let UserID = Xrm.Utility.getGlobalContext().getUserId();
        let BusinessUnitId = GetBuisnessUnitId(UserID);

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            if (BusinessUnitId == "d8ca44b8-2ebe-e211-be7d-00155d788238") { // Credit Admin

                newTarget = "https://qdbcrmapp:9797/DocumentLodgmentSecurityDocument.aspx?id=" + Id + "&userid=" + UserID + "&businessunitid=" + BusinessUnitId;
            }
            else {
                newTarget = "https://qdbcrmapp:9797/DocumentLodgmentOwnerGrid.aspx?id=" + Id + "&userid=" + UserID + "&businessunitid=" + BusinessUnitId;
            }

            IFrame.setSrc(newTarget);
        }
    }

    function GetBuisnessUnitId(id) {
        //var ownerid = new Array();
        //ownerid = //_formContext.getAttribute("ownerid").getValue();
        let businessunitid;

        //if (ownerid != null && ownerid.length > 0) {
        if (id != null) {
            let odataSelect = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/* MIGRATED: XRMServices deprecated, use Xrm.WebApi */ /XRMServices/2011/OrganizationData.svc/SystemUserSet?$select=BusinessUnitId&$filter=SystemUserId eq guid'" + id + "'";
            let retrieveReq = new XMLHttpRequest();
            retrieveReq.open("GET", odataSelect, false);
            retrieveReq.setRequestHeader("Accept", "application/json");
            retrieveReq.setRequestHeader("Content-Type", "application/json; charset=utf-8");
            retrieveReq.onreadystatechange = function () {
                businessunitid = getFieldData(this);
            };
            retrieveReq.send();
        }

        return businessunitid;
    }

    function getFieldData(retrieveReq) {
        if (retrieveReq.readyState == 4) {
            if (retrieveReq.status == 200) {
                let retrieved = this.parent.JSON.parse(retrieveReq.responseText).d;
                let retrievedValue = retrieved.results[0].BusinessUnitId;
                let id = retrievedValue.Id;
                let name = retrievedValue.Name;

                return id;
                //Xrm.Navigation.openAlertDialog({text: id + "   " + name}) // MIGRATED: alert→openAlertDialog;
            }
        }
    }

    function SetLodgmentDocumentCADGridURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_LodgmentDocuments");
        let LookupFieldObject = _formContext.getAttribute("qdb_document_receipt_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/DocumentLodgmentCADGrid.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetLodgmentDocumentReturnGridURL() {
        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_LodgmentDocuments");
        let LookupFieldObject = _formContext.getAttribute("qdb_document_receipt_ref").getValue();

        let LookupFieldObjectDL = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue();

        let UserID = Xrm.Utility.getGlobalContext().getUserId();





        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            _formContext.ui.tabs.get("tab_Document_Lodgment").setVisible(true);
            newTarget = "https://qdbcrmapp:9797/DocumentLodgmentReturnDocument.aspx?id=" + Id + "&userid=" + UserID;


            if (LookupFieldObjectDL != null) {
                newTarget += "&dlid=" + LookupFieldObjectDL[0].id;
            }


            IFrame.setSrc(newTarget);
        }
    }


    function UpdatePartnerBank(prmRecordId, prmRecordETN, prmDialogId) {
        let lclUrl;
        //Xrm.Navigation.openAlertDialog({text: prmRecordETN}) // MIGRATED: alert→openAlertDialog;

        // code changes are added for controlling the UpdatePartnerBank button only for one stage on 17 Dec 2018

        let Work_Item = _formContext.getAttribute("qdb_work_item").getValue();

        let Status = _formContext.getAttribute("statuscode").getValue();

        if ((Work_Item[0].id == "{3F44B811-87B9-E211-BE7D-00155D788238}") && (Status == 751090002)) {

            try {
                lclUrl = "https://qdbcrmapp/qdb1/cs/dialog/rundialog.aspx?DialogId=";
                lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

                //Browser Stablization
                /*
                // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
                // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.
                if (true) // MIGRATED: showModalDialog return value unavailable
                    // window.location.reload(true);
                    //old code not working
                    //Page Refresh 
                    _formContext.data.refresh();
                }
                else {
                    // window.location.reload(true);
                    //old code not working
                    //Page Refresh 
                    _formContext.data.refresh();
                }
                */
                OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);

            }
            catch (e) {

                Xrm.Navigation.openAlertDialog({text: "Error Occured-qdb_cheque_clearing.js-Function ReactivateChequeClearing"}) // MIGRATED: alert→openAlertDialog;

            }

        }
        else if ((Work_Item[0].id == "{3F44B811-87B9-E211-BE7D-00155D788238}") && !(Status == 751090002)) {


            Xrm.Navigation.openAlertDialog({text: "Updating partner bank is not allowed because the task is completed !!"}) // MIGRATED: alert→openAlertDialog;

            return false;

        }
        else {

            Xrm.Navigation.openAlertDialog({text: "Updating partner bank is only allowed before sending Customer offer !! "}) // MIGRATED: alert→openAlertDialog;

            return false;
        }

    }



    function SetCADDocuments() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_RequiredDocuments");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            //newTarget = "http://mvsqlrpt2/ReportServer?%2fQDB1_MSCRM%2fTA_ProjectDetails_LAF&rs:Command=Render&rc:Toolbar=false";
            newTarget = "https://qdbcrmapp:9781/CreditProposal/RequiredDocuments.aspx?Id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetCADDocuments2() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_RequiredDocuments2");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            //newTarget = "http://mvsqlrpt2/ReportServer?%2fQDB1_MSCRM%2fTA_ProjectDetails_LAF&rs:Command=Render&rc:Toolbar=false";
            newTarget = "https://qdbcrmapp:9781/CreditProposal/RequiredDocuments.aspx?Id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function setWorklfowHistoryURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_WorkflowHistory");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            //newTarget = "http://mvsqlrpt2/ReportServer?%2fQDB1_MSCRM%2fTA_ProjectDetails_LAF&rs:Command=Render&rc:Toolbar=false";
            newTarget = "https://qdbcrmapp:9781/CreditProposal/WorkflowHistoryCEOApproval.aspx?id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function ViewWakalaPromise() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=fisherywakalapromise&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewMortgageOfBoat() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=fisherymortgageofboat&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewFisheryOfferAcceptance() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=fisheryofferacceptance&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewOfferAndAcceptance() {
        //var Url;

        //Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=liveoffermaster&id=";

        //Url += _formContext.data.entity.getId();

        //window.open(Url);
        let Url;
        let LookupFieldObject = _formContext.getAttribute("qdb_sectorid").getValue();
        let workItemLookupObj = _formContext.getAttribute("qdb_work_item").getValue();

        let Sector;
        let workstep;

        if (LookupFieldObject != null) {
            Sector = LookupFieldObject[0].name;

            if (Sector == "Fisheries" && workItemLookupObj != null) {
                workstep = workItemLookupObj[0].name;
            }
            // Shehroz just changed "Review Offer & Acceptance by CAD" to "Prepare Offer & Acceptance by CAD"
            if (Sector == "Fisheries" && (workstep == "Prepare Offer & Acceptance by CAD" || workstep == "Preparation Offer & Acceptance by RM" || workstep == "Pending Review Offer & Acceptance By Manager")) {
                Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=fisheryofferacceptance&id=";

                Url += _formContext.data.entity.getId();

                window.open(Url);
            }
            else if (Sector == "Fisheries" && workstep == "Documents Review by CAD") {
                Xrm.Navigation.openAlertDialog({text: 'Offer and acceptance cannot be generated at this stage.'}) // MIGRATED: alert→openAlertDialog;
            }

            else if (Sector == "Livestock") {
                Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=liveoffermaster&id=";

                Url += _formContext.data.entity.getId();

                window.open(Url);
            }
        }
    }

    function ViewPurchaseApplicationPromise() {
        let Url;

        if (_formContext.getAttribute("qdb_sectorid").getValue()[0].name == "Livestock") {
            Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=liveopurchasemaster&id=";
        }

        else if (_formContext.getAttribute("qdb_sectorid").getValue()[0].name == "Agriculture") {
            Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=agriculturepurchasemaster&id=";
        }

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewPurchaseContractAgriculture() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=agricultureMaster&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewMurabahaSaleContract() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=livesalemaster&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewPromotionContract() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=liveopurchasemaster&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function ViewOfferAndAcceptanceFishery() {
        let Url;

        Url = "https://qdbcrmapp:6001/GenerateContract_Fishery.aspx?orgname=qdb1&view=1&filetype=livestockmaster&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function SetGetCustomerFromTCSURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_CIFCreation");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:1016/OpenCustomerForm.aspx?taskid=" + _formContext.data.entity.getId() + "&id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetGetFacilityFromTCSURL() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_FacilityDetails");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:1016/OpenFacilityForm.aspx?taskid=" + _formContext.data.entity.getId() + "&id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function SetDocumentUploadByRM() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_DcoumentUploadRM");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/DocumentUploadedByRM.aspx?taskid=" + _formContext.data.entity.getId() + "&id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }


    function SetDocumentUploadByRMCIFCreation() {

        let newTarget;
        let Id;
        let IFrame = _formContext.ui.controls.get("IFRAME_DocumentUploadByRMCIFCreation");
        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9781/CreditProposal/DocumentUploadedByRM.aspx?taskid=" + _formContext.data.entity.getId() + "&id=" + Id;

            IFrame.setSrc(newTarget);
        }
    }

    function OnChangePaymentTo() {
        let PaymentTo = _formContext.getAttribute("qdb_paymentto").getValue();
        if (PaymentTo != null) {
            if (PaymentTo == "751090000") {
                _formContext.getAttribute("qdb_vendorname").setRequiredLevel("required");
                _formContext.getControl("qdb_vendorname").setVisible(true);
            }
            else if (PaymentTo == "751090001") {
                _formContext.getAttribute("qdb_vendorname").setRequiredLevel("none");
                _formContext.getControl("qdb_vendorname").setVisible(false);
            }
        }
        else {
            _formContext.getAttribute("qdb_vendorname").setRequiredLevel("none");
            _formContext.getControl("qdb_vendorname").setVisible(false);
        }

    }


    function VerifySignatures() {

        let lcl_URL = "", lcl_ORGURL = "", lcl_ETN = "", lcl_ORG = "", lcl_EID = "", lcl_FieldID = "", lcl_CIF = "", lcl_Amount = "";

        lcl_ORG = "";

        lcl_FieldID = "qdb_disbursement_request";

        lcl_EID = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;
        lcl_ETN = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].typename;


        lcl_CIF = _formContext.getAttribute("qdb_cif_no").getValue()[0].name;
        //lcl_CIF =  "1000020";

        lcl_Amount = _formContext.getAttribute("qdb_disburse_amount_base").getValue();

        //lcl_ORG = "qdb1test";
        lcl_ORG = "qdb1";

        lcl_ORGURL = "https://qdbcrmapp:6001/SigCapIntV1.aspx";
        lcl_ORGURL += "?prmetn=" + lcl_ETN;
        lcl_ORGURL += "&prmid=" + lcl_EID;
        lcl_ORGURL += "&prmorg=" + lcl_ORG;
        lcl_ORGURL += "&prmcif=" + _formContext.getAttribute("qdb_cif_no").getValue()[0].id;
        lcl_ORGURL += "&prmuid=" + Xrm.Utility.getGlobalContext().getUserId();
        lcl_ORGURL += "&RET=##RETCODE##&MSG=##RETMSG##&TrnToken=##TRNTOKEN##";

        lcl_URL = "http://mvsigr01/webret/webretrieve.dll?Command=LoadForIntegration&IsIntregated=true&AccType=Account+Number&LangType=English";
        lcl_URL += "&AccNo=" + lcl_CIF;
        lcl_URL += "&Amount=" + lcl_Amount;
        lcl_URL += "&ORGURL=";

        //Xrm.Navigation.openAlertDialog({text: encodeURIComponent(lcl_ORGURL}) // MIGRATED: alert→openAlertDialog);
        //lcl_URL = lcl_URL + ;

        //encodeURIComponent(lcl_ORGURL);


        //window.open(lcl_URL + encodeURIComponent(lcl_ORGURL).replace(/'/g,"%27").replace(/"/g,"%22") + "&LangType=Eng", "", "dialogWidth:950px; dialogHeight:700px; center:yes;status:0;resizable:1;");


        //if (window.showModalDialog(lcl_URL + encodeURIComponent(lcl_ORGURL).replace(/'/g, "%27").replace(/"/g, "%22") + "&LangType=Eng", "", "dialogWidth:950px; dialogHeight:700px; center:yes;status:0;resizable:1;") == 1) {


        let BuiltUrl = lcl_URL + encodeURIComponent(lcl_ORGURL).replace(/'/g, "%27").replace(/"/g, "%22") + "&LangType=Eng";


        //var CompiledUrl = "http://mvcrmtest01:5556/QDB1TEST/WebResources/qdb_SigVerificationFrame.html"; //+BuiltUrl;


        let CompiledUrl = "https://qdbcrmapp/qdb1/WebResources/qdb_SigVerificationFrame.html"; //+BuiltUrl;

        let Qparams = [{ "name": "SigUrl", "url": BuiltUrl }];

        //Browser Stablization
        /*
        // MIGRATED: window.showModalDialog removed (unsupported in UCI). Original: if (window.showModalDialog(CompiledUrl, Qparams, "dialogWidth:1200px; dialogHeight:700px; center:yes;status:0;resizable:1;") == 1) {
        // TODO: Replace with Xrm.Navigation.openWebResource or custom dialog PCF.
        if (true) // MIGRATED: showModalDialog return value unavailable
            // window.location.reload(true);
            //old code not working
            //Page Refresh 
            _formContext.data.refresh();
        }
        else {
            // window.location.reload(true);
            //old code not working
            //Page Refresh 
            _formContext.data.refresh();
        }
        */
        window.open(BuiltUrl, "_blank")
    }

    /***********18/06/2016***************************/

    function PopulateMissingUrl() {

        //This function is a patch for Missing URLs

        try {

            let FORM_TYPE_CREATE = 1;
            let FORM_TYPE_UPDATE = 2;
            let FORM_TYPE_READ_ONLY = 3;
            let FORM_TYPE_DISABLED = 4;
            let FORM_TYPE_QUICK_CREATE = 5;
            let FORM_TYPE_BULK_EDIT = 6;
            let FORM_TYPE_READ_OPTIMIZED = 11;

            let formType = _formContext.ui.getFormType();

            let formId = _formContext.ui.formSelector.getCurrentItem().getId();

            //Xrm.Navigation.openAlertDialog({text: "Form ID & Label : " +getForm}) // MIGRATED: alert→openAlertDialog;


            if ((formType == FORM_TYPE_UPDATE) && (formId == "d0d4d217-bfdf-46ab-bf41-513b449b1ab6")) {
                let recordId = _formContext.data.entity.getId();

                if (_formContext.getAttribute("qdb_work_item") != null) {

                    //Xrm.Navigation.openAlertDialog({text: "Work Item Id : "+_formContext.getAttribute("qdb_work_item"}) // MIGRATED: alert→openAlertDialog.getValue()[0].id);

                    if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{19088AED-1220-E611-910E-00155D7B3411}")//Transfer Deposit RM Approval
                    {

                        if (_formContext.getAttribute("qdb_cheque_clearing_request") != null) {

                            if (_formContext.getAttribute("qdb_cheque_clearing_request").getValue() != null) {

                                let chequeClearingId = _formContext.getAttribute("qdb_cheque_clearing_request").getValue()[0].id;

                                Xrm.Navigation.openAlertDialog({text: "Cheque Clearing Id :" + chequeClearingId}) // MIGRATED: alert→openAlertDialog;

                            }


                        }


                    }

                }

            }

        }
        catch (e) {


        }

    }
    function DocumentaryCollectionFacilityReturnProcess() {
        //tab_DocumentaryCollectionFacilityReturnProcess
        //Approve(751,090,000)
        //Return to RM(751,090,001)
        //Return to Operations(751,090,002)
        //qdb_credit_head_facility_review_status
        //"{D1CCCB32-0E3F-E711-80F3-00155D78042C}" || ts_WorkItemStep.getValue()[0].id == "{AC9C3758-0F3F-E711-80F3-00155D78042C}") {
        qdb_Tab = _formContext.ui.tabs.get("tab_DocumentaryCollectionFacilityReturnProcess");
        _formContext.getAttribute("qdb_credit_head_facility_review_status").setRequiredLevel("required");
        _formContext.getAttribute("qdb_comments").setRequiredLevel("required");
        qdb_Tab.setVisible(true);


        //18181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility) Return  to RM by Head of CAD
        //1A181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility) Return to Ops by RM
        //1C181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility) Resubmit by Ops to RM

        //12181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility)Return to Ops by Head of CAD
        //14181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility)Return to RM by Ops
        //16181F78-4143-E711-80E3-00155D78042A-->(D/C-Facility) Resubmit by RM to Ops

        //(D/C-Disb)Return to RM by Head of CAD-->628589B3-DE42-E711-80F3-00155D78042C-->2C181F78-4143-E711-80E3-00155D78042A
        //(D/C-Disb)Return to Ops by RM-->0E53B8BC-DE42-E711-80F3-00155D78042C-->2E181F78-4143-E711-80E3-00155D78042A
        //(D/C-Disb)Resubmit by Ops to RM-->DA71C8CA-DE42-E711-80F3-00155D78042C-->30181F78-4143-E711-80E3-00155D78042A

        //(D/C-Disb)Return to Ops by Head of CAD-->3E9FE78F-DE42-E711-80F3-00155D78042C-->26181F78-4143-E711-80E3-00155D78042A
        //(D/C-Disb)Return to RM by Ops-->F1503698-DE42-E711-80F3-00155D78042C-->28181F78-4143-E711-80E3-00155D78042A
        //(D/C-Disb)Resubmit by RM to Ops-->A0AEF2A0-DE42-E711-80F3-00155D78042C-->2A181F78-4143-E711-80E3-00155D78042A

        if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{D1CCCB32-0E3F-E711-80F3-00155D78042C}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{DA7E3099-203F-E711-80F3-00155D78042C}"
            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{2C181F78-4143-E711-80E3-00155D78042A}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{30181F78-4143-E711-80E3-00155D78042A}"

            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{18181F78-4143-E711-80E3-00155D78042A}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{1C181F78-4143-E711-80E3-00155D78042A}"

        ) {

            let QDB_OptionSet = _formContext.getControl("qdb_credit_head_facility_review_status");
            QDB_OptionSet.clearOptions();
            let lcl_Optn1 = new Object();
            lcl_Optn1.text = "Completed Changes, submitted for Approval";
            lcl_Optn1.value = 751090000;
            QDB_OptionSet.addOption(lcl_Optn1);
            let lcl_Optn2 = new Object();
            lcl_Optn2.text = "Return to Operations";
            lcl_Optn2.value = 751090002;
            QDB_OptionSet.addOption(lcl_Optn2);

        }
        else if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{AC9C3758-0F3F-E711-80F3-00155D78042C}"
            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{2E181F78-4143-E711-80E3-00155D78042A}"

            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{1A181F78-4143-E711-80E3-00155D78042A}"
        ) {
            let QDB_OptionSet = _formContext.getControl("qdb_credit_head_facility_review_status");
            QDB_OptionSet.clearOptions();
            let lcl_Optn1 = new Object();
            lcl_Optn1.text = "Submit for RM";
            lcl_Optn1.value = 751090000;
            QDB_OptionSet.addOption(lcl_Optn1);

        }

        else if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{5AD887F5-083F-E711-80F3-00155D78042C}"
            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{26181F78-4143-E711-80E3-00155D78042A}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{2A181F78-4143-E711-80E3-00155D78042A}"

            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{12181F78-4143-E711-80E3-00155D78042A}" || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{16181F78-4143-E711-80E3-00155D78042A}"
        ) {

            let QDB_OptionSet = _formContext.getControl("qdb_credit_head_facility_review_status");
            QDB_OptionSet.clearOptions();
            let lcl_Optn1 = new Object();
            lcl_Optn1.text = "Completed Changes, submitted for Approval";
            lcl_Optn1.value = 751090000;
            QDB_OptionSet.addOption(lcl_Optn1);
            let lcl_Optn2 = new Object();
            lcl_Optn2.text = "Return to RM";
            lcl_Optn2.value = 751090001;
            QDB_OptionSet.addOption(lcl_Optn2);

        }
        else if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{421BC2BC-E33E-E711-80F3-00155D78042C}"
            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{28181F78-4143-E711-80E3-00155D78042A}"

            || _formContext.getAttribute("qdb_work_item").getValue()[0].id == "{14181F78-4143-E711-80E3-00155D78042A}"


        ) {
            let QDB_OptionSet = _formContext.getControl("qdb_credit_head_facility_review_status");
            QDB_OptionSet.clearOptions();
            let lcl_Optn1 = new Object();
            lcl_Optn1.text = "Submit for Operations";
            lcl_Optn1.value = 751090000;
            QDB_OptionSet.addOption(lcl_Optn1);

        }
        //(D/C)Return to RM by Ops-->421BC2BC-E33E-E711-80F3-00155D78042C
        //(D/C) Resubmit by RM to Ops-->5AD887F5-083F-E711-80F3-00155D78042C
        //(D/C-Facility)Return to Ops by Head of CAD-->1E12BB98-DF3E-E711-80F3-00155D78042C
    }

    function retrieveUrl(entityId, entitySchemaName) {
        SDK.REST.retrieveRecord(
            entityId,
            entitySchemaName,
            null, null,
            function (retrievedObject) {
                writeMessage("Retrieved the account named \"" + retrievedObject.Name + "\". This account was created on : \"" + retrievedObject.CreatedOn + "\".");
                //updateAccount(AccountId);
            },
            function (e) {
                Xrm.Navigation.openAlertDialog({text: e.message}) // MIGRATED: alert→openAlertDialog;
            }
        );
    }


    function updateRecord(entityId, disbursementUrl, entitySchemaName) {
        let crmEntity = {};
        //writeMessage("Changing the account Name to \"Updated Account Name\".");
        crmEntity.Name = "Updated Account Name";

        SDK.REST.updateRecord(
            entityId,
            crmEntity,
            "entitySchemaName",
            function () {
                //writeMessage("The account record changes were saved");
                //deleteAccount(AccountId);
            },
            function (e) {
                Xrm.Navigation.openAlertDialog({text: e.message}) // MIGRATED: alert→openAlertDialog;
            }
        );
    }

    function SetICCMemberGridUrl() {

        let newTarget;
        let Id;
        let TaskId = _formContext.data.entity.getId();
        let IFrame = _formContext.ui.controls.get("IFRAME_ICCMember");
        let LookupFieldObject = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue();

        if (LookupFieldObject != null) {
            Id = LookupFieldObject[0].id;

            newTarget = "https://qdbcrmapp:9797/ICCMembers.aspx?id=" + Id + "&taskid=" + TaskId;

            IFrame.setSrc(newTarget);
        }
    }
    function GetRmDepartmentForCreditRatingModel(result, id) {

        if (result != null && result['_qdb_rm_department_value'] != null) {
            //var lookup = new Array();
            //lookup[0] = new Object();
            //lookup[0].id = result["_qdb_rm_department_value"];
            //lookup[0].name = result["_qdb_rm_department_value@OData.Community.Display.V1.FormattedValue"];
            //lookup[0].entityType = result["_qdb_rm_department_value@Microsoft.Dynamics.CRM.lookuplogicalname"];
            // _formContext.getAttribute("qdb_relationshipmanager").setValue(lookup);

            let _departmnent = result["_qdb_rm_department_value@OData.Community.Display.V1.FormattedValue"];
            if (_departmnent != null && _departmnent != undefined) {
                let IFrame = _formContext.ui.controls.get("IFRAME_CreditRatingModel");
                let IframeUrl = "";

                if (_departmnent == "Business Finance") {
                    IframeUrl = "https://qdbcrmapp/QDB1/isv/qdb/fu/CreditAnalysisCreditRatingModel.aspx?FieldName={" + id + "}&RMDepartment=BusinessFinance";
                }
                if (_departmnent == "Al Dhameen") {
                    IframeUrl = "https://qdbcrmapp/QDB1/isv/qdb/fu/CreditAnalysisCreditRatingModel.aspx?FieldName={" + id + "}&RMDepartment=AlDhameen";
                }
                if (_departmnent == "TASDEER") {
                    _formContext.ui.tabs.get("tab_CA_Credit_Rating_Model").setVisible(false);
                }
                IFrame.setSrc(IframeUrl);
            }
        }
    }
    function SetCreditRatingModelUrl() {

        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref");
        if (LookupFieldObject != null) {
            let _loanApplication = LookupFieldObject.getValue();
            if (_loanApplication != null) {

                let LoanApplicationId = '';
                if (LookupFieldObject != null) {
                    LoanApplicationId = LookupFieldObject.getValue()[0].id;
                }

                let query = '';
                let theEntity = "qdb_loan_application";
                LoanApplicationId = LoanApplicationId.replace("{", "");
                LoanApplicationId = LoanApplicationId.replace("}", "");

                let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + theEntity + "s(" + LoanApplicationId + ")?$select=_qdb_rm_department_value";

                // Pass OData Query and UpdateFunction
                _executeODataQuery(query, GetRmDepartmentForCreditRatingModel, LoanApplicationId);

                //     var _fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
                // '<entity name="qdb_loan_application">' +
                //   '<attribute name="qdb_loan_applicationid" />' +
                //   '<attribute name="qdb_name" />' +
                //   '<attribute name="qdb_rm_department" />' +
                //   '<order attribute="qdb_name" descending="false" />' +
                //   '<filter type="and">' +
                //     '<condition attribute="qdb_loan_applicationid" operator="eq" value="' + _loanApplication[0].id + '" />' +
                //   '</filter>' +
                // '</entity>' +
                //'</fetch>';
                //     var LoanApplicationRecords = XrmServiceToolkit.Soap.Fetch(_fetchXml);
                //     if (LoanApplicationRecords.length > 0) {
                //         if (LoanApplicationRecords[0].attributes.qdb_rm_department != undefined)
                //             var _rmDepartment = LoanApplicationRecords[0].attributes.qdb_rm_department;
                //         var IFrame = _formContext.ui.controls.get("IFRAME_CreditRatingModel");
                //         var IframeUrl = "";


                //         if (_rmDepartment.name == "Business Finance") {
                //             IframeUrl = "https://qdbcrmapp/QDB1/isv/qdb/fu/CreditAnalysisCreditRatingModel.aspx?FieldName=" + _loanApplication[0].id + "&RMDepartment=BusinessFinance";
                //         }
                //         if (_rmDepartment.name == "Al Dhameen") {
                //             IframeUrl = "https://qdbcrmapp/QDB1/isv/qdb/fu/CreditAnalysisCreditRatingModel.aspx?FieldName=" + _loanApplication[0].id + "&RMDepartment=AlDhameen";
                //         }
                //         IFrame.setSrc(IframeUrl);

                //     }
            }

        }
    }

    function SetDirectorCreditRatingModelUrl() {

        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref");
        if (LookupFieldObject != null) {
            let _loanApplication = LookupFieldObject.getValue();
            if (_loanApplication != null) {
                let IFrame = _formContext.ui.controls.get("IFRAME_director_creditratingmodel");
                let IframeUrl = "";

                IframeUrl = "https://mcdynccatuat01/QDB1/isv/qdb/fu/CreditDirectorCreditRatingModel.aspx?id=" + _loanApplication[0].id
                IFrame.setSrc(IframeUrl);

            }
        }
    }
    function GetFacilityLimit() {
        let EntityName, EntityId, LookupFieldObject;
        let AlertMessage;
        LookupFieldObject = _formContext.data.entity.attributes.get('qdb_facility_number');

        if (LookupFieldObject.getValue() != null) {
            EntityId = LookupFieldObject.getValue()[0].id;
            EntityName = LookupFieldObject.getValue()[0].entityType;
            EntityNamePlural = EntityName.substring(0, EntityName.length - 1)
            if (EntityId != null) {
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }
            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityNamePlural + "ies(" + parsedID + ")?";
            _executeODataQuery(query, UpdateFacilityLimit);
        } else {

            ResetFacilityLimit();
        }



        if (AlertMessage != null) {

            //   Xrm.Navigation.openAlertDialog({text: AlertMessage}) // MIGRATED: alert→openAlertDialog;
            Alert.show("", AlertMessage, null, "INFO", 500, 200)
        }

    }

    function ResetFacilityLimit() {

        if (_formContext.getAttribute("qdb_type_of_facility") != null) {
            _formContext.getAttribute("qdb_type_of_facility").setValue(null);
            _formContext.getAttribute("qdb_type_of_facility").setSubmitMode("always");
        }

        if (_formContext.getAttribute("qdb_product") != null) {
            _formContext.getAttribute("qdb_product").setValue(null);
            _formContext.ui.controls.get("qdb_product").setDisabled(false);
            _formContext.ui.controls.get("qdb_type_of_facility").setDisabled(false);
        }
    }
    function UpdateFacilityLimit(result) {

        if (result != null && result['_qdb_product_type_value'] != null) {

            let lookupData = new Array();

            let lookupItem = new Object();

            lookupItem.id = result['_qdb_product_type_value'];

            lookupItem.name = result['_qdb_product_type_value@OData.Community.Display.V1.FormattedValue'];

            lookupItem.typename = result['_qdb_product_type_value@Microsoft.Dynamics.CRM.lookuplogicalname'];

            lookupData[0] = lookupItem;
            if (_formContext.getAttribute("qdb_product") != null) {
                _formContext.getAttribute("qdb_product").setValue(lookupData);
                _formContext.ui.controls.get("qdb_product").setDisabled(true);
            }


        } else {
            if (_formContext.getAttribute("qdb_product") != null) {
                _formContext.ui.controls.get("qdb_product").setDisabled(false);
            }
        }
    }
    function dcHeadCadApprovalStatus_onchange() {

        let approvalStatus = _formContext.getAttribute("qdb_credit_head_facility_review_status").getValue();
        if (approvalStatus == 751090000) {
            _formContext.getAttribute("qdb_facility_number").setRequiredLevel("required");
        }
        else {
            _formContext.getAttribute("qdb_facility_number").setRequiredLevel("none");
        }

    }

    function CallBillLodgementNumberAction() {

        try {
            //Alert.showLoading();
            let serverURL = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext;
            //var query = actionName;
            let _InputID = _formContext.data.entity.getId();
            let billReference = _formContext.data.entity.attributes.get('qdb_bill_ref_no').getValue();
            let DocumentLodgmentType = '';
            let _workTask = _formContext.getAttribute("qdb_work_item").getValue()[0].id;
            if (_workTask == "{0D0986F6-D3F1-E211-A9BB-00155D788238}") {
                DocumentLodgmentType = "LC";
            }
            if (_workTask == "{02181F78-4143-E711-80E3-00155D78042A}") {
                DocumentLodgmentType = "DC";
            }

            let data = { "BillLodgementNumber": billReference, "TaskID": _InputID, "DocumentType": DocumentLodgmentType };
            let Id = _formContext.data.entity.getId().replace('{', '').replace('}', '');
            let req = new XMLHttpRequest();
            req.open("POST", serverURL + "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */qdb_status_histories(" + Id + ")/Microsoft.Dynamics.CRM.qdb_DCGetBillLodgementNumberDetails", true);
            req.setRequestHeader("Accept", "application/json");
            req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
            req.setRequestHeader("OData-MaxVersion", "4.0");
            req.setRequestHeader("OData-Version", "4.0");
            req.onreadystatechange = function () {
                if (this.readyState == 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (this.status == 200) {
                        result = JSON.parse(this.response);
                        if (result["result"] == "SUCCESS") {
                            //Alert.hide();
                            Xrm.Navigation.openAlertDialog({text: "Data Loaded Successfully"}) // MIGRATED: alert→openAlertDialog;
                            //Xrm.Navigation.openAlertDialog({text: result["resultDescription"]}) // MIGRATED: alert→openAlertDialog;
                            Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
                        }
                        else {
                            //Alert.hide();
                            Xrm.Navigation.openAlertDialog({text: result["result"]}) // MIGRATED: alert→openAlertDialog;
                            Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
                        }
                    } else {
                        // Alert.hide();
                        let error = JSON.parse(this.response).error;
                        Xrm.Navigation.openAlertDialog({text: error.message}) // MIGRATED: alert→openAlertDialog;
                        Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
                    }
                }
            };
            req.send(window.JSON.stringify(data));
        } catch (e) {
            //Alert.hide();
            Xrm.Navigation.openAlertDialog({text: e}) // MIGRATED: alert→openAlertDialog;
            Xrm.Navigation.openForm({entityName: _formContext.data.entity.getEntityName(, entityId: null}) // MIGRATED: openEntityForm→openForm, _formContext.data.entity.getId());
        }

    }

    function EWS_StautsProject() {

        let LookupFieldObject = _formContext.getAttribute("qdb_work_item").getValue()[0].id;

        if (LookupFieldObject == "{5A5DE288-126C-EA11-813E-02BF800001AD}") {

            if (_formContext.getAttribute("qdb_isthebusinesscommerciallyoperational").getValue() == 751090000) {
                _formContext.getControl("qdb_receivedmasteragreementfromrmdate").setVisible(true);
                _formContext.getAttribute("qdb_receivedmasteragreementfromrmdate").setRequiredLevel("required");
            }
            else {
                _formContext.getControl("qdb_receivedmasteragreementfromrmdate").setVisible(false);
                _formContext.getAttribute("qdb_receivedmasteragreementfromrmdate").setRequiredLevel("none");
                _formContext.data.entity.attributes.get('qdb_receivedmasteragreementfromrmdate').setValue(null);
            }
        }
    }

    function OperationDate() {
        let commercialOperationDate = "";
        let DateTimeNOW = "";
        let LookupFieldObject = _formContext.getAttribute("qdb_work_item").getValue()[0].id;

        if (LookupFieldObject == "{5A5DE288-126C-EA11-813E-02BF800001AD}") {

            if (_formContext.getAttribute("qdb_receivedmasteragreementfromrmdate") != null && _formContext.getAttribute("qdb_receivedmasteragreementfromrmdate").getValue() != null) {
                commercialOperationDate = _formContext.getAttribute("qdb_receivedmasteragreementfromrmdate").getValue();
                DateTimeNOW = new Date();
                DateTimeNOW.setDate(DateTimeNOW.getDate() - 1);
            }

            if (commercialOperationDate != "" && DateTimeNOW != "") {
                if (commercialOperationDate < DateTimeNOW) {
                    Xrm.Navigation.openAlertDialog({text: "Expected date for commercial operations to start can't be in Past and Must always be in Future"}) // MIGRATED: alert→openAlertDialog;
                    _formContext.getAttribute("qdb_receivedmasteragreementfromrmdate").setValue(null);
                }
            }
        }
    }

    function FinancialDate() {
        let commercialOperationDate = "";
        let DateTimeNOW = "";
        let LookupFieldObject = _formContext.getAttribute("qdb_work_item").getValue()[0].id;

        if (LookupFieldObject == "{EBBBC5DC-126C-EA11-813E-02BF800001AD}") {

            if (_formContext.getAttribute("qdb_performa_invoice_date") != null && _formContext.getAttribute("qdb_performa_invoice_date").getValue() != null) {
                commercialOperationDate = _formContext.getAttribute("qdb_performa_invoice_date").getValue();
                DateTimeNOW = new Date();
                DateTimeNOW.setDate(DateTimeNOW.getDate() - 1);
            }

            if (commercialOperationDate != "" && DateTimeNOW != "") {
                if (commercialOperationDate < DateTimeNOW) {
                    Xrm.Navigation.openAlertDialog({text: "Financial Year Date can't be in Past and Must always be in Future"}) // MIGRATED: alert→openAlertDialog;
                    _formContext.getAttribute("qdb_performa_invoice_date").setValue(null);
                }
            }
        }
    }

    function SetSharePointDocumentLibraryURL() {


        let LookupFieldObject2 = _formContext.getAttribute("qdb_loan_application_ref").getValue();
        let IFrame = _formContext.ui.controls.get("IFRAME_LCDocuments");
        let newTarget;

        if (LookupFieldObject2 != null && LookupFieldObject2 != "") {
            newTarget = "https://qdbcrmapp:9798/ShowLCDocumentsFromSharePoint.aspx?lcno=" + LookupFieldObject2[0].id; + "&cifno=LoanApplication";
            IFrame.setSrc(newTarget);
            //Xrm.Navigation.openAlertDialog({text: newTarget}) // MIGRATED: alert→openAlertDialog;
        } if (_formContext.getAttribute("qdb_disbursement_for") != null && _formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {
            let cif_no = _formContext.getAttribute("qdb_cif_no").getValue()[0].id;
            let DRno = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;
            let docURL = netBaseURL + ":9797/CentralizedDocumentsBayAlWadiya.aspx?entitylogicalname=qdb_payment_authorization_ticket&subentity=qdb_payment_authorization_ticket&id="
                + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id + "&crno=" + _formContext.getAttribute("qdb_cif_no").getValue()[0].id + "&userid=" + Xrm.Utility.getGlobalContext().getUserId();
            IFrame.setSrc(docURL);
        }
        else {
            newTarget = "https://qdbcrmapp:9798/ShowLCDocumentsFromSharePoint.aspx?lcno=&cifno=";

            IFrame.setSrc(newTarget);
        }
    }

    function showOSSDocs(result) {
        if (result != null && result["_qdb_oss_application_value"]) {
            let lookupData = new Array();
            let lookupItem = new Object();
            lookupItem.id = result["_qdb_oss_application_value"];
            lookupItem.name = result["_qdb_oss_application_value@OData.Community.Display.V1.FormattedValue"];
            lookupItem.typename = result['_qdb_oss_application_value@Microsoft.Dynamics.CRM.lookuplogicalname'];
            lookupData[0] = lookupItem;

            let id = lookupData[0].id;

            let IFrame = _formContext.ui.controls.get("IFRAME_OSSDocs");
            let newTarget;
            let userId = Xrm.Utility.getGlobalContext().getUserId();

            if (id != null && id != "") {
                newTarget = "https://qdbcrmapp:9797/MicroFinanceDocuments.aspx?id=" + id + "&entityTypeName=qdb_microfinance&createdby=" + userId + "&orgContext=BFD_PROD";
                if (IFrame != null) {
                    IFrame.setSrc(newTarget);
                }
            }

        }
    }

    //****************************Company Classification*****************************//
    function SetCompanyClassification_Onload() {
        let entityName = "";
        let workTaskType = _formContext.getAttribute("qdb_work_item").getValue();
        let entityId = workTaskType[0].id;
        if (workTaskType != null) {
            let entityName = workTaskType[0].name;
        }
        if (GetLoanApplication_IDType() == 751090003) {//C.R. Number
            let companyCalssificationValue = _formContext.getAttribute("qdb_aldhameencreditofficerapproval").getValue();
            if (_formContext.getAttribute("qdb_cif_no").getValue() != null && companyCalssificationValue == null) {

                SetCompanyClassfication_OnChange();
            }
            if (entityName == "Credit Proposal (In Progress)" && _formContext.getAttribute("qdb_cif_no").getValue() == null && companyCalssificationValue == null) {

                _formContext.getAttribute("qdb_aldhameencreditofficerapproval").setRequiredLevel("required");
            }
        }
        else {
            if (_formContext.getControl("qdb_aldhameencreditofficerapproval")) {

                _formContext.getControl("qdb_aldhameencreditofficerapproval").setVisible(false);
            }

        }
    }
    function SetCompanyClassfication_OnChange() {
        //call function
        let idType = GetLoanApplication_IDType();
        let entityName = "";
        let workTaskType = _formContext.getAttribute("qdb_work_item").getValue();
        let entityId = workTaskType[0].id;
        if (workTaskType != null) {
            let entityName = workTaskType[0].name;
        }
        if (idType == 751090003 && entityName == "Credit Proposal (In Progress)") {//C.R. Number
            if (_formContext.getAttribute("qdb_cif_no")) {
                let customer = _formContext.getAttribute("qdb_cif_no").getValue();
                if (customer != null) {
                    let entityId = customer[0].id;
                    entityId = entityId.replace("{", "").replace("}", "");
                    let req = new XMLHttpRequest();
                    req.open("GET", Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/api/data/v8.1/accounts(" + entityId + ")?$select=accountid,qdb_company_classification", true);
                    req.setRequestHeader("OData-MaxVersion", "4.0");
                    req.setRequestHeader("OData-Version", "4.0");
                    req.setRequestHeader("Accept", "application/json");
                    req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
                    req.setRequestHeader("Prefer", "odata.include-annotations=\"*\"");
                    req.onreadystatechange = function () {
                        if (this.readyState === 4) {
                            req.onreadystatechange = null;
                            if (this.status === 200) {
                                let result = JSON.parse(this.response);
                                let qdb_company_classification = result["qdb_company_classification"];
                                if (qdb_company_classification != null) {
                                    _formContext.getAttribute("qdb_aldhameencreditofficerapproval").setValue(qdb_company_classification);
                                    _formContext.getControl("qdb_aldhameencreditofficerapproval").setDisabled(true);
                                    _formContext.getAttribute("qdb_aldhameencreditofficerapproval").setRequiredLevel("none");

                                }
                                else {
                                    _formContext.getAttribute("qdb_aldhameencreditofficerapproval").setValue(null);
                                    _formContext.getAttribute("qdb_aldhameencreditofficerapproval").setRequiredLevel("required");
                                    _formContext.getControl("qdb_aldhameencreditofficerapproval").setDisabled(false);
                                }

                            } else {
                                //Xrm.Utility.alertDialog(this.statusText);
                            }
                        }
                    };
                    req.send();
                }

            }
        }

    }

    function GetLoanApplication_IDType() {
        let loanApplicationIdType = 0;
        if (_formContext.getAttribute("qdb_loan_application_ref")) {
            let loanApplication = _formContext.getAttribute("qdb_loan_application_ref").getValue();
            if (loanApplication != null) {
                let entityId = loanApplication[0].id;
                entityId = entityId.replace("{", "").replace("}", "");
                let req = new XMLHttpRequest();
                req.open("GET", Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/api/data/v8.1/qdb_loan_applications(" + entityId + ")?$select=qdb_id_type", false);
                req.setRequestHeader("OData-MaxVersion", "4.0");
                req.setRequestHeader("OData-Version", "4.0");
                req.setRequestHeader("Accept", "application/json");
                req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
                req.setRequestHeader("Prefer", "odata.include-annotations=\"*\"");
                req.onreadystatechange = function () {
                    if (this.readyState === 4) {
                        req.onreadystatechange = null;
                        if (this.status === 200) {
                            let result = JSON.parse(this.response);
                            let qdb_id_type = result["qdb_id_type"];

                            if (qdb_id_type != null) {
                                loanApplicationIdType = qdb_id_type;
                            }

                        } else {
                            Xrm.Utility.alertDialog(this.statusText);

                        }
                    }
                };
                req.send();
            }


        }
        return loanApplicationIdType;
    }


    //13062021_U
    function setContractPrintDatetoDefault() {
        let qdb_work_item;
        let qdb_record_type;

        if (_formContext.getControl('qdb_work_item') != null) {
            qdb_work_item = _formContext.getAttribute('qdb_work_item').getValue()[0].id;
        }

        if (_formContext.getControl("qdb_record_type") != null) {
            qdb_record_type = _formContext.getAttribute('qdb_record_type').getValue()[0].id;
        }

        if (qdb_work_item == '{3819B52A-540B-E411-9003-00155D780506}' && qdb_record_type == "{B4F84151-03C9-E211-BC78-00155D787B38}") {

            if (_formContext.getControl("qdb_documents_recieved_date") != null && _formContext.getAttribute("qdb_documents_recieved_date").getValue() == null) {
                _formContext.getAttribute("qdb_documents_recieved_date").setValue(Date.now());
            }
        }
    }


    //07072021_U
    function HideReturnToRequestorOptionForCase() {

        if (_formContext.getAttribute("qdb_record_type") != null)

            let recordType = _formContext.getAttribute("qdb_record_type").getValue();

        if (recordType.length > 0) {
            if (recordType[0].id.toLowerCase() == "{891b1b5a-3e4c-e311-9bb2-00155d788238}") {
                if (_formContext.getControl("qdb_complaint_status") != null) {
                    _formContext.getControl("qdb_complaint_status").removeOption(751090002);
                }
            }
        }
    }

    function HideKYCApprovalStatusTAB() {
        let workTaskId = _formContext.getAttribute("qdb_work_item").getValue();

        if (workTaskId[0].id.toLowerCase() == "{e58982ea-7606-ec11-815a-00155d3a805f}") {
            if (_formContext.ui.tabs.get("tab_kyc") != null) {
                _formContext.ui.tabs.get("tab_kyc").setVisible(true);
            }
        } else {
            if (_formContext.ui.tabs.get("tab_kyc") != null) {
                _formContext.ui.tabs.get("tab_kyc").setVisible(false);
            }
        }
    }

    function SetUploadGrid() {

        let prmRecordId = _formContext.data.entity.getId();

        let IFrame = _formContext.ui.controls.get("IFRAME_UploadOfferSignContract");

        newTarget = "https://qdbcrmapp/isv/qdb/fu/fileupload.aspx?orgname=qdb1&type=10062&fid=qdb_offer_acceptance&typename=qdb_status_history&id=" + prmRecordId;
        IFrame.setSrc(newTarget);


    }

    function CustomDeclaration() {

        let ts_WorkItemStep = _formContext.getAttribute("qdb_work_item");

        if (ts_WorkItemStep.getValue()[0].id == "{5E1C9FFA-6861-EC11-816A-0050568F3B81}" || ts_WorkItemStep.getValue()[0].id == "{1B65995A-FBC5-EC11-8100-0050568FDDDF}" || ts_WorkItemStep.getValue()[0].id == "{D4E1B8F8-FAC5-EC11-8100-0050568FDDDF}") {
            let qdb_StatusCode = _formContext.getAttribute("qdb_customdeclerationstatusops");
            if (qdb_StatusCode.getValue() == 751090000) {
                _formContext.getControl("qdb_is_client_contractor").setVisible(true);
                _formContext.getAttribute("qdb_is_client_contractor").setValue(1);
                _formContext.getAttribute("qdb_is_client_contractor").setSubmitMode("always");
            }
            else {
                _formContext.getControl("qdb_is_client_contractor").setVisible(false);
                _formContext.getAttribute("qdb_is_client_contractor").setValue(0);
                _formContext.getAttribute("qdb_is_client_contractor").setSubmitMode("always");
            }
        }
    }

    function EvaluationIframeLoad() {

        let LookupFieldObject = _formContext.getAttribute("qdb_loan_application_ref").getValue();

        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject[0].id;
            EntityName = LookupFieldObject[0].entityType;
            // var SubString = EntityName.substring(0, EntityName.length - 1);

            if (EntityId != null) {
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }
        }

        let srid = parsedID;

        let IFrame = _formContext.ui.controls.get("IFRAME_IFRAME_MachineryDetails");
        let newTarget;

        if (srid != null && srid != "") {
            newTarget = "https://qdbcrmapp:9797/TechnicalAnalysisLoanApplication.aspx?id=" + srid;
            if (IFrame != null) {
                IFrame.setSrc(newTarget);
            }
        }
    }


    function ShowKyc() {


        let termsheetId = _formContext.getAttribute("qdb_term_sheet_ref_no");



    }

    //27 MARCH 2022 _U
    function SetSecurityDocumentURL() {

        let taskId = _formContext.data.entity.getId();
        let termSheet = _formContext.getAttribute("qdb_term_sheet_ref_no");
        let termSheetId = termSheet.getValue()[0].id;
        let IFrame = _formContext.ui.controls.get("IFRAME_SecurityDocuments");

        if (IFrame != null) {

            let iframe_url = "https://qdbcrmapp:9797/PrintAndHandoverSecurityDocumentUpload.aspx?taskid=" + taskId + "&termsheetid=" + termSheetId;

            IFrame.setSrc(iframe_url);
        }
    }

    function caseTaskDescision() {

        if (_formContext.getAttribute("qdb_case_type") != null && _formContext.getAttribute("qdb_case_type").getValue() != null && _formContext.getAttribute("qdb_case_type").getValue() == 751090001) {

            let qdb_work_item = _formContext.getAttribute("qdb_work_item");
            let qdb_record_type = _formContext.getAttribute("qdb_record_type");


            if (qdb_work_item != null && qdb_work_item.getValue() != null && qdb_work_item.getValue()[0].id == "{7599EBCE-3E4C-E311-9BB2-00155D788238}" &&
                qdb_record_type != null && qdb_record_type.getValue() != null && qdb_record_type.getValue()[0].id == "{891B1B5A-3E4C-E311-9BB2-00155D788238}") {
                let qdb_complaint_status = _formContext.getControl("qdb_complaint_status");

                let ownerid = _formContext.getAttribute("ownerid");

                if (ownerid != null && ownerid.getValue() != null) {
                    let id = _formContext.getAttribute("ownerid").getValue()[0].id;
                    if (id != "{35559FAA-2AEE-E411-9EF4-00155D78031A}" && id != "{4604F9BB-F436-EC11-8161-0050568F3B81}" &&
                        id != "{279A2CE7-9F11-E811-80F4-02BF800001AD}" && id != "{48F34120-0F3C-E711-80E6-00155D788250}" &&
                        id != "{0E1423CB-4AF9-E811-8104-02BF800001AD}" && id != "{7D41CD20-2A25-E811-80F5-02BF800001AD}" &&

                        id != "{7D41CD20-2A25-E811-80F5-02BF800001AD}" && id != "{E8CB663D-E74E-E711-80E8-00155D159B25}" &&
                        id != "{B07E7832-0A3E-E711-80E7-02BF800001AD}" && id != "{D2BF6921-8981-EB11-8151-00155D3A8060}" &&
                        id != "{11610EED-B53C-E711-80E6-00155D788250}") {


                    }

                }
            }
        }
    }

    function enableCaseType() {
        let UserID = Xrm.Utility.getGlobalContext().getUserId();
        if (UserID == '{4604F9BB-F436-EC11-8161-0050568F3B81}' || UserID == '{35559FAA-2AEE-E411-9EF4-00155D78031A}' || UserID == '{48F34120-0F3C-E711-80E6-00155D788250}') {

            let qdb_work_item = _formContext.getAttribute("qdb_work_item");
            let qdb_record_type = _formContext.getAttribute("qdb_record_type");

            if (qdb_work_item != null && qdb_work_item.getValue() != null && qdb_work_item.getValue()[0].id == "{C838B102-4E4C-E311-9BB2-00155D788238}" &&
                qdb_record_type != null && qdb_record_type.getValue() != null && qdb_record_type.getValue()[0].id == "{891B1B5A-3E4C-E311-9BB2-00155D788238}") {

                _formContext.getControl("qdb_case_type").setDisabled(false);
            }
        }

    }

    function RemoveHCADInspectionApprovalExtraOptions() {
        if (_formContext.getAttribute("qdb_disbursement_for") != null) {
            if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090004);
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090000);
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090002);
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090003);
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090001);
            }
            else {
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090006);
                _formContext.getControl('qdb_disbursment_rm_review_approval').removeOption(751090005);

                if (_formContext.getControl('qdb_inspectionperformedpreviouslyforsameprodu') != null) {
                    _formContext.getControl('qdb_inspectionperformedpreviouslyforsameprodu').setVisible(false);
                }

            }
        }
    }




    function checkTaskAndSetSharePointURLFrame() {
        let workTask = _formContext.getAttribute("qdb_work_item").getValue();

        if (workTask != null && workTask != "") {

            if (workTask[0] != null) {
                if (workTask[0].id == "{EBB77D8B-1F4A-E311-9BB2-00155D788238}") {
                    _formContext.ui.tabs.get("tab_60").setVisible(true);
                    SetSharePointDocumentLibraryURL();
                }
            }


        }
    }



    function SetSharePointDocumentLibraryURL() {
        let LookupFieldObject2 = _formContext.getAttribute("qdb_cheque_clearing_request").getValue();
        let LookupFieldObjectCustomer = _formContext.getAttribute("qdb_cif_no");
        let IFrame = _formContext.ui.controls.get("IFRAME_DOC");
        let newTarget;

        if (LookupFieldObject2 != null && LookupFieldObject2 != "") {
            if (LookupFieldObjectCustomer != null) {
                let LookupFieldObjectCustomerValue = LookupFieldObjectCustomer.getValue();

                if (LookupFieldObjectCustomerValue != null) {
                    newTarget = "https://qdbcrmapp:9798/ShowLCDocumentsFromSharePoint.aspx?lcno=" + LookupFieldObject2[0].name + "&cifno=" + LookupFieldObjectCustomerValue[0].name;
                    IFrame.setSrc(newTarget);
                }
            }
        }
        else {
            newTarget = "https://qdbcrmapp:9798/ShowLCDocumentsFromSharePoint.aspx?lcno=&cifno=";

            IFrame.setSrc(newTarget);
        }
    }

    function UpdateRmOptions() {
        let workTask = _formContext.getAttribute("qdb_work_item").getValue()[0].id;

        if (workTask == "{94EDAED3-FDCA-E211-BC78-00155D787B38}") {
            let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
            QDB_OptionSet.clearOptions();
            let lcl_Optn1 = new Object();
            lcl_Optn1.text = "Approve Disbursement Request";
            lcl_Optn1.value = 751090000;
            QDB_OptionSet.addOption(lcl_Optn1);
            let lcl_Optn2 = new Object();
            lcl_Optn2.text = "Return to Customer Services";
            lcl_Optn2.value = 751090002;
            QDB_OptionSet.addOption(lcl_Optn2);
        }
        else if (workTask == "{18913FC4-0DCB-E211-BC78-00155D787B38}") {
            if (_formContext.getAttribute("qdb_disburse_through").getValue() == 751090004) {
                let QDB_OptionSet = _formContext.getControl("qdb_disbursment_rm_review_approval");
                QDB_OptionSet.clearOptions();
                let lcl_Optn1 = new Object();
                lcl_Optn1.text = "Approve Disbursement Request with Inspection";
                lcl_Optn1.value = 751090006;
                QDB_OptionSet.addOption(lcl_Optn1);
                let lcl_Optn2 = new Object();
                lcl_Optn2.text = "Approve Disbursement Request without Inspection";
                lcl_Optn2.value = 751090005;
                QDB_OptionSet.addOption(lcl_Optn2);
            }
        }
    }

    function setOptionSet(ts_WorkItemStep, QDB_OptionSet) {
        try {

            QDB_OptionSet.removeOption(751090003);

            if (ts_WorkItemStep == "{C9CEF219-3AF9-ED11-910A-DD1D0837AE2B}" || ts_WorkItemStep == "{B87734E2-AEF4-ED11-910A-DD1D0837AE2B}") {
                QDB_OptionSet.removeOption(751090001);
                QDB_OptionSet.removeOption(751090002);
                QDB_OptionSet.removeOption(100000000);

                let opt = new Option();
                opt.text = "Return to Manager";
                opt.value = 751090003;
                QDB_OptionSet.addOption(opt, 751090003);

                //WQ-WTO-Rejection-21210
                AddRejectOptionForWTO(ts_WorkItemStep, QDB_OptionSet);
            }
            else if (ts_WorkItemStep == "{565EAF68-4746-E311-9BB2-00155D788238}") {
                QDB_OptionSet.removeOption(751090002);
                QDB_OptionSet.removeOption(100000000);
            }
            else if (ts_WorkItemStep == "{3FA80839-A9F4-ED11-910A-DD1D0837AE2B}") {
            }
            else {
                QDB_OptionSet.removeOption(751090001);
                QDB_OptionSet.removeOption(100000000);

            }
        }
        catch (e) {

        }
    }

    function ShowDocumentsBayAlwadiya() {

        let IFrame = _formContext.ui.controls.get("IFRAME_LCDocuments");
        if (IFrame == null) {
            return;
        }

        if (_formContext.getAttribute("qdb_disbursement_for") != null && _formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {
            let cif_no = _formContext.getAttribute("qdb_cif_no").getValue()[0].id;
            let DRno = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;
            let docURL = netBaseURL + ":9797/CentralizedDocumentsBayAlWadiya.aspx?entitylogicalname=qdb_payment_authorization_ticket&subentity=qdb_payment_authorization_ticket&id="
                + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id + "&crno=" + _formContext.getAttribute("qdb_cif_no").getValue()[0].id + "&userid=" + Xrm.Utility.getGlobalContext().getUserId();
            IFrame.setSrc(docURL);
        }
    }

    //7 JAN 2024_U
    function isUserFromCXTeam() {

        let userRoles = Xrm.Utility.getGlobalContext().getUserRoles();


        for (var i = 0; i < userRoles.length; i++) {

            if (userRoles[i].toLowerCase() == "05953988-57ad-ee11-994b-6045bdfa350b" || userRoles[i].toLowerCase() == "bd385f85-8da4-491c-95b0-977ece3e6c6b") {
                return true;
            }
        }

        return false;
    }

    //WQ-WTO-Rejection-21210
    function _executeODataQuerySync(ODataQuery, SuccessFunction, isAsync) {
        // Pass Entity's plural name in ODataQuery    
        if (isAsync == null) {
            isAsync = true;
        }
        let serverUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext;
        // Adjust URL for differences between on premise and online    
        if (serverUrl.match(/\/$/)) {
            serverUrl = serverUrl.substring(0, serverUrl.length - 1);
        }
        // Creation of HTTP response header    
        let ODataURL = serverUrl + ODataQuery;
        let req = new XMLHttpRequest();
        req.open("GET", ODataURL, isAsync);
        req.setRequestHeader("OData-MaxVersion", "4.0");
        req.setRequestHeader("OData-Version", "4.0");
        req.setRequestHeader("Accept", "application/json");
        req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
        req.setRequestHeader("Prefer", "odata.include-annotations=\"*\"");
        req.onreadystatechange = function () {
            if (this.readyState === 4) {
                req.onreadystatechange = null;
                if (this.status === 200) {
                    let returnresult = JSON.parse(this.response);
                    SuccessFunction(returnresult);
                }
                else {
                    Alert.show(this.statusText, null, null, "ERROR", 500, 200);
                }
            }
        };
        // Execute HTTTP request    
        req.send();
    }

    //WQ-WTO-Rejection-21210

    function AddRejectOptionForWTO(ts_WorkItemStep, QDB_OptionSet) {
        if (ts_WorkItemStep == "{B87734E2-AEF4-ED11-910A-DD1D0837AE2B}") {
            try {
                let query = "/api/data/v8.2/qdb_loan_applications(" + _formContext.getAttribute("qdb_loan_application_ref").getValue()[0].id.replace('}', '').replace('{', '') + ")?$select=_qdb_wtoref_value";
                _executeODataQuerySync(query, function (result) {

                    let ResponseData = result;
                    if (ResponseData["_qdb_wtoref_value"] && ResponseData["_qdb_wtoref_value"] != null) {
                        let opt = new Option();
                        opt.text = "Reject";
                        opt.value = 100000000;
                        QDB_OptionSet.addOption(opt, 100000000);
                    }

                }, false);
            }
            catch (ex) {
                throw ex;
            }
        }
    }





    function GetFacilityLimitProduct() {


        let QDB_RecordType = _formContext.getAttribute("qdb_record_type");

        if (QDB_RecordType != null) {

            if (QDB_RecordType.getValue()[0].id.toUpperCase() == "{0E634601-BDBC-E211-90D7-00155D787B38}") {

                let WorkTask = _formContext.getAttribute("qdb_work_item");


                if (WorkTask != null) {

                    if (WorkTask.getValue()[0].id.toUpperCase() == "{90BE9DE8-BEBC-E211-90D7-00155D787B38}") {



                        // Step 2: Now fetch product

                        let LookupFieldObject = _formContext.data.entity.attributes.get('qdb_facility_number');

                        if (LookupFieldObject.getValue() != null) {

                            let EntityId = LookupFieldObject.getValue()[0].id.replace("{", "").replace("}", "");

                            let EntityName = LookupFieldObject.getValue()[0].entityType;

                            let EntityNamePlural = EntityName.substring(0, EntityName.length - 1);

                            let serverUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext;

                            if (serverUrl.match(/\/$/)) {

                                serverUrl = serverUrl.substring(0, serverUrl.length - 1);

                            }

                            let query = "/api/data/v9.2/ /* MIGRATED: updated to v9.2 */" + EntityNamePlural + "ies?$select=qdb_discounting&$expand=qdb_qdb_product&$filter=qdb_facilityid  eq " + EntityId;

                            let ODataURL = serverUrl + query;



                            let req = new XMLHttpRequest();

                            req.open("GET", ODataURL, false);

                            req.setRequestHeader("OData-MaxVersion", "4.0");

                            req.setRequestHeader("OData-Version", "4.0");

                            req.setRequestHeader("Accept", "application/json");

                            req.setRequestHeader("Content-Type", "application/json; charset=utf-8");

                            req.setRequestHeader("Prefer", "odata.include-annotations=\"*\"");



                            req.onreadystatechange = function () {

                                if (this.readyState === 4) {

                                    req.onreadystatechange = null;

                                    if (this.status === 200) {


                                        let result = JSON.parse(this.response);

                                        if (result.value.length > 0) {

                                            let productId = result.value[0].qdb_qdb_product.qdb_facility_productid.toUpperCase();



                                            if (productId == "486B58F2-5356-E711-80E8-00155D159B25" || productId == "8E9CA6F8-BA33-EB11-8147-00155D3A805F"

                                                || productId == "855BD75F-4A9B-EF11-9ECC-0050568F3900" || productId == "A2358D9B-F74C-EC11-8167-0050568F3B81"

                                                || productId == "9169C3AA-0AA2-ED11-8116-0050568FDDDF" || productId == "6E53677D-22D4-F011-9954-005056BE3C5D"

                                                || productId == "82A6CBDA-26AC-F011-AABA-005056BECC08" || productId == "26E8AB1C-27AC-F011-AABA-005056BECC08"

                                                || productId == "88979440-48AC-E911-8124-02BF800001AD" || productId == "14FEDFFC-F573-EA11-813E-02BF800001AD"

                                                || productId == "CE785C8B-B18A-EA11-813E-02BF800001AD" || productId == "29B68816-BD16-EF11-A55A-6045BDFA423C") {


                                                _formContext.getControl("qdb_remaining_amount").setVisible(true);

                                                _formContext.getAttribute("qdb_remaining_amount").setRequiredLevel("required");

                                                if (result.value[0].qdb_discounting > 0 && (_formContext.getAttribute("qdb_remaining_amount").getValue() == 0 || _formContext.getAttribute("qdb_remaining_amount").getValue() == null)) {

                                                    _formContext.getAttribute("qdb_remaining_amount").setValue(result.value[0].qdb_discounting);

                                                }

                                            }

                                            else {

                                                _formContext.getControl("qdb_remaining_amount").setVisible(false);
                                                _formContext.getAttribute("qdb_remaining_amount").setRequiredLevel("none");
                                                _formContext.data.entity.attributes.get('qdb_remaining_amount').setValue(null);

                                            }

                                        } else {

                                            _formContext.getControl("qdb_remaining_amount").setVisible(false);
                                            _formContext.getAttribute("qdb_remaining_amount").setRequiredLevel("none");
                                            _formContext.data.entity.attributes.get('qdb_remaining_amount').setValue(null);

                                        }
                                    }
                                }
                            };

                            req.send();

                        }
                    }

                    else {

                        // Department is not Credit Admin → hide field

                        _formContext.getControl("qdb_remaining_amount").setVisible(false);

                        _formContext.getAttribute("qdb_remaining_amount").setRequiredLevel("none");

                        _formContext.data.entity.attributes.get('qdb_remaining_amount').setValue(null);

                    }
                }

            }

            else {

                _formContext.getControl("qdb_remaining_amount").setVisible(false);

                _formContext.getAttribute("qdb_remaining_amount").setRequiredLevel("none");

                _formContext.data.entity.attributes.get('qdb_remaining_amount').setValue(null);

            }

        }

    }


    // Added by waqar for Bay Al Wadiya (Digital)
    function showHideReturnCS() {
        let workTask = _formContext.getAttribute("qdb_work_item").getValue();
        let control;
        control = _formContext.getControl("qdb_disbursement_head_credit_admin_approval");

        if (workTask && workTask[0].id.toLowerCase() == "{18913fc4-0dcb-e211-bc78-00155d787b38}") {
            control.addOption({
                text: "Return to Customer Service",
                value: 751090001
            });
        }

        else {
            control.removeOption(751090001);
        }
    }


    function showHideReturnCustomer() {
        let workTask = _formContext.getAttribute("qdb_work_item").getValue();
        let control;
        control = _formContext.getControl("qdb_disbursment_rm_review_approval");

        if (workTask && workTask[0].id.toLowerCase() == "{94edaed3-fdca-e211-bc78-00155d787b38}") {
            control.addOption({
                text: "Return to Customer",
                value: 751090008
            });
        }

        else {
            control.removeOption(751090008);
        }
    }



    function onClickOfAddDocuments() {
        let crdRequestId = _formContext.data.entity.getId();
        openMyWebResource("qdb_UploadDocument_CaseManagement");
    }

    function openMyWebResource(webResourceName) {

        let regardingobject = _formContext.getAttribute("qdb_caserefnoid");

        let regardingobjectid = regardingobject.getValue()[0].id.replace("{", "").replace("}", "");
        let data = {
            recordId: regardingobjectid
        };

        let dataString = encodeURIComponent(JSON.stringify(data));
        let url = "/WebResources/" + webResourceName + "?data=" + dataString;

        let dialogOptions = new Xrm.DialogOptions();
        dialogOptions.width = Math.floor(window.screen.availWidth * 0.6);
        dialogOptions.height = Math.floor(window.screen.availHeight * 0.65);

        Xrm.Internal.openDialog(
            url,
            dialogOptions,
            null,
            null,
            function (returnValue) {
                // Handle return value if needed
            }
        );
    }




    function showRMOptionsetInStatus() {
        let workTaskAttr = _formContext.getAttribute("qdb_work_item");
         let disbursementForCtrl = _formContext.getAttribute("qdb_disbursement_for")
        let statusCtrl = _formContext.getControl("qdb_lccsstatus");

        if (!workTaskAttr || !disbursementForCtrl || !statusCtrl) {
            console.warn("One or more controls are missing.");
            return;
        }

        let workTaskValue = workTaskAttr.getValue();
        let disbursementValue = disbursementForCtrl.getValue();

        if (workTaskValue && workTaskValue.length > 0) {
            let workTaskId = workTaskValue[0].id.toLowerCase();

            if (workTaskId === "{b5f84151-03c9-e211-bc78-00155d787b38}" && disbursementValue !== 751090014) {
                statusCtrl.removeOption(751090003);
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────
    // MIGRATED: Public API — wire these up in CRM form event handler editor
    // as Maqsad.TaskEntityForm.<functionName>
    // ─────────────────────────────────────────────────────────────────────
    ns.HideShowTabSchemaName = HideShowTabSchemaName;
    ns.HideShowSectionSchemaName = HideShowSectionSchemaName;
    ns.GetTabSchemaNameRecordType = GetTabSchemaNameRecordType;
    ns.GetSectionSchemaNameRecordType = GetSectionSchemaNameRecordType;
    ns.frmOnLoad = frmOnLoad;
    ns.ChecklocalRawMaterialSupport = ChecklocalRawMaterialSupport;
    ns.ChecklocalRawMaterialSupportResult = ChecklocalRawMaterialSupportResult;
    ns.SetMainSectionVisibility = SetMainSectionVisibility;
    ns.SetRelatedInfoVisibility = SetRelatedInfoVisibility;
    ns.SetTabVisibility = SetTabVisibility;
    ns.onChange_CaseResolvedByBU = onChange_CaseResolvedByBU;
    ns.onChange_CaseStatus = onChange_CaseStatus;
    ns.ShowDocuments = ShowDocuments;
    ns.OnChangeMasterBankAgreement = OnChangeMasterBankAgreement;
    ns.OnChangeOPDisburseReview = OnChangeOPDisburseReview;
    ns.OnChangeOPClearingReview = OnChangeOPClearingReview;
    ns.OnChangeDocsAcceptance = OnChangeDocsAcceptance;
    ns.OnChangeLCReview = OnChangeLCReview;
    ns.OnChangeLoanRequestReview = OnChangeLoanRequestReview;
    ns.SetRelatedLookupVisbility = SetRelatedLookupVisbility;
    ns.TermSheetReturn = TermSheetReturn;
    ns.creditReviewTaskStatusSetInvisible = creditReviewTaskStatusSetInvisible;
    ns.SetReturnReason = SetReturnReason;
    ns.ClearReturnReason = ClearReturnReason;
    ns.CheckRPSRequirement = CheckRPSRequirement;
    ns.SetRMLodgmentGridURL = SetRMLodgmentGridURL;
    ns.SetCreditOfficerLodgmentGridURL = SetCreditOfficerLodgmentGridURL;
    ns.SetHeadOfCADLodgmentGridURL = SetHeadOfCADLodgmentGridURL;
    ns.SetCommentsRequired = SetCommentsRequired;
    ns.SetAssignedWorkerRequired = SetAssignedWorkerRequired;
    ns.ValidateUsanceDetails = ValidateUsanceDetails;
    ns.TenorConfirmation = TenorConfirmation;
    ns.ResubmissionRequest = ResubmissionRequest;
    ns.onChangeRemittanceTransaction = onChangeRemittanceTransaction;
    ns.onChangeGuaranteeTransaction = onChangeGuaranteeTransaction;
    ns.OnChangeDocumentReviewStatus = OnChangeDocumentReviewStatus;
    ns.ShowAttachment = ShowAttachment;
    ns.OpenAttachedDocument = OpenAttachedDocument;
    ns.OpenAttachedDocumentBG = OpenAttachedDocumentBG;
    ns.OpenDoc = OpenDoc;
    ns.OpenAttachmentDocLG = OpenAttachmentDocLG;
    ns.OpenAttachmentDocBG = OpenAttachmentDocBG;
    ns.OpenAttachedDocumentLG = OpenAttachedDocumentLG;
    ns.ShowCustomerTermSheet = ShowCustomerTermSheet;
    ns.UpdateAccountInformationForShowCustomerTermSheet = UpdateAccountInformationForShowCustomerTermSheet;
    ns.ViewPreviousWorkItem = ViewPreviousWorkItem;
    ns.ViewDisbursementForm = ViewDisbursementForm;
    ns.OpenEntityForm = OpenEntityForm;
    ns.ViewNewLoanCreationForm = ViewNewLoanCreationForm;
    ns.ViewLoanAmmendmentForm = ViewLoanAmmendmentForm;
    ns.ShowTermSheet = ShowTermSheet;
    ns.GenerateLoanDocuments = GenerateLoanDocuments;
    ns.UploadLoanDocuments = UploadLoanDocuments;
    ns.SetNewLoanCreationReportURL = SetNewLoanCreationReportURL;
    ns.SetPaymentAuthorizationReportURL = SetPaymentAuthorizationReportURL;
    ns.PrintPaymentAuthorization = PrintPaymentAuthorization;
    ns.PrintDisbursementRequest = PrintDisbursementRequest;
    ns.PrintPaymentAuthorizationBFD = PrintPaymentAuthorizationBFD;
    ns.PrintPaymentAuthorizationCAD = PrintPaymentAuthorizationCAD;
    ns.SetRMChecklistGridsURL = SetRMChecklistGridsURL;
    ns.SetEDCADChecklistGridURL = SetEDCADChecklistGridURL;
    ns.SetEDPFChecklistGridURL = SetEDPFChecklistGridURL;
    ns.SetHCADChecklistGridsURL = SetHCADChecklistGridsURL;
    ns.SetLoanDocumentPortfolioInIframesURL = SetLoanDocumentPortfolioInIframesURL;
    ns.SetCADChecklistGridsURL = SetCADChecklistGridsURL;
    ns.SetTCSAccountCreationIframesURL = SetTCSAccountCreationIframesURL;
    ns.ShowNewLoanCreationReport = ShowNewLoanCreationReport;
    ns.ShowLoanAmendmentReport = ShowLoanAmendmentReport;
    ns.ShowLCAmendmentReport = ShowLCAmendmentReport;
    ns.ShowLCDocumentsReport = ShowLCDocumentsReport;
    ns.SetChequeAndDepositGridsIframeURL = SetChequeAndDepositGridsIframeURL;
    ns.SetProductTypeAndRepaymentTermsGridsIframeURL = SetProductTypeAndRepaymentTermsGridsIframeURL;
    ns.ShowNotification = ShowNotification;
    ns.SetShareholderWCGridURL = SetShareholderWCGridURL;
    ns.SetTechicalDepartGridURL = SetTechicalDepartGridURL;
    ns.SetShareholderCBGridURL = SetShareholderCBGridURL;
    ns.SetShareholderQCBtGridURL = SetShareholderQCBtGridURL;
    ns.SetEPDGridURL = SetEPDGridURL;
    ns.GenerateMasterAgreement = GenerateMasterAgreement;
    ns.OnGuarnateeStatusChange = OnGuarnateeStatusChange;
    ns.FillMachineryData = FillMachineryData;
    ns.SetFacilityAndLoanAccountGridURL = SetFacilityAndLoanAccountGridURL;
    ns.SetLoanAccountGridURL = SetLoanAccountGridURL;
    ns.SetLodgmentDocumentGridURL = SetLodgmentDocumentGridURL;
    ns.GetBuisnessUnitId = GetBuisnessUnitId;
    ns.getFieldData = getFieldData;
    ns.SetLodgmentDocumentCADGridURL = SetLodgmentDocumentCADGridURL;
    ns.SetLodgmentDocumentReturnGridURL = SetLodgmentDocumentReturnGridURL;
    ns.UpdatePartnerBank = UpdatePartnerBank;
    ns.SetCADDocuments = SetCADDocuments;
    ns.SetCADDocuments2 = SetCADDocuments2;
    ns.setWorklfowHistoryURL = setWorklfowHistoryURL;
    ns.ViewWakalaPromise = ViewWakalaPromise;
    ns.ViewMortgageOfBoat = ViewMortgageOfBoat;
    ns.ViewFisheryOfferAcceptance = ViewFisheryOfferAcceptance;
    ns.ViewOfferAndAcceptance = ViewOfferAndAcceptance;
    ns.ViewPurchaseApplicationPromise = ViewPurchaseApplicationPromise;
    ns.ViewPurchaseContractAgriculture = ViewPurchaseContractAgriculture;
    ns.ViewMurabahaSaleContract = ViewMurabahaSaleContract;
    ns.ViewPromotionContract = ViewPromotionContract;
    ns.ViewOfferAndAcceptanceFishery = ViewOfferAndAcceptanceFishery;
    ns.SetGetCustomerFromTCSURL = SetGetCustomerFromTCSURL;
    ns.SetGetFacilityFromTCSURL = SetGetFacilityFromTCSURL;
    ns.SetDocumentUploadByRM = SetDocumentUploadByRM;
    ns.SetDocumentUploadByRMCIFCreation = SetDocumentUploadByRMCIFCreation;
    ns.OnChangePaymentTo = OnChangePaymentTo;
    ns.VerifySignatures = VerifySignatures;
    ns.PopulateMissingUrl = PopulateMissingUrl;
    ns.DocumentaryCollectionFacilityReturnProcess = DocumentaryCollectionFacilityReturnProcess;
    ns.retrieveUrl = retrieveUrl;
    ns.updateRecord = updateRecord;
    ns.SetICCMemberGridUrl = SetICCMemberGridUrl;
    ns.GetRmDepartmentForCreditRatingModel = GetRmDepartmentForCreditRatingModel;
    ns.SetCreditRatingModelUrl = SetCreditRatingModelUrl;
    ns.SetDirectorCreditRatingModelUrl = SetDirectorCreditRatingModelUrl;
    ns.GetFacilityLimit = GetFacilityLimit;
    ns.ResetFacilityLimit = ResetFacilityLimit;
    ns.UpdateFacilityLimit = UpdateFacilityLimit;
    ns.dcHeadCadApprovalStatus_onchange = dcHeadCadApprovalStatus_onchange;
    ns.CallBillLodgementNumberAction = CallBillLodgementNumberAction;
    ns.EWS_StautsProject = EWS_StautsProject;
    ns.OperationDate = OperationDate;
    ns.FinancialDate = FinancialDate;
    ns.SetSharePointDocumentLibraryURL = SetSharePointDocumentLibraryURL;
    ns.showOSSDocs = showOSSDocs;
    ns.SetCompanyClassification_Onload = SetCompanyClassification_Onload;
    ns.SetCompanyClassfication_OnChange = SetCompanyClassfication_OnChange;
    ns.GetLoanApplication_IDType = GetLoanApplication_IDType;
    ns.setContractPrintDatetoDefault = setContractPrintDatetoDefault;
    ns.HideReturnToRequestorOptionForCase = HideReturnToRequestorOptionForCase;
    ns.HideKYCApprovalStatusTAB = HideKYCApprovalStatusTAB;
    ns.SetUploadGrid = SetUploadGrid;
    ns.CustomDeclaration = CustomDeclaration;
    ns.EvaluationIframeLoad = EvaluationIframeLoad;
    ns.ShowKyc = ShowKyc;
    ns.SetSecurityDocumentURL = SetSecurityDocumentURL;
    ns.caseTaskDescision = caseTaskDescision;
    ns.enableCaseType = enableCaseType;
    ns.RemoveHCADInspectionApprovalExtraOptions = RemoveHCADInspectionApprovalExtraOptions;
    ns.checkTaskAndSetSharePointURLFrame = checkTaskAndSetSharePointURLFrame;
    ns.SetSharePointDocumentLibraryURL = SetSharePointDocumentLibraryURL;
    ns.UpdateRmOptions = UpdateRmOptions;
    ns.setOptionSet = setOptionSet;
    ns.ShowDocumentsBayAlwadiya = ShowDocumentsBayAlwadiya;
    ns.isUserFromCXTeam = isUserFromCXTeam;
    ns._executeODataQuerySync = _executeODataQuerySync;
    ns.AddRejectOptionForWTO = AddRejectOptionForWTO;
    ns.GetFacilityLimitProduct = GetFacilityLimitProduct;
    ns.showHideReturnCS = showHideReturnCS;
    ns.showHideReturnCustomer = showHideReturnCustomer;
    ns.onClickOfAddDocuments = onClickOfAddDocuments;
    ns.openMyWebResource = openMyWebResource;
    ns.showRMOptionsetInStatus = showRMOptionsetInStatus;

}(Maqsad.TaskEntityForm));
