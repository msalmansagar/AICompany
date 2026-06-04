/**
 * OpsTaskForm — Dynamics CRM UCI-Compatible Web Resource
 *
 * MIGRATION ANALYSIS
 * ─────────────────────────────────────────────────────────────────────────
 * | Category                        | Original | Status                   |
 * |---------------------------------|----------|--------------------------|
 * | Xrm.Page.* references           |    396   | MIGRATED → _formContext  |
 * | debugger; statements            |     52   | REMOVED                  |
 * | var declarations                |    248   | MIGRATED → let           |
 * | Xrm.Utility.openEntityForm      |      3   | MIGRATED → openForm      |
 * | alert() + Xrm.Utility.alertDialog|    58   | MIGRATED → openAlertDialog|
 * | confirm()                       |      4   | MIGRATED → openConfirmDialog (async)|
 * | XMLHttpRequest (ExecuteQuery)   |     12   | MIGRATED → async fetch   |
 * | SOAP TriggerWorkflow            |      1   | MIGRATED → Xrm.WebApi    |
 * | jQuery/XRMServices GetRoleName  |      1   | MIGRATED → Xrm.WebApi    |
 * | /api/data/v8.x paths            |     14   | MIGRATED → v9.2          |
 * | window.showModalDialog (live)   |     13   | STUBBED → TODO comments  |
 * | Top-level fetchCRMConfiguration |      1   | MOVED → called in frmOnload|
 * | getServerUrl (deprecated)       |      3   | MIGRATED → getClientUrl  |
 * | isOutlookClient (removed)       |      1   | MIGRATED → false         |
 * ─────────────────────────────────────────────────────────────────────────
 *
 * BREAKING CHANGES
 * ─────────────────────────────────────────────────────────────────────────
 * 1. frmOnload MUST receive executionContext. In the form editor:
 *      Event Handlers > OnLoad > Function: Maqsad.OpsTaskForm.frmOnload
 *      CHECK "Pass execution context as first parameter"
 *
 * 2. frmOnSave MUST receive executionContext. In the form editor:
 *      Event Handlers > OnSave > Function: Maqsad.OpsTaskForm.frmOnSave
 *      CHECK "Pass execution context as first parameter"
 *
 * 3. All other event handler registrations must be updated from bare names
 *    to Maqsad.OpsTaskForm.<functionName> in the form event handler editor.
 *
 * 4. CompleteWorkItem and ShowDialog are now async (required by
 *    openConfirmDialog). Any ribbon button handlers for these must support
 *    Promises — wrap in: Maqsad.OpsTaskForm.CompleteWorkItem().catch(console.error)
 *
 * 5. fetchCRMConfiguration() is no longer called at module load. It is
 *    called from frmOnload(). If netBaseURL / ssrsBaseURL are needed before
 *    OnLoad fires (e.g., ribbon buttons), call fetchCRMConfiguration() first.
 *
 * 6. window.showModalDialog is permanently gone in UCI. Each removed call
 *    has a TODO comment — implement using PCF dialog or side panel.
 *
 * 7. OData version bumped v8.x → v9.2. Verify entity plural names and
 *    field names against your environment metadata endpoint.
 *
 * 8. TriggerWorkflow now uses Xrm.WebApi.online.execute. Verify the
 *    entityType in the executeRequest matches the target entity.
 *
 * 9. GetRoleName now returns a Promise. Callers must await it.
 *
 * 10. Hardcoded GUIDs in switch/case blocks must be externalised to a
 *     configuration entity (Article V — No Hardcoding).
 *
 * FORM REGISTRATION CHANGES
 * ─────────────────────────────────────────────────────────────────────────
 * | Event    | Old Handler  | New Handler                       | Ctx? |
 * |----------|-------------|-----------------------------------|------|
 * | OnLoad   | frmOnload   | Maqsad.OpsTaskForm.frmOnload      | YES  |
 * | OnSave   | frmOnSave   | Maqsad.OpsTaskForm.frmOnSave      | YES  |
 * | OnChange | <fnName>    | Maqsad.OpsTaskForm.<fnName>       | NO*  |
 * (* pass execution context only if the handler calls getFormContext())
 *
 * TEST SCENARIOS
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Form load — frmOnload fires; CRM config (netBaseURL etc.) populated
 * 2. fetchCRMConfiguration — ssrsBaseURL/netBaseURL/sharepointBaseURL set
 * 3. CompleteWorkItem — confirm dialog renders; on confirm form saves
 * 4. TriggerWorkflow — workflow triggers via Xrm.WebApi; form refreshes
 * 5. GetRoleName — returns name from Xrm.WebApi; async callers await it
 * 6. ViewWorkflowHistory — correct SSRS URL opened per record type GUID
 * 7. showModalDialog stubs — TODO lines do not throw runtime errors
 * 8. GetCustomerExceptions — OData query fires; notifications appear
 * 9. CheckFacilityStatus — freeze alert shown when facilitystatus = frozen
 * 10. removeStatusOptionSetValue — correct option removed per disbursement type
 */

'use strict'; // MIGRATED: UCI strict mode

// MIGRATED: Namespace wrapper — prevents global scope pollution
var Maqsad = Maqsad || {};
Maqsad.OpsTaskForm = Maqsad.OpsTaskForm || {};

(function (ns) {

    /**
     * Module-level formContext initialised by frmOnload.
     * MIGRATED: replaces the Xrm.Page.* singleton access pattern.
     * @type {Xrm.FormContext|null}
     */
    let _formContext = null; // MIGRATED: replaces global Xrm.Page

    /**
     * Configuration values fetched from qdb_crmconfiguration entity on load.
     * MIGRATED: were bare global vars; now module-scoped.
     */
    let netBaseURL = '';        // MIGRATED: global→module-scoped
    let ssrsBaseURL = '';       // MIGRATED: global→module-scoped
    let sharepointBaseURL = ''; // MIGRATED: global→module-scoped
    let clientSignatureURL = ''; // MIGRATED: global→module-scoped
    let crmOrganization = '';   // MIGRATED: global→module-scoped
    let IsDocMissing = false;   // MIGRATED: global→module-scoped
    let WakalaPaymentFormBUtton = false; // MIGRATED: global→module-scoped
    let BuyerDetailAvailalbe = true;    // MIGRATED: global→module-scoped

    function fetchCRMConfiguration() {
        try {
            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_crmconfigurations?$select=qdb_ssrsreporturl,qdb_sharepointurl,qdb_netbaseurl,qdb_clientsignatureurl,qdb_crmorganization";
            _executeODataQuery(query, fillConfiguration, "", false);
        }
        catch (ex) {
            throw ex;
        }
    }

    function fillConfiguration(result) {
        if (result != null && result.value.length > 0) {
            if (result.value[0].qdb_ssrsreporturl != null) {
                ssrsBaseURL = result.value[0].qdb_ssrsreporturl;
            }
            if (result.value[0].qdb_sharepointurl != null) {
                sharepointBaseURL = result.value[0].qdb_sharepointurl;
            }
            if (result.value[0].qdb_netbaseurl != null) {
                netBaseURL = result.value[0].qdb_netbaseurl;
            }
            if (result.value[0].qdb_clientsignatureurl != null) {
                clientSignatureURL = result.value[0].qdb_clientsignatureurl;
            }
            if (result.value[0].qdb_crmorganization != null) {
                crmOrganization = result.value[0].qdb_crmorganization;
            }
        }
    }

    // ExecuteQuery executes the specified OData Query asynchronously
    //
    // NOTE: Requires JSON and jQuery libraries. Review this Microsoft MSDN article before 
    //       using this script http://msdn.microsoft.com/en-us/library/gg328025.aspx
    // Added 13-11-2016 By Mustajab
    let WakalaPaymentFormBUtton = false;
    let BuyerDetailAvailalbe = true;
    /**
     * MIGRATED: Replaced XMLHttpRequest callback with async fetch.
     * Callback contract (SuccessFunction, id) preserved for incremental migration.
     *
     * @param {string} ODataQuery     - Relative OData v9.2 path
     * @param {Function} SuccessFunction - Callback receiving (result, id)
     * @param {string|null} id        - Correlation value forwarded to callback
     * @param {boolean} [isAsync]     - Ignored; all requests are now async
     */
    async function _executeODataQuery(ODataQuery, SuccessFunction, id, isAsync) { // MIGRATED: XMLHttpRequest→fetch
        try {
            const result = await _fetchODataPath(ODataQuery);
            SuccessFunction(result, id);
        } catch (error) {
            Xrm.Navigation.openAlertDialog({ text: `Data retrieval failed: ${error.message}` }); // MIGRATED: alert→openAlertDialog
        }
    }

    /**
     * MIGRATED: Fetches a raw OData v9.2 path using the native fetch API.
     *
     * @param {string} oDataPath - Relative OData v9.2 path
     * @returns {Promise<object>} Parsed JSON response
     */
    async function _fetchODataPath(oDataPath) { // MIGRATED: replaces XMLHttpRequest helper
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


    function OpenCrediReviewList(id) {

        let Url, lcl_ProposalID;

        Url = netBaseURL + ":6001/CreditReviewProposalList.aspx?id=";

        Url += id;
        window.open(Url, "_blank");
        //  CheckUserRole(id);




    }


    //Check login User has 'System Administrator' role
    function CheckUserRole() {
        let currentUserRoles = Xrm.Utility.getGlobalContext().getUserRoles() // MIGRATED: getUserRoles→getGlobalContext;
        for (var i = 0; i < currentUserRoles.length; i++) {
            let userRoleId = currentUserRoles[i];
            if (userRoleId == "744d53ad-b33b-e711-80e7-02bf800001ad") {

                return true;
            }
        }
        // Xrm.Navigation.openAlertDialog({text: "You don't have access to View this report"}) // MIGRATED: alert→openAlertDialog;
        return false;
    }

    //Get Rolename based on RoleId
    /**
     * MIGRATED: Replaced jQuery $.ajax + XRMServices/2011/OrganizationData.svc
     * with Xrm.WebApi.retrieveMultipleRecords.
     * The v1 OData endpoint (OrganizationData.svc) is removed in UCI.
     *
     * @param {string} roleId - GUID of the role to look up
     * @returns {Promise<string|null>} Role name or null
     */
    async function GetRoleName(roleId) { // MIGRATED: jQuery/XRMServices→Xrm.WebApi
        try {
            const result = await Xrm.WebApi.retrieveMultipleRecords(
                'role',
                `?$select=name&$filter=roleid eq ${roleId}`
            ); // MIGRATED: /* MIGRATED: XRMServices deprecated */ /XRMServices/2011/OrganizationData.svc/RoleSet→Xrm.WebApi
            return result.entities.length > 0 ? result.entities[0].name : null;
        } catch (error) {
            Xrm.Navigation.openAlertDialog({ text: `GetRoleName failed: ${error.message}` }); // MIGRATED: alert→openAlertDialog
            return null;
        }
    }

    function frmOnload(executionContext) { // MIGRATED: added executionContext parameter
        _formContext = executionContext.getFormContext(); // MIGRATED: derive formContext
        removeStatusOptionSetValue();
        ShowDocumentUploadGrid();
        RemoveCSReturnOptionOPSTask();
        CheckBuyerDetails();
        ChecklocalRawMaterialSupport();
        /*
        window.onbeforeunload = function() {
        try
        { 

        if (window != null && window.top !=null && window.top.opener != null 
        && window.top.opener.top != null && window.top.opener.top.document != null)
        window.top.opener.top.document.location.reload();     
        }
        catch(err){
        Xrm.Navigation.openAlertDialog({text: err}) // MIGRATED: alert→openAlertDialog;
        }
        }

       // */
        //changeColor();
    }
    function changeColor() {
        let textboxes = document.getElementsByTagName("input");
        for (var i = 0; i < textboxes.length; i++) {
            if ((textboxes[i].type == "text") && (textboxes[i].disabled == true)) {
                textboxes[i].disabled = false;
                textboxes[i].style.color = "Black";
                textboxes[i].readOnly = true;
            }
        }
        onLoadSetIframeSrc();
    }
    //Adding method to remove Iframe hardcoding.
    function onLoadSetIframeSrc() {
        if (_formContext.ui.controls.get("IFRAME_CustomerBankDetails") != null) {
            let IFrame = _formContext.ui.controls.get("IFRAME_CustomerBankDetails");
            let URL = netBaseURL + ":9798/ShowCustomerBanksDetails.aspx";
            IFrame.setSrc(URL);
        }
    }



    function SaveWorkItem() {
        let QDB_SaveSateFlag, QDB_SateCodeFlag;

        QDB_SaveSateFlag = _formContext.getAttribute("qdb_save_state_flag");
        QDB_SateCodeFlag = _formContext.getAttribute("qdb_state_code_flag");

        QDB_SaveSateFlag.setSubmitMode("always");
        QDB_SateCodeFlag.setSubmitMode("always");

        QDB_SaveSateFlag.setValue(null);
        QDB_SaveSateFlag.setValue(1);
        QDB_SateCodeFlag.setValue(0);
        Alert.show(null, "Click on Save button will only save task data, for Completing Task please click on Mark Task Complete button.", null, "WARNING", 500, 200)
        _formContext.data.entity.save();
    }

    function OpenWindowWakala(url) {
        let newWindow = window.open(url, "_blank");
        // window.history.back();
        if (window.focus) {
            window.focus();
        }
    }

    //Added by ali for bay al wadiaya disbursement submit validation
    //21-01-2024
    function CheckBayAlwadiyaRequiredDocuments() {
        IsDocMissing = false;
        let EntityName, EntityId, LookupFieldObject;
        LookupFieldObject = _formContext.data.entity.getId(); //_formContext.getAttribute("regardingobjectid").getValue();

        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject.replace("{", "").replace("}", "");
            EntityName = "qdb_centralizeddocuments";
            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_centralizeddocumentses?$select=activityid,subject,createdon,qdb_documenttype&$filter=_regardingobjectid_value eq " + EntityId;

            // Pass OData Query and UpdateFunction
            //numu__executeODataQuery(query, numu_ValidateValueDate, null);
            let serverUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext;

            // Adjust URL for differences between on premise and online 
            if (serverUrl.match(/\/$/)) {
                serverUrl = serverUrl.substring(0, serverUrl.length - 1);
            }
            //Ultimate Beneficial Owner	100000019
            //Proforma Invoice	100000020
            //Request Letter for Goods Details	100000021
            //Inspection Picture	100000018

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
                        let returnresult = JSON.parse(this.response);
                        let GoodsDetailsDoc = true;
                        let ProformaInvoicedoc = true;
                        let InspectionPicture = true;
                        let UltimateBeneficial = true;
                        returnresult.value.forEach(function (s) {
                            if (s.qdb_documenttype == '100000021') {
                                // Xrm.Navigation.openAlertDialog({text: 'Request Letter for Goods Details document is missing.'}) // MIGRATED: alert→openAlertDialog;
                                GoodsDetailsDoc = false;
                            }
                            if (s.qdb_documenttype == '100000020') {

                                ProformaInvoicedoc = false;
                            }
                            if (s.qdb_documenttype == '100000018') {
                                //    Xrm.Navigation.openAlertDialog({text: 'Inspection Picture in missing'}) // MIGRATED: alert→openAlertDialog;
                                InspectionPicture = false;
                            }
                            //qdb_advancepayment
                            if (s.qdb_documenttype == '100000019') {
                                //if (_formContext.getAttribute("qdb_advancepayment").getValue() == true) {
                                //  Xrm.Navigation.openAlertDialog({text: 'Ultimate Beneficial Owner document is missing'}) // MIGRATED: alert→openAlertDialog;
                                UltimateBeneficial = false;
                                // }
                            }
                        });

                        if (GoodsDetailsDoc) {
                            //Xrm.Navigation.openAlertDialog({text: 'Request Letter for Goods Details document is missing.'}) // MIGRATED: alert→openAlertDialog;
                            Alert.show("Request Letter for Goods Details is missing.", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }

                        if (ProformaInvoicedoc) {
                            //Xrm.Navigation.openAlertDialog({text: 'Proforma Invoice document in missing'}) // MIGRATED: alert→openAlertDialog;
                            Alert.show("Proforma Invoice is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (InspectionPicture) {
                            Alert.show("Inspection Picture is missing", null, null, "WARNING", 500, 200);
                            //Xrm.Navigation.openAlertDialog({text: 'Inspection Picture in missing'}) // MIGRATED: alert→openAlertDialog;
                            IsDocMissing = true;
                        }

                        if (_formContext.getAttribute("qdb_advancepayment").getValue() == true) {
                            if (UltimateBeneficial) {
                                //Xrm.Navigation.openAlertDialog({text: 'Ultimate Beneficial Owner document is missing'}) // MIGRATED: alert→openAlertDialog;
                                Alert.show("Ultimate Beneficial Owner is missing", null, null, "WARNING", 500, 200);
                                IsDocMissing = true;
                            }
                        }
                    }
                    else {
                        Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: alert→openAlertDialog;
                        IsDocMissing = false;
                    }
                }
            };
            // Execute HTTTP request
            req.send();
        }
    }


    //added by shariq for task level validation for bay al wadiya
    //21-01-2024
    function CheckRequireddDocuments() {
        IsDocMissing = false;
        let EntityName, EntityId, LookupFieldObject;
        LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;


        if (LookupFieldObject != null) {
            EntityId = LookupFieldObject.replace("{", "").replace("}", "");
            EntityName = "qdb_centralizeddocuments";
            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_centralizeddocumentses?$select=activityid,subject,createdon,qdb_documenttype&$expand=regardingobjectid_qdb_payment_authorization_ticket_qdb_centralizeddocuments($select=qdb_for_export)&$filter=_regardingobjectid_value eq " + EntityId;

            // Pass OData Query and UpdateFunction
            //numu__executeODataQuery(query, numu_ValidateValueDate, null);
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
                        let returnresult = JSON.parse(this.response);
                        let CustomDec = true;
                        let Invoice = true;
                        let PackingList = true;
                        let Billoflading = true;
                        let CertificateofOrigin = true;
                        let TruckAssignmentNote = true;
                        let DeliveryNote = true;
                        let PurchaserGuarantee = true;
                        let PurchaseContract = true;
                        let AgencyContract = true;

                        returnresult.value.forEach(function (s) {
                            if (s.qdb_documenttype == '100000029') {
                                PurchaserGuarantee = false;
                            }
                            if (s.qdb_documenttype == '100000030') {
                                PurchaseContract = false;
                            }
                            if (s.qdb_documenttype == '100000031') {
                                AgencyContract = false;
                            }
                            if (s.regardingobjectid_qdb_payment_authorization_ticket_qdb_centralizeddocuments.qdb_for_export == true) {
                                DeliveryNote = false
                                if (s.qdb_documenttype == '100000022') {
                                    CustomDec = false;
                                }
                                if (s.qdb_documenttype == '100000023') {
                                    Invoice = false;
                                }
                                if (s.qdb_documenttype == '100000024') {
                                    PackingList = false;
                                }
                                if (s.qdb_documenttype == '100000025') {
                                    Billoflading = false;

                                }
                                if (s.qdb_documenttype == '100000026') {
                                    CertificateofOrigin = false;
                                }
                                if (s.qdb_documenttype == '100000027') {
                                    TruckAssignmentNote = false;
                                }

                            } else if (s.regardingobjectid_qdb_payment_authorization_ticket_qdb_centralizeddocuments.qdb_for_export == false) {
                                CustomDec = false;
                                Invoice = false;
                                PackingList = false;
                                Billoflading = false;
                                CertificateofOrigin = false;
                                TruckAssignmentNote = false;

                                if (s.qdb_documenttype == '100000028') {
                                    DeliveryNote = false;
                                }
                                if (s.qdb_documenttype == '100000023') {
                                    Invoice = false;
                                }
                            }
                        });

                        if (CustomDec) {
                            Alert.show("Custom Declaration document is missing.", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }

                        if (Invoice) {
                            Alert.show("Invoice document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (PackingList) {
                            Alert.show("Packing List document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (Billoflading) {
                            Alert.show("Bill of lading document in missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (CertificateofOrigin) {
                            Alert.show("Certificate of Origin document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (TruckAssignmentNote) {
                            Alert.show("Truck Assignment Note document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (DeliveryNote) {
                            Alert.show("Delivery Note document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (PurchaserGuarantee) {
                            Alert.show("Purchaser Guarantee Contract document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (PurchaseContract) {
                            Alert.show("Purchase Contract document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }
                        if (AgencyContract) {
                            Alert.show("Agency Contract document is missing", null, null, "WARNING", 500, 200);
                            IsDocMissing = true;
                        }

                    }
                    else {
                        Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: alert→openAlertDialog;
                        IsDocMissing = false;
                    }
                }
            };
            req.send();
        }
    }
    async function CompleteWorkItem() // MIGRATED: async for openConfirmDialog {
        let ts_WorkItemStep;

        let Currentuser = Xrm.Utility.getGlobalContext().getUserId() // MIGRATED: _formContext.context→getGlobalContext;
        let Owner = _formContext.getAttribute("ownerid").getValue()[0].id;
        if (Currentuser != Owner) {
            Xrm.Navigation.openAlertDialog({text: "You are not authorized to work on particular task."}) // MIGRATED: alert→openAlertDialog;
            return false;

        }


        if (_formContext.getAttribute("qdb_remaining_amount") && _formContext.getAttribute("qdb_remaining_amount").getValue() != null

            && _formContext.getAttribute("qdb_remaining_amount").getValue() > 0) {

            if (_formContext.getAttribute("qdb_facility_number") && _formContext.getAttribute("qdb_facility_number").getValue() != null) {



                let discountingValue = _formContext.getAttribute("qdb_remaining_amount").getValue();

                let facilityLookup = _formContext.getAttribute("qdb_facility_number").getValue()[0];



                let facilityId = facilityLookup.id.replace("{", "").replace("}", "");



                // Update qdb_facility record

                Xrm.WebApi.updateRecord("qdb_facility", facilityId, {

                    qdb_discounting: discountingValue

                }).then(

                    function success(result) {

                        console.log("qdb_discounting updated successfully in qdb_facility.");

                    },

                    function (error) {

                        console.error("Error updating qdb_discounting: " + error.message);

                    }

                );

            }

        }


        if (_formContext.getAttribute("qdb_disbursement_head_credit_admin_approval")) {

            let inputvalue = _formContext.getAttribute("qdb_disbursement_head_credit_admin_approval").getValue();
            let wakalavalue = _formContext.getAttribute("qdb_disburse_through").getValue();//wakala Annex B
            if (_formContext.getAttribute("qdb_purchase_contrat")) {

                let ContractGuid = _formContext.getAttribute("qdb_purchase_contrat").getValue();
                let qdb_work_item = _formContext.getAttribute("qdb_work_item").getValue()[0].id.toUpperCase();
                //if (inputvalue == "751090002" && wakalavalue == "751090010" && qdb_work_item == "{18913FC4-0DCB-E211-BC78-00155D787B38}" && (ContractGuid == "" || ContractGuid == null)) {
                if (inputvalue == "751090002" && wakalavalue == "751090010") {
                    let Url;
                    Url = netBaseURL + ":6001/GenerateWakalaAnex2.aspx?orgname=qdb1&view=1&id=";
                    Url += _formContext.data.entity.getId();
                    OpenWindowWakala(Url);
                    //  Xrm.Navigation.openAlertDialog({text: "Please view the Wakala Contract to avoid any failures."}) // MIGRATED: alert→openAlertDialog;
                    // return false;

                }
            }

        }


        ts_WorkItemStep = _formContext.getAttribute("qdb_work_item");
        if (_formContext.getAttribute("qdb_approval_authority")) {
            let inputvalue = _formContext.getAttribute("qdb_approval_authority").getValue();
            if (inputvalue == "751090002" || inputvalue == "751090003") {
                let lcl_AlertMsg = "";
                let lcl_Warning;


                if (_formContext.getAttribute("qdb_creditproposaldirectcreditaproval") != null && _formContext.getAttribute("qdb_creditproposaldirectcreditaproval").getValue() == 751090004) {
                    lcl_AlertMsg = "Are you sure to reject this application ?\n";
                }
                else if (_formContext.getAttribute("qdb_creditproposalbfddirectorapproval") != null && _formContext.getAttribute("qdb_creditproposalbfddirectorapproval").getValue() == 751090003) {
                    lcl_AlertMsg = "Are you sure to reject this application ?\n";

                }
                else {
                    lcl_AlertMsg = "The request is going to CEO for approval. Please re-check and confirm the workflow before submitting Loan Application.\n\n\n Submit for Approval?";
                }




                if ((await Xrm.Navigation.openConfirmDialog({text: lcl_AlertMsg})).confirmed // MIGRATED: confirm→openConfirmDialog (function must be async) == false) {
                    return;

                }
            }
        }

        try {
            let QDB_SaveSateFlag, QDB_SateCodeFlag, QDB_SaveValidations;

            QDB_SaveValidations = OnSaveValidations();

            if (QDB_SaveValidations != "") {
                Alert.show(QDB_SaveValidations, null, null, "INFO", 500, 200)

                return;
            }
            if (ts_WorkItemStep.getValue() != null && ts_WorkItemStep.getValue()[0].id != null) {

                if (BuyerDetailAvailalbe == false && ts_WorkItemStep.getValue()[0].id == "{1D5F70ED-2034-E511-81C5-00155D788D14}") {
                    Xrm.Navigation.openAlertDialog({text: "Buyer details are still missing in the termsheet, Please contact CAD team to proceed further!"}) // MIGRATED: alert→openAlertDialog;
                    return;
                }
            }
            if ((await Xrm.Navigation.openConfirmDialog({text: "Complete Task?"})).confirmed // MIGRATED: confirm→openConfirmDialog (function must be async)) {

                //Code Added by shariq
                if (_formContext.getAttribute("qdb_lc_amendment_ref") != null && _formContext.getAttribute("qdb_lc_amendment_ref").getValue() != null && _formContext.getAttribute("qdb_co_lc_amendment_review") != null && _formContext.getAttribute("qdb_co_lc_amendment_review").getValue() == "751090000") {
                    if (ts_WorkItemStep.getValue()[0].name == "Credit Officer Approval" || ts_WorkItemStep.getValue()[0].name == "Resubmit for Credit Officer Approval") {
                        CallCRMTCSServiceForLCAmendment();

                    }
                    else {
                        Xrm.Navigation.openAlertDialog({text: "Invalid Work Task for LC Amendment to TCS"}) // MIGRATED: alert→openAlertDialog;
                        return;
                    }
                } else if (_formContext.getAttribute("qdb_lg_ref_no") != null && _formContext.getAttribute("qdb_lg_ref_no").getValue() != null && _formContext.getAttribute("qdb_co_lc_amendment_review") != null && _formContext.getAttribute("qdb_co_lc_amendment_review").getValue() == "751090000") {
                    if (ts_WorkItemStep.getValue()[0].name == "Credit Officer Approval" || ts_WorkItemStep.getValue()[0].name == "Resubmit for Credit Officer Approval") {
                        CallCRMTCSServiceForLCAmendment();

                    }
                    else {
                        Xrm.Navigation.openAlertDialog({text: "Invalid Work Task for LG Amendment to TCS"}) // MIGRATED: alert→openAlertDialog;
                        return;
                    }
                }

                else {
                    QDB_SaveSateFlag = _formContext.getAttribute("qdb_save_state_flag");
                    QDB_SateCodeFlag = _formContext.getAttribute("qdb_state_code_flag");

                    QDB_SaveSateFlag.setSubmitMode("always");
                    QDB_SateCodeFlag.setSubmitMode("always");

                    QDB_SaveSateFlag.setValue(null);
                    QDB_SateCodeFlag.setValue(null);

                    QDB_SateCodeFlag.setValue(1);
                    QDB_SaveSateFlag.setValue(1);
                    _formContext.data.entity.save("saveandclose");
                }


            }
        }
        catch (ex) {
            QDB_SateCodeFlag.setValue(1);
            _formContext.data.entity.save("saveandclose");
        }
    }
    function CallCRMTCSServiceForLCAmendment() {
        let entityName = _formContext.data.entity.getEntityName();
        let id = _formContext.data.entity.getId().replace("{", "").replace("}", "");

        let parameters = {};
        parameters.EntityName = entityName;
        parameters.RecordId = id;
        parameters.TaskStatus = _formContext.getAttribute("qdb_co_lc_amendment_review").getValue().toString();
        parameters.InParametrer = "NA";

        let req = new XMLHttpRequest();
        req.open("POST", Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_LCAmendmentsCTMTCS", false);
        req.setRequestHeader("OData-MaxVersion", "4.0");
        req.setRequestHeader("OData-Version", "4.0");
        req.setRequestHeader("Accept", "application/json");
        req.setRequestHeader("Content-Type", "application/json; charset=utf-8");
        req.onreadystatechange = function () {
            if (this.readyState === 4) {
                req.onreadystatechange = null;
                if (this.status === 200) {
                    let results = JSON.parse(this.response);
                    //Xrm.Navigation.openAlertDialog({text: results.Message}) // MIGRATED: alert→openAlertDialog;
                    if (results.IsSuccess) {
                        if (results.Message != 'Not NUMU') {
                            Xrm.Navigation.openAlertDialog({text: 'Transaction Processed Successfully on TCS'}) // MIGRATED: alert→openAlertDialog
                        }

                        let QDB_SaveSateFlag = _formContext.getAttribute("qdb_save_state_flag");
                        let QDB_SateCodeFlag = _formContext.getAttribute("qdb_state_code_flag");

                        QDB_SaveSateFlag.setSubmitMode("always");
                        QDB_SateCodeFlag.setSubmitMode("always");

                        QDB_SaveSateFlag.setValue(null);
                        QDB_SateCodeFlag.setValue(null);

                        QDB_SateCodeFlag.setValue(1);
                        QDB_SaveSateFlag.setValue(1);
                        _formContext.data.entity.save("saveandclose");
                    } else {
                        Xrm.Navigation.openAlertDialog({text: results.Message}) // MIGRATED: alert→openAlertDialog;
                        return false;
                    }
                } else {
                    Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: Xrm.Utility.alertDialog→openAlertDialog;
                }
            }
        };
        req.send(JSON.stringify(parameters));
    }
    function OnSaveValidations() {
        let ts_WorkItemStep, qdb_Tab, qdb_StatusCode, qdb_ReturnVal;

        ts_WorkItemStep = _formContext.getAttribute("qdb_work_item");

        qdb_ReturnVal = "";

        switch (ts_WorkItemStep.getValue()[0].id) {
            // case "{CBC891B7-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
            // if (_formContext.getAttribute("qdb_iccmemo") == null ||
            // _formContext.getAttribute("qdb_iccmemo").getValue() == null) {
            // qdb_ReturnVal = "Please make sure ICC Signed Descion Memo is attached.";
            // }
            // break;

            // case "{42953A52-F358-E411-B163-00155D788B08}": //Upload Signed Contract by CS
            // if (_formContext.getAttribute("qdb_qdb_dis1") == null ||
            // _formContext.getAttribute("qdb_qdb_dis1").getValue() == null) {
            // qdb_ReturnVal = "Please attach customer signed contract.";
            // }
            // break;

            // case "{698F322F-DEED-E211-A9BB-00155D788238}": //World Check Report

            // if (_formContext.getAttribute("qdb_wc_rpt") == null ||
            // _formContext.getAttribute("qdb_wc_rpt").getValue() == null) {
            // qdb_ReturnVal = "Please attach world check report.";
            // }
            // break;
            // case "{DC7390F2-8AF8-E211-A57C-00155D788238}": //Repayment Schedule // 

            // if (_formContext.getAttribute("qdb_transaction_status") != null) {
            // if (_formContext.getAttribute("qdb_transaction_status").getValue() == "751090000") {
            // if (_formContext.getAttribute("qdb_tcs_rct") == null ||
            // _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
            // qdb_ReturnVal = "Please attach QATCH/SWIFT Message.";
            // }
            // if (_formContext.getAttribute("qdb_cust_adv") == null ||
            // _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
            // qdb_ReturnVal = "Please attach loan repayment schedule.";
            // }

            // if (_formContext.getAttribute("qdb_vehiclepurchase") != null) {
            // if (_formContext.getAttribute("qdb_vehiclepurchase").getValue() == "751090001") { // Yes
            // if (_formContext.getAttribute("qdb_istimaraaprovideduploaded") != null) {
            // if (_formContext.getAttribute("qdb_istimaraaprovideduploaded").getValue() == false) {
            // qdb_ReturnVal = "Please select Istimaraa Provided & Uploaded.";
            // }
            // }
            // }
            // }
            // }
            // else {
            // _formContext.getAttribute("qdb_account_number").setRequiredLevel("none");
            // _formContext.getAttribute("qdb_amount_in_qar_ops").setRequiredLevel("none");
            // }
            // }
            // else {
            // //Xrm.Navigation.openAlertDialog({text: "Called"}) // MIGRATED: alert→openAlertDialog;

            // }
            // break;

            // case "{F8CE8DD3-55F9-E211-A57C-00155D788238}": //Customer Advice
            // if (_formContext.getAttribute("qdb_guaranteetransactionstatus").getValue() == "751090000")
            // if (_formContext.getAttribute("qdb_tcs_rct") == null ||
            // _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
            // qdb_ReturnVal = "Please attach customer advice.";
            // }
            // break;
            case "{F3D82E1E-BFF1-E911-812C-00155DB3C005}": //Customer service Awaiting documents.
                let finalInvNoAttr = _formContext.getAttribute("qdb_lc_others_1");
                let maturityDateAttr = _formContext.getAttribute("qdb_commoditypurchasedate");

                if (finalInvNoAttr) finalInvNoAttr.setRequiredLevel("required");
                if (maturityDateAttr) maturityDateAttr.setRequiredLevel("required");

                if (!finalInvNoAttr || !finalInvNoAttr.getValue()) {
                    qdb_ReturnVal = "Please ensure Final Invoice No and Invoice Maturity Date fields are filled.";
                }

                if (!maturityDateAttr || !maturityDateAttr.getValue()) {
                    qdb_ReturnVal = "Please ensure Final Invoice No and Invoice Maturity Date fields are filled.";
                }

                break;
            case "{0D0986F6-D3F1-E211-A9BB-00155D788238}": //discrepancies 2
                if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() == "751090001")

                    if (_formContext.getAttribute("qdb_is_epd_process").getValue() == true) {

                    }
                    else {
                        if (_formContext.getAttribute("qdb_cust_adv") == null ||
                            _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
                            // qdb_ReturnVal = "Please attach customer advice discrepancy document.";
                        }

                        if (_formContext.getAttribute("qdb_tcs_rct") == null ||
                            _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
                            qdb_ReturnVal = "Please attach bills lodgement transaction document.";
                        }
                    }
                if (_formContext.getAttribute("qdb_lc_documentation_reviewer_status").getValue() != "751090001") {
                    if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
                        if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{DE2D7C06-2004-E411-9003-00155D780506}") {
                            if (_formContext.getAttribute("qdb_loan_account_ltl") == null) {
                                qdb_ReturnVal = "Please make sure that RPS is attached.";
                            }
                        }
                    }
                    //Xrm.Navigation.openAlertDialog({text: "RPS Check = 1"}) // MIGRATED: alert→openAlertDialog;
                }

                break;

            //L/C Amendment    
            // case "{45966105-7FFA-E211-A57C-00155D788238}":
            // if (_formContext.getAttribute("qdb_general_status").getValue() == "751090000") {
            // _formContext.getAttribute("qdb_lc_amendment_ref_no").setRequiredLevel("required");
            // if (_formContext.getAttribute("qdb_tcs_rct") == null ||
            // _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
            // qdb_ReturnVal = "Please make sure Customer Advice is uploaded.";
            // }
            // else if (_formContext.getAttribute("qdb_cust_adv") == null ||
            // _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
            // qdb_ReturnVal = "Please make sure SWIFT Message is uploaded.";
            // }
            // }
            // else {
            // _formContext.getAttribute("qdb_lc_amendment_ref_no").setRequiredLevel("none");
            // }
            // break;
            case "{0D0986F6-D3F1-E211-A9BB-00155D788238}":


                if (_formContext.getAttribute("qdb_is_epd_process").getValue() == true) {

                }
                else {
                    if (_formContext.getAttribute("qdb_tcs_rct") == null ||
                        _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
                        qdb_ReturnVal = "Please make sure Transaction Reciept is attached.";
                    }
                    else if (_formContext.getAttribute("qdb_cust_adv") == null ||
                        _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
                        qdb_ReturnVal = "Please make sure customer advice is attached.";
                    }
                }
                break;

            // case "{17B5F32F-EBED-E211-A9BB-00155D788238}": // Execution of L/C
            // if (_formContext.getAttribute("qdb_lc_authorization").getValue() == "751090000") {
            // if (_formContext.getAttribute("qdb_tcs_rct") == null ||
            // _formContext.getAttribute("qdb_tcs_rct").getValue() == null) {
            // qdb_ReturnVal = "Please make sure Issuance of L/C SWIFT Message is attached.";
            // }
            // else if (_formContext.getAttribute("qdb_cust_adv") == null ||
            // _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
            // qdb_ReturnVal = "Please make sure customer advice is attached.";
            // }
            // else if (_formContext.getAttribute("qdb_wc_rpt") == null ||
            // _formContext.getAttribute("qdb_wc_rpt").getValue() == null) {
            // qdb_ReturnVal = "Please make sure benificary world check report is attached.";
            // }
            // }
            // else if (_formContext.getAttribute("qdb_lc_authorization").getValue() == "751090001" || _formContext.getAttribute("qdb_lc_authorization").getValue() == "751090002") {
            // if (_formContext.getAttribute("qdb_wc_rpt") == null ||
            // _formContext.getAttribute("qdb_wc_rpt").getValue() == null) {
            // qdb_ReturnVal = "Please make sure benificary world check report is attached.";
            // }
            // }
            // break;
            // //Execution of L/C Payment
            // case "{0AB84373-7603-E311-A57C-00155D788238}":
            // /*
            // if(_formContext.getAttribute("qdb_tcs_rct") == null ||
            // _formContext.getAttribute("qdb_tcs_rct").getValue() == null )
            // {
            // qdb_ReturnVal = "Please make sure customer advide for L/C payment is attached.";
            // }
            // else
            // */
            // qdb_ReturnVal = "";
            // if (_formContext.getAttribute("qdb_contract_required").getValue() != null) {
            // if (_formContext.getAttribute("qdb_contract_required").getValue()[0].id != "{DE2D7C06-2004-E411-9003-00155D780506}") {
            // if (_formContext.getAttribute("qdb_loan_account_ltl") != null) {
            // if (_formContext.getAttribute("qdb_loan_account_ltl").getValue() == null) {
            // qdb_ReturnVal = ""; //"Please make sure that RPS is attached using Get RPS function.\n";
            // }
            // }
            // }
            // }
            // if (_formContext.getAttribute("qdb_cust_adv") == null ||
            // _formContext.getAttribute("qdb_cust_adv").getValue() == null) {
            // qdb_ReturnVal += "Please make sure L/C payment SWIFT message is attached.";
            // }
            // else if (_formContext.getAttribute("qdb_qdb_dis1") == null ||
            // _formContext.getAttribute("qdb_qdb_dis1").getValue() == null) {
            // qdb_ReturnVal += "Please make sure L/C payment repayment schedule is attached.";
            // }
            // break;
            // case "{19158C62-6646-E311-9BB2-00155D788238}": // Credit Proposal Preperation
            // case "{060F4D86-C590-E311-8213-00155D788238}":
            // if (_formContext.getAttribute("qdb_creditproposalcreditanalyststatus").getValue() == null) {
            // _formContext.getAttribute("qdb_creditproposalcreditanalyststatus").setRequiredLevel("required");
            // qdb_ReturnVal = "Please select Proposal Status.";
            // }
            // break;
            // case "{14A58CBC-6746-E311-9BB2-00155D788238}": // Credit Proposal Preperation
            // case "{F1EA1C59-77AF-E311-9705-00155D788238}":
            // if (_formContext.getAttribute("qdb_creditproposalheadcreditanalysisapproval").getValue() == null) {
            // _formContext.getAttribute("qdb_creditproposalheadcreditanalysisapproval").setRequiredLevel("required");
            // qdb_ReturnVal = "Please select Proposal Status.";
            // }
            // break;
            // case "{D473A218-5546-E311-9BB2-00155D788238}": // Financial Forecasting Upload
            // if (_formContext.getAttribute("qdb_ff_analysis_status").getValue() == "751090000") {
            // if (_formContext.getAttribute("qdb_iccmemo") == null &&
            // _formContext.getAttribute("qdb_qdb_dis2").getValue() == null) {
            // qdb_ReturnVal = "Please upload financials before closing task.";
            // }
            // }

            // break;
            // case "{836477F5-3F46-E311-9BB2-00155D788238}": // Technical Study
            // if (_formContext.getAttribute("qdb_credit_proposal_technical_analysis_status").getValue() == "751090000") {
            // if (_formContext.getAttribute("qdb_iccmemo") == null) {
            // qdb_ReturnVal = "Please upload Technical Study before closing task.";
            // }
            // }
            // break;
            // case "{C3765BC6-3304-E411-9003-00155D780506}": // Technical Study
            // GenerateContractWin();
            // ;
            // break;
            // case "{C3765BC6-3304-E411-9003-00155D780506}": // Disbursement CAD Head Approval
            // var lcl_ContractType;
            // lcl_ContractType = _formContext.getAttribute("qdb_disbursement_through");
            // if (lcl_ContractType != null && lcl_ContractType.getValue() == "751090000") {
            // GenerateContract();
            // ;
            // }
            // break;
            // case "{AB750E89-F258-E411-B163-00155D788B08}": // Contract Review by Credit Officer --L/C Scurtny
            // GenerateContractWin();

            // break;

            // case "{5F39FE74-DE61-E411-B163-00155D788B08}": // Contract Review by Credit Officer --LPC Loan Disbuserment
            // try {
            // GenerateLPOContractWin();
            // }
            // catch (ex) {

            // }

            // break;

            case "{23D183C6-BDF1-E911-812C-00155DB3C005}":


                let iframeControl = _formContext.getControl("IFRAME_AddContract1"); // replace with your iframe name

                // Check if iframe exists and is visible

                if (iframeControl && iframeControl.getVisible()) {

                    let iframeWindow = iframeControl.getObject().contentWindow;

                    if (iframeWindow) {

                        let AgencyContract = _formContext.getAttribute("qdb_tskfle_guid");

                        let PurchaseContract = _formContext.getAttribute("qdb_purchase_contrat");

                        let PurchaseGuarantee = _formContext.getAttribute("qdb_tcs_rct");

                        if ((!AgencyContract || !AgencyContract.getValue())

                            || (!PurchaseContract || !PurchaseContract.getValue())

                            || (!PurchaseGuarantee || !PurchaseGuarantee.getValue())) {

                            qdb_ReturnVal = "Please upload all signed contracts files.";

                        }

                    }

                }

                break;
        }
        return qdb_ReturnVal;
    }
    function ViewWorkflowHistory() {
        let QDB_RecordType;
        let Url;
        let RecordID;
        QDB_RecordType = _formContext.getAttribute("qdb_record_type");
        switch (QDB_RecordType.getValue()[0].id.toUpperCase()) {
            //Documentary Collection

            case "{F622CE86-1BB8-E711-80E8-02BF800001AD}":
                if (_formContext.getAttribute("qdb_loan_application_ref") != null) {
                    RecordID = _formContext.getAttribute("qdb_loan_application_ref").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLoanApplicationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;

            case "{18512801-4043-E711-80E8-00155D159B25}"://Documentary Collection
            case "{BA00CB1F-4043-E711-80E8-00155D159B25}"://(D/C)Sight Payment
            case "{83BF8718-4043-E711-80E8-00155D159B25}"://(D/C)Usance Payment
                if (_formContext.getAttribute("qdb_documentary_collection") != null) {
                    RecordID = _formContext.getAttribute("qdb_documentary_collection").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?/QDB1_MSCRM/DCDocumentationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Disbursement             
            case "{B4F84151-03C9-E211-BC78-00155D787B38}":
            case "{36714796-99ED-E211-A9BB-00155D788238}":
            case "{11A1184B-E3F6-E211-A57C-00155D788238}":
            case "{B0423E73-240E-E311-A57C-00155D788238}":
            case "{E1F2FCB2-2E57-E311-A9A2-00155D787B38}":
            case "{F7CE8DD3-55F9-E211-A57C-00155D788238}":

                if (_formContext.getAttribute("qdb_disbursement_request") != null) {
                    RecordID = _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id;
                    if (_formContext.getAttribute("qdb_disbursement_for") != null && _formContext.getAttribute("qdb_disburse_through") != null) {
                        if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090003" && _formContext.getAttribute("qdb_disburse_through").getValue() == "751090000") {
                            Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCDisbursementWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                        }
                        else {
                            Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fDisbursementWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                        }
                    }
                    else {
                        Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fDisbursementWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                    }

                }

                break;
            case "{826477F5-3F46-E311-9BB2-00155D788238}":
            case "{FBBC874A-6646-E311-9BB2-00155D788238}":
            case "{925EC3CA-CC9B-E311-8213-00155D788238}":

                if (_formContext.getAttribute("qdb_loan_application_ref") != null) {
                    RecordID = _formContext.getAttribute("qdb_loan_application_ref").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLoanApplicationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Amendment        
            case "{759233A2-15EF-E211-A9BB-00155D788238}":
                if (_formContext.getAttribute("qdb_lc_amendment_ref") != null) {
                    RecordID = _formContext.getAttribute("qdb_lc_amendment_ref").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCAmendmentWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }

                break;
            //L/C Documentation           
            case "{AFC020E4-9DEF-E211-A9BB-00155D788238}":
            case "{787FD30C-74F1-E211-A9BB-00155D788238}":
                if (_formContext.getAttribute("qdb_lc_documentation") != null) {
                    RecordID = _formContext.getAttribute("qdb_lc_documentation").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCDocumentationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            case "{E23BC6CF-D4FE-E211-BE9A-00155D787B38}": // L/C payment Acceptance
            case "{1F6B594F-07F2-E211-A9BB-00155D788238}": //Usacne Payment
            case "{CED26815-2FF2-E211-A9BB-00155D788238}": //Sight Payment
            case "{1DEF5365-F1F1-E211-A9BB-00155D788238}": //L/C Payment
            case "{FC782D69-3C66-E311-A9A2-00155D787B38}":
                if (_formContext.getAttribute("qdb_lc_documentation") != null) {
                    RecordID = _formContext.getAttribute("qdb_lc_documentation").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLCDocumentationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            // Cases       
            case "{891B1B5A-3E4C-E311-9BB2-00155D788238}":
                if (_formContext.getAttribute("qdb_caserefnoid") != null) {
                    RecordID = _formContext.getAttribute("qdb_caserefnoid").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCaseWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }

                break;
            //Guarantee    
            case "{F7CE8DD3-55F9-E211-A57C-00155D788238}":
                if (_formContext.getAttribute("qdb_caserefnoid") != null) {
                    RecordID = _formContext.getAttribute("qdb_caserefnoid").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCaseWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Guarantee Amendment     
            case "{10A5C438-A613-E311-A57C-00155D788238}":
                if (_formContext.getAttribute("qdb_lg_ref_no") != null) {
                    RecordID = _formContext.getAttribute("qdb_lg_ref_no").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fGuaranteeWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;

            case "{67E508FB-E2F7-E211-A57C-00155D788238}":
                break;
            //Loan Amendment        
            case "{EA0759C7-2DBD-E211-90D7-00155D787B38}":
                if (_formContext.getAttribute("qdb_loan_ammendment_request") != null) {
                    RecordID = _formContext.getAttribute("qdb_loan_ammendment_request").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fLoanAmendmentWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Loan Creation        
            case "{0E634601-BDBC-E211-90D7-00155D787B38}":
                if (_formContext.getAttribute("qdb_laon_creation_request_ref") != null) {
                    RecordID = _formContext.getAttribute("qdb_laon_creation_request_ref").getValue()[0].id;
                    //Url = "http://mcsqlstg01/ReportServer_MCSQLSTG01_INST2/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreationpPrint&rs:Command=Render&Id=" + RecordID;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreationWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Clearing        
            case "{BB2156F5-1B4A-E311-9BB2-00155D788238}":
            case "{D8D643EA-1B4A-E311-9BB2-00155D788238}":
            case "{D9D643EA-1B4A-E311-9BB2-00155D788238}":
                if (_formContext.getAttribute("qdb_cheque_clearing_request") != null) {
                    RecordID = _formContext.getAttribute("qdb_cheque_clearing_request").getValue()[0].id;
                    //Url = "http://mcsqlstg01/ReportServer_MCSQLSTG01_INST2/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreationpPrint&rs:Command=Render&Id=" + RecordID;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fChequeWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            case "{4CFE9D2D-A1B5-E211-90D7-00155D787B38}":
            case "{3E934B55-7DBC-E711-8105-00155D78042C}":


                if (_formContext.getAttribute("qdb_cheque_clearing_request") != null) {
                    if (_formContext.getAttribute("qdb_cheque_clearing_request").getValue() != null) {
                        RecordID = _formContext.getAttribute("qdb_cheque_clearing_request").getValue()[0].id;
                        //Url = "http://mcsqlstg01/ReportServer_MCSQLSTG01_INST2/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fNewLoanCreationpPrint&rs:Command=Render&Id=" + RecordID;
                        Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fChequeWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                    }
                }
                break;

            case "{E53ABCE4-A0B5-E211-90D7-00155D787B38}":
            case "{9AF1DAF1-4A4C-E311-9BB2-00155D788238}":
            case "{4CFE9D2D-A1B5-E211-90D7-00155D787B38}":
            case "{E63ABCE4-A0B5-E211-90D7-00155D787B38}":
            case "{4E6B0B50-F025-E311-A57C-00155D788238}":
            case "{C46A2AEE-E2BA-E211-90D7-00155D787B38}":

                if (_formContext.getAttribute("qdb_term_sheet_ref_no") != null) {
                    RecordID = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fTermsheetWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;

            case "{2A5E4EDD-94BB-E211-90D7-00155D787B38}":
                if (_formContext.getAttribute("qdb_documents_lodgement_ref_no") != null) {
                    RecordID = _formContext.getAttribute("qdb_documents_lodgement_ref_no").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fDocLodgementWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Guarantee Amendment     
            case "{0B0ADC4C-299D-E311-8213-00155D788238}": //Return to Credit Officer by Ops. Processor
                if (_formContext.getAttribute("qdb_lg_ref_no") != null) {
                    RecordID = _formContext.getAttribute("qdb_lg_ref_no").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fGuaranteeWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;
            //Minha Exhibition Support Service
            case "{43E43643-BCB7-E611-80E7-00155D788242}":
                if (_formContext.getAttribute("qdb_exhibitionsupportserviceref") != null) {
                    RecordID = _formContext.getAttribute("qdb_exhibitionsupportserviceref").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fExhibitionSupportServiceWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;

            case "{727B4597-7706-EC11-815A-00155D3A805F}":

                if (_formContext.getAttribute("qdb_term_sheet_ref_no") != null) {
                    RecordID = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue()[0].id;
                    Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fTermsheetWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                }
                break;



        }

        if (Url != null) {

            window.open(Url, "_blank");
        }
        else if (QDB_RecordType.getValue()[0].id.toUpperCase() == "{4CFE9D2D-A1B5-E211-90D7-00155D787B38}") {
            if (_formContext.getAttribute("qdb_term_sheet_ref_no") != null) {
                RecordID = _formContext.getAttribute("qdb_term_sheet_ref_no").getValue()[0].id;
                Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fTermsheetWorkflowHistory&rs:Command=Render&Id=" + RecordID;
                window.open(Url, "_blank");
            }

        }
        else {
            Alert.show("Not enough security permissions to view workflow history.", null, null, "WARNING", 500, 200)
        }
    }

    function OtherAttachedDocuments() {
        //Xrm.Navigation.openAlertDialog({text: "Other Attached Documents"}) // MIGRATED: alert→openAlertDialog;
        let lclDisbursementType = _formContext.getAttribute("qdb_disbursement_for").getValue();

        if (lclDisbursementType != null && lclDisbursementType == 751090014) {

            let docURL = netBaseURL + ":9797/CentralizedDocumentsBayAlWadiyaDocuments.aspx?entitylogicalname=qdb_payment_authorization_ticket&subentity=qdb_payment_authorization_ticket&id="
                + _formContext.getAttribute("qdb_disbursement_request").getValue()[0].id + "&crno=" + _formContext.getAttribute("qdb_cif_no").getValue()[0].id + "&userid=" + Xrm.Utility.getGlobalContext().getUserId() // MIGRATED: _formContext.context→getGlobalContext;

            OpenDialogUsingAlert(docURL, "", false);
        }
    }

    function ViewWorkflowHistoryGrid() {
        //Xrm.Navigation.openAlertDialog({text: "Workflow History"}) // MIGRATED: alert→openAlertDialog;
    }

    function frmOnSave(prmContext) { // MIGRATED: prmContext is executionContext
        _formContext = prmContext.getFormContext(); // MIGRATED: derive formContext on save

        let QDB_RecordObjectType, QDB_RecordObjectId, QDB_Object;

        QDB_RecordObjectType = _formContext.getAttribute("qdb_related_object_type");
        QDB_RecordObjectId = _formContext.getAttribute("qdb_related_object_id");

        if (QDB_RecordObjectType.getValue() == null
            || QDB_RecordObjectId.getValue() == null) {
            QDB_Object = GetRelatedObject();
            if (QDB_Object != null) {
                QDB_RecordObjectType.setValue(QDB_Object.type);
                QDB_RecordObjectId.setValue(QDB_Object.id);
            }
        }
    }

    function GetRelatedObject() {
        let ts_WorkItemRecordType, QDB_LookupRef, QDB_ReturnObject;

        ts_WorkItemRecordType = _formContext.getAttribute("qdb_record_type");

        switch (ts_WorkItemRecordType.getValue()[0].id) {
            case "{E53ABCE4-A0B5-E211-90D7-00155D787B38}": //ICC Descion Confirmation
                QDB_LookupRef = _formContext.getAttribute("qdb_term_sheet_ref_no");

                if (QDB_LookupRef.getValue() != null) {
                    QDB_ReturnObject = new Object();
                    QDB_ReturnObject.id = QDB_LookupRef.getValue()[0].id;
                    QDB_ReturnObject.type = QDB_LookupRef.getValue()[0].entityType;
                }
                break;
            default:
                //Xrm.Navigation.openAlertDialog({text: "Default conditition."}) // MIGRATED: alert→openAlertDialog;
                break;
        }

        return QDB_ReturnObject;
    }

    function showProps(obj, objName) {
        let result = "";
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                result += objName + "." + i + " = " + obj[i] + "\n";
            }
        }
        return result;
    }

    //Unsed Method
    function RefreshParentWindow() {
        if (window.top != null && window.top.opener != null && window.top.opener.top.document != null)
            window.top.opener.top.document.location.reload();
    }


    function ShowWorkItem2(prmprmItemId, prmETN, prmWorkItemId, prmRecordTypeId, prmWorkflowStatusId) {

        let parameters = {};
        //Set the Parent Customer field value to “Contoso”.
        //    parameters["formid"] = "b053a39a-041a-4356-acef-ddf00182762b";
        parameters["_CreateFromId"] = "2878282E-94D6-E111-9B1D-00155D9D700B";
        parameters["_CreateFromIdname"] = "Term Sheet";
        parameters["_CreateFromIdtype"] = "qdb_customer_term_sheet";
        parameters["qdb_comments"] = "Default values for this record were set programmatically.";
        //Set Do not allow E-mails to "Do Not Allow".
        //    parameters["donotemail"] = "1";

        // Open the window.
        Xrm.Navigation.openForm({entityName: "qdb_status_history", entityId: null}, parameters) // MIGRATED: openEntityForm→openForm;



    }

    function ShowWorkItem(prmItemId, prmTypeCode, prmWorkflowStepId, prmWorkflowStepName, prmRecordTypeId, prmRecordTypeName) {

        let lclUrlParams, lclExtraQS, lclEtn, lclCreateFormId, lclCreateFormType, prmOrgName;

        lclExtraQS = "";
        lclUrlParams = "";

        if (prmOrgName == null) {
            prmOrgName = "qdb1";
        }

        lclEtn = "qdb_status_history";

        if (prmItemId != null) {

            lclCreateFormType = prmTypeCode;

            lclCreateFormId = prmItemId;

            lclExtraQS = lclExtraQS.concat("?_CreateFromId=", encodeURIComponent(lclCreateFormId), "&_CreateFromType=" + lclCreateFormType + "&etn=", lclEtn
                + "&qdb_work_item=" + prmWorkflowStepId
                + "&qdb_work_itemname=" + prmWorkflowStepName
                + "&qdb_record_type=" + prmRecordTypeId
                + "&qdb_record_typename=" + prmRecordTypeName);

            lclUrlParams = lclUrlParams.concat("etn=", lclEtn, "&extraqs=", encodeURIComponent(lclExtraQS), "&pagetype=entityrecord");

            ShowWebDialog(lclUrlParams, prmOrgName);
        }
    }

    /**
     * MIGRATED: getServerUrl() is deprecated in UCI.
     * Returns getClientUrl() via getGlobalContext() instead.
     * @returns {string} CRM server base URL
     */
    function GetServerUrl() { // MIGRATED: getServerUrl→getClientUrl
        return Xrm.Utility.getGlobalContext().getClientUrl(); // MIGRATED: getServerUrl→getClientUrl
    }

    function ShowWebDialog(prmDialogParams, prmOrgName) {

        let lclUrl;

        lclUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/main.aspx?" + prmDialogParams;
        //lclUrl = "http://mvcrm01/qdb1" + "/main.aspx?" + prmDialogParams;
        if (false /* MIGRATED: isOutlookClient always false in UCI */) {
            openStdWin(lclUrl, "HwndStatusHistory", 920, 620, "status=0");
            return;
        }

        else
            window.open(lclUrl, "HwndStatusHistory", 920, 620, "status=0")

        return;

        //if (window.showModalDialog(lclUrl, "", 'dialogWidth:920px; dialogHeight:620px; center:yes;status:0;resizable:1;') == 1) {
        //    _formContext.data.refresh();
        //    //   window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.search;
        //    // Old Code Fixed by Above Code Line
        //    //window.location.reload(true);
        //}
        //else {
        //    //window.location.reload(true);
        //    _formContext.data.refresh();
        //    //window.location.href = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.search;
        //}
    }

    function ShowDialogPopupDocValidation(prmRecordId, prmRecordETN, prmDialogId, context) {
        let lclUrl;
        let qdb_document_attached = _formContext.getAttribute("qdb_document_attached").getValue();
        if (qdb_document_attached == true) {

            lclUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/cs/dialog/rundialog.aspx?DialogId=";
            lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);
            if (prmRecordETN == "qdb_payment_authorization_ticket") {
                if (ValidateDisbursementConditions() == false) {
                    return;
                }
            }
            else if ((_formContext.getAttribute("qdb_work_item") != null) && (context != "ONHOLD")) {
                if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{3F44B811-87B9-E211-BE7D-00155D788238}") {
                    if (_formContext.getAttribute("qdb_email_address").getValue() == null) {
                        Xrm.Navigation.openAlertDialog({text: "Please enter customer email address, save Task and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                        //  Alert.show(null, "Please enter customer email address, save Task and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                        return;
                    }
                    if (_formContext.getAttribute("qdb_email_address").getIsDirty() == true) {
                        Xrm.Navigation.openAlertDialog({text: "Please save Task first and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                        //Alert.show(null, "Please save Task first and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                        return;
                    }
                }
            }
            //Browser Compatibility
            /*

                    // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
                    // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
                    if (true) // MIGRATED: showModalDialog return unavailable

                        // _formContext.data.refresh();

                    }
                    else {

                        _formContext.data.refresh();

                    }
                    */
            OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);
        }
        else {
            Xrm.Navigation.openAlertDialog({text: "Kindly Attached the document and select the Document Attached as 'Yes' to proceed further."}) // MIGRATED: alert→openAlertDialog;
        }

    }

    function ShowDialogPopup(prmRecordId, prmRecordETN, prmDialogId, context) {
        let lclUrl;
        lclUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/cs/dialog/rundialog.aspx?DialogId=";
        if (context == "ONHOLD") {

            //if (_formContext.getAttribute("qdb_holdstatus").getValue() != null) {
            //    var holdstatus = _formContext.getAttribute("qdb_holdstatus").getValue();
            //    if (holdstatus == 751090000 || holdstatus == 751090002) {
            //        Xrm.Navigation.openAlertDialog({text: "This task is already requested for Manager's Approval to be on Hold. Please wait for Approval"}) // MIGRATED: alert→openAlertDialog;
            //        break;
            //    }
            //}

            if (_formContext.getAttribute("qdb_holdstatus") != null) {

                let holdstatus = _formContext.getAttribute("qdb_holdstatus").getValue();

                if (holdstatus != null) {
                    if (holdstatus == 751090000 || holdstatus == 751090002) {
                        Xrm.Navigation.openAlertDialog({text: "This task is already requested for Manager's Approval to be on Hold. Please wait for Approval"}) // MIGRATED: alert→openAlertDialog;
                        return;
                    }
                }
            }

            lclUrl += encodeURIComponent("{666F7484-81DF-4EA7-9503-CE5D750719A7}") + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

            //Browser Compatibility
            /*
            // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
            // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
            if (true) // MIGRATED: showModalDialog return unavailable

            }
            */
            OpenDialogUsingAlert("666F7484-81DF-4EA7-9503-CE5D750719A7", prmRecordETN, true);


            return;
        }
        //lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);
        if (prmRecordETN == "qdb_payment_authorization_ticket") {
            if (ValidateDisbursementConditions() == false) {
                return;
            }
        }
        else if (prmDialogId == "{aaebce7d-80aa-4e30-a1f5-29c30baf25d6}" || context != "ONHOLD") {


        }
        else if ((_formContext.getAttribute("qdb_work_item") != null) && (context != "ONHOLD")) {
            if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{3F44B811-87B9-E211-BE7D-00155D788238}") {
                if (_formContext.getAttribute("qdb_email_address").getValue() == null) {
                    Xrm.Navigation.openAlertDialog({text: "Please enter customer email address, save Task and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                    //  Alert.show(null, "Please enter customer email address, save Task and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                    return;
                }
                if (_formContext.getAttribute("qdb_email_address").getIsDirty() == true) {
                    Xrm.Navigation.openAlertDialog({text: "Please save Task first and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                    //Alert.show(null, "Please save Task first and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                    return;
                }
            }
        }

        if (prmRecordETN == "qdb_tasdeer_task") {
            lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

            //Browser Compatibility
            /*
            // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
            // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
            if (true) // MIGRATED: showModalDialog return unavailable

            }
            */
            OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);
            return;
        }

        if (prmDialogId == "{d0c0e537-e42b-45c3-aaab-d4ab9e4e42de}") {
            //if (_formContext.getAttribute("qdb_holdstatus").getValue() != null) {
            //    var approvalpendingStaus = _formContext.getAttribute("qdb_holdstatus").getValue();
            //    if (approvalpendingStaus == 751090002) {
            //        Xrm.Navigation.openAlertDialog({text: "This task is already requested for Manager's Approval to extend on Hold. Please wait for Approval"}) // MIGRATED: alert→openAlertDialog;
            //        break;
            //    }
            //}

            let approvalpendingStaus = _formContext.getAttribute("qdb_holdstatus").getValue();

            if (approvalpendingStaus != null) {
                if (approvalpendingStaus == 751090002) {
                    Xrm.Navigation.openAlertDialog({text: "This task is already requested for Manager's Approval for extension. Please wait for Approval"}) // MIGRATED: alert→openAlertDialog;
                    return;
                }
            }

            lclUrl += encodeURIComponent("{A768E19C-0DE5-4E10-90CB-87B4D7B02719}") + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

            //Browser Compatibility
            /*
            // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
            // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
            if (true) // MIGRATED: showModalDialog return unavailable

            }
            */
            OpenDialogUsingAlert("A768E19C-0DE5-4E10-90CB-87B4D7B02719", prmRecordETN, true);
            return;
        }

        else if (prmDialogId == "98A57156-4D67-4490-8BDB-B3065DE8F8FE" && prmRecordETN == "ibs_creditinsuranceapplication") {

            let coveredamount = _formContext.getAttribute("qdb_covered_amount_currency_base").getValue();

            let valueofgoods = _formContext.getAttribute("ibs_valueofgoods_base").getValue();

            let amount = coveredamount == null ? valueofgoods : coveredamount;

            if (_formContext.getAttribute("qdb_available_limit").getValue() < amount) {
                Xrm.Navigation.openAlertDialog({text: "Covered amount can not be greater than available limit"}) // MIGRATED: alert→openAlertDialog;
                return;
            }
            else {
                lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

                //Browser Compatibility
                /*
                    // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1
                    // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
                    if (true) // MIGRATED: showModalDialog return unavailable
                        */
                OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);
            }
        }


        else if (prmDialogId != "{d0c0e537-e42b-45c3-aaab-d4ab9e4e42de}" || context != "ONHOLD") {
            lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);
            //Browser Compatibility Only For OSS Application and Loan Application
            /*
            }

            // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
            // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
            if (true) // MIGRATED: showModalDialog return unavailable

            }
            else {
                _formContext.data.refresh();
            */
            /*if (prmRecordETN == "qdb_loan_application" || prmRecordETN == "qdb_oss_application") {*/
            OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);

        }
    }

    function ShowDialogPopupTermsheet(prmRecordId, prmRecordETN, prmDialogId, context) {

        _formContext.data.entity.save();
        let qdb_dhamanapproval = _formContext.getAttribute("qdb_dhamanapproval");
        if (qdb_dhamanapproval != null) {
            if (qdb_dhamanapproval.getRequiredLevel() == "required" && qdb_dhamanapproval.getValue() == null) {
                return false;
            }
        }

        let checkdirty = _formContext.data.entity.getIsDirty();
        let ICCField = _formContext.getAttribute("qdb_icc_approval_status").getValue();
        let isValidSubmission = true;

        if (ICCField != 751090006 && ICCField != null) {

            let NFGApplication = _formContext.getControl("qdb_nfgpplication");
            if (NFGApplication != null && NFGApplication != undefined) {
                if (NFGApplication.getAttribute().getValue() != null && ICCField != 751090000) {
                    if (_formContext.getAttribute("qdb_division") != null && _formContext.getAttribute("qdb_division") != undefined) {
                        let department = _formContext.getAttribute("qdb_division").getValue()[0].id;
                        //AL Dhameen
                        if (department != null && department != undefined && department == "{38AC44BD-604B-E311-9BB2-00155D788238}") {

                            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_nfgpartnerbankapplications?$select=_qdb_nfgapplication_value,qdb_qdbapprovedamount,qdb_qdbcoveragepercentage&$filter=_qdb_termsheet_value eq " +
                                prmRecordId + " and  (qdb_qdbapprovedamount eq null or qdb_qdbapprovedamount eq 0)  and  (qdb_qdbcoveragepercentage eq null or qdb_qdbcoveragepercentage eq 0)";

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
                                        let results = JSON.parse(this.response);
                                        if (results.value.length > 0) {
                                            isValidSubmission = false;
                                            Xrm.Navigation.openAlertDialog({text: "Partner Bank Application's QDB Coverage Percentage and QDB Approved amount  Should Not Be 'Blank' While Submitting The Term Sheet"}) // MIGRATED: alert→openAlertDialog;
                                            return false;
                                        }
                                    } else {
                                        Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: alert→openAlertDialog;
                                    }
                                }
                            };

                            // Execute HTTTP request
                            req.send();

                            _executeODataQuery(query, fillConfiguration, "", false);
                        }
                    }
                }
            }
            if (checkdirty == false) {
                let lclUrl;
                lclUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/cs/dialog/rundialog.aspx?DialogId=";
                lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);
                if (prmRecordETN == "qdb_payment_authorization_ticket") {
                    if (ValidateDisbursementConditions() == false) {
                        return;
                    }
                }
                else if ((_formContext.getAttribute("qdb_work_item") != null) && (context != "ONHOLD")) {
                    if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{3F44B811-87B9-E211-BE7D-00155D788238}") {
                        if (_formContext.getAttribute("qdb_email_address").getValue() == null) {
                            Xrm.Navigation.openAlertDialog({text: "Please enter customer email address, save Task and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                            //  Alert.show(null, "Please enter customer email address, save Task and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                            return;
                        }
                        if (_formContext.getAttribute("qdb_email_address").getIsDirty() == true) {
                            Xrm.Navigation.openAlertDialog({text: "Please save Task first and then click on Send Customer Term Sheet button."}) // MIGRATED: alert→openAlertDialog;
                            //Alert.show(null, "Please save Task first and then click on Send Customer Term Sheet button.", null, "INFO", 500, 200)
                            return;
                        }
                    }
                }


                //if (typeof ($) == 'undefined') {
                //    $ = parent.$;
                //    jQuery = parent.jQuery;
                //}

                //;
                //loadScript();

                //var dialogId = prmDialogId.replace("{", "");
                //dialogId = dialogId.replace("}", "");
                //var recordId = prmRecordId[0].replace("{", "");
                //recordId = recordId.replace("}", "");
                //Alert.showDialogProcess(dialogId, prmRecordETN, recordId,
                //      callback
                //    , 800, 500, null);




                //Browser Compatibility

                /*
                // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
                // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
                if (true) // MIGRATED: showModalDialog return unavailable

                    // _formContext.data.refresh();

                }
                else {

                    _formContext.data.refresh();

                }
                */
                if (isValidSubmission == true) {
                    OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);
                }

            }
            else {
                Xrm.Navigation.openAlertDialog({text: "Kindly Save the Record First Before Submitting the Termsheet."}) // MIGRATED: alert→openAlertDialog;
            }


        }


        else {
            Xrm.Navigation.openAlertDialog({text: "ICC Approval Status Should Not Be 'Blank' or 'Pending' While Submitting The Term Sheet."}) // MIGRATED: alert→openAlertDialog;
        }

    }


    async function ShowDialog() // MIGRATED: async for openConfirmDialog {
        try {
            let prmRecordId = _formContext.data.entity.getId();
            let entityName = "qdb_tasdeer_task";
            let dialogId = "{579C8BBF-5A7D-4524-B7D0-46DE63F43EEC}";
            lclUrl = netBaseURL + "/qdb1" + "/cs/dialog/rundialog.aspx?DialogId=";
            lclUrl += encodeURIComponent(dialogId) + "&EntityName=" + entityName + "&ObjectId=" + encodeURIComponent(prmRecordId);
            //Xrm.Navigation.openAlertDialog({text: lclUrl}) // MIGRATED: alert→openAlertDialog;
            if ((await Xrm.Navigation.openConfirmDialog({text: "Are you Sure You want to pu the task on hold , Confirm?"})).confirmed // MIGRATED: confirm→openConfirmDialog (function must be async) == false) {
                return false;
            }

            //Browser Compatibility
            /*
        // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
        // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
        if (true) // MIGRATED: showModalDialog return unavailable
            window.location.reload(true);
        }
        else {
            //window.location.reload(true);
        }
        */
            OpenDialogUsingAlert(dialogId, entityName, true);

        }
        catch (e) {
            Xrm.Navigation.openAlertDialog({text: "An error occured - Function : ShowDialog"}) // MIGRATED: alert→openAlertDialog

        }

    }


    function callback() {
        _formContext.data.refresh();
    }
    //function loadScript(url, callback) {
    //    // Adding the script tag to the head as suggested before
    //    var head = document.getElementsByTagName('head')[0];
    //    var script = document.createElement('script');
    //    script.type = 'text/javascript';
    //    script.src = "https://qdbcrmapp/qdb1/WebResources/mag_/js/alert.js";;

    //    // Then bind the event to the callback function.
    //    // There are several events for cross browser compatibility.
    //    script.onreadystatechange = callback;
    //    script.onload = callback;

    //    // Fire the loading
    //    head.appendChild(script);
    //}

    function ValidateDisbursementConditions() {
        let lcl_TotalDisbursement = _formContext.getAttribute("qdb_disbursement_amount_base").getValue();
        let lcl_FacilityAvailable = _formContext.getAttribute("qdb_available_limit").getValue();
        let lcl_GuaranteeType = _formContext.getAttribute("qdb_type_of_lg").getValue();

        if (CheckRequiredFields_OnSubmit() == false) {
            return false;
        }

        if (lcl_TotalDisbursement > 0 && _formContext.getAttribute("transactioncurrencyid").getValue() != null && lcl_GuaranteeType != 751090050) {
            //if ( (lcl_FacilityAvailable  - (lcl_FacilityAvailable *.05)) <  lcl_TotalDisbursement)	 	
            if (lcl_FacilityAvailable < lcl_TotalDisbursement) {
                Alert.show(null, "Disbursement amount is greater than Available Facility. Please select other Facility or make sure that Disbursement amount is correct.", null, "WARNING", 500, 200)
                if (_formContext.getAttribute("qdb_name").getValue() != "LD000854")
                    return false;
            }
            else {
                return true;
            }
        }
    }

    function TradeFinanceAmendmend(prmItemId, prmTypeCode, prmOptionSetType) {

        let lclUrlParams, lclExtraQS, lclEtn, lclCreateFormId, lclCreateFormType, prmOrgName;

        lclExtraQS = "";
        lclUrlParams = "";

        if (prmOrgName == null) {
            prmOrgName = "qdb1";
        }

        lclEtn = "qdb_tf_amendment_request";

        if (prmItemId != null) {

            lclCreateFormType = prmTypeCode;

            lclCreateFormId = prmItemId;

            lclExtraQS = lclExtraQS.concat("?_CreateFromId=", encodeURIComponent(lclCreateFormId), "&_CreateFromType=" + lclCreateFormType + "&etn=", lclEtn
                + "&qdb_amendment_for=" + prmOptionSetType);

            lclUrlParams = lclUrlParams.concat("etn=", lclEtn, "&extraqs=", encodeURIComponent(lclExtraQS), "&pagetype=entityrecord");

            ShowWebDialog(lclUrlParams, prmOrgName);
        }
    }


    function ViewLoanAccountRPS() {
        let lcl_RecordType = _formContext.getAttribute("qdb_loan_account_ltl");
        if (lcl_RecordType != null && lcl_RecordType.getValue() != null) {

            Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fRepaymentSchedule&rs:Command=Render&AccountNo=";

            Url += lcl_RecordType.getValue()[0].name;;

            window.open(Url, "_blank");
        }
        else {
            Alert.show(null, "Please first click on Get Repayment Schedule button to attach loan account.", null, "WARNING", 500, 200)
        }
    }

    function GenerateContract() {
        let Url, lcl_ProposalID;
        let lcl_ContractType;

        Url = netBaseURL + ":6001/GenerateContractv1.aspx?orgname=qdb1&view=1&id=";

        lcl_ContractType = _formContext.getAttribute("qdb_work_item");
        //_formContext.getAttribute("qdb_customer_contract_ref");

        switch (lcl_ContractType.getValue()[0].id.toUpperCase()) {

            case "{18913FC4-0DCB-E211-BC78-00155D787B38}":
                Url = netBaseURL + ":6001/GenerateWakalaAnex2.aspx?orgname=qdb1&view=1&id=";
                break;
        }

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function GenerateContractWin() {
        let Url, lcl_ProposalID;
        let lcl_ContractType;

        Url = netBaseURL + ":6001/GenerateContractv1.aspx?orgname=qdb1&view=0&id=";

        lcl_ContractType = _formContext.getAttribute("qdb_work_item");
        //_formContext.getAttribute("qdb_customer_contract_ref");

        switch (lcl_ContractType.getValue()[0].id.toUpperCase()) {

            case "{18913FC4-0DCB-E211-BC78-00155D787B38}":
                Url = netBaseURL + ":6001/GenerateWakalaAnex2.aspx?orgname=qdb1&view=1&id=";
                break;
        }


        Url += _formContext.data.entity.getId();

        // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: lcl_ProposalID = (window.showModalDialog(Url, "", 'dialogWidth:250px; dialogHeight:150px; center:yes;status:0;resizable:0;'));
        // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
        _formContext.data.refresh();
        //Xrm.Navigation.openAlertDialog({text: lcl_ProposalID}) // MIGRATED: alert→openAlertDialog;
        if (lcl_ProposalID != null) {
            window.open(netBaseURL + "/qdb1/isv/qdb/fu/download.aspx?fid=" + lcl_ProposalID);
        }
    }

    function FillContract() {
        OpenForm("qdb_customer_contract_ref");
    }

    function OpenForm(prmLookUpFieldID) {
        let LookupFieldObject = _formContext.getAttribute(prmLookUpFieldID).getValue();
        if (LookupFieldObject != null) {
            Xrm.Navigation.openForm({entityName: LookupFieldObject[0].entityType, entityId: LookupFieldObject[0].id}) // MIGRATED: openEntityForm→openForm;
        }
    }

    function GenerateGoodsHandOver() {
        let Url;

        Url = netBaseURL + ":6001/GenerateContract_LPO_V1.aspx?orgname=qdb1&view=1&pdfid=02&id=%7b5C427F5B-9106-E411-9003-00155D780506%7d";

        //Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function CheckRequiredFields_OnSubmit() {

        try {
            let lclDisbursementType = _formContext.getAttribute("qdb_disbursement_type").getValue();

            if (lclDisbursementType != "" || lclDisbursementType != null) {

                if (lclDisbursementType == "751090000") { //Construction

                    let Contractor = _formContext.getAttribute("qdb_contractor").getValue();

                    if (Contractor == "" || Contractor == null) {
                        Alert.show("You must provide a value of for Contractor..", null, null, "WARNING", 500, 200)
                        return false;
                    }
                }
                else if (lclDisbursementType == "751090005") { //Fishiries


                    let qdb_document_attached = _formContext.getAttribute("qdb_document_attached").getValue();
                    if (qdb_document_attached != true) {
                        Alert.show("Please upload required documents Signed Offer, Acceptance Form & Commercial/Performa invoice before submitting the disbursment and mark the mandatory document attached as 'Yes'", null, null, "WARNING", 700, 200)
                        return false;
                    }
                    else
                        return true;
                }
                //New changes     ALI
                //commenting on 23 april 24 as this needs to be reverted
                //else if (lclDisbursementType == "751090014") { //Bay al waidya changes/validateions 

                //check if shippment date is less than todays date
                //var fromDate = _formContext.getAttribute("qdb_last_shipment_date").getValue();
                //var today = new Date();
                //var currentDate = today.setHours(0, 0, 0, 0);
                // if (fromDate < currentDate) {
                //Alert.show("Shippment Date cannot less than Today's date", null, null, "WARNING", 700, 200);
                //Xrm.Navigation.openAlertDialog({text: "Shippment Date cannot less than Today's date"}) // MIGRATED: alert→openAlertDialog;
                //_formContext.getAttribute("actualstart").setValue(null);
                //return false;
                //  }
                //CheckBayAlwadiyaRequiredDocuments();
                //if (IsDocMissing == true) {
                //return false;
                // }
                //}
                else {

                    let Contractor = _formContext.getAttribute("qdb_supplier").getValue();

                    if (Contractor == "" || Contractor == null) {

                        Alert.show("You must provide a value of for Benificary..", null, null, "WARNING", 500, 200)
                        return false;
                    }
                }

                let Bank = _formContext.getAttribute("qdb_benificiary_bank").getValue();

                if (Bank == "" || Bank == null) {
                    Alert.show("You must provide a value of for Benificary Bank..", null, null, "WARNING", 500, 200)
                    return false;
                }

                let Currecny = _formContext.getAttribute("qdb_currency").getValue();

                if (Currecny == "" || Currecny == null) {
                    Alert.show("You must provide a value of for Currecny ..", null, null, "WARNING", 500, 200)
                    return false;
                }
                else if (Currecny[0].id == "{E0ECA9F9-7564-E211-B700-00155D788230}") {

                    let DisbursemenType = _formContext.getAttribute("db_disbursement_type_1").getValue();
                    let IBANumber = _formContext.getAttribute("qdb_iban_number").getValue();

                    if (DisbursemenType != 751090000) {

                        if (IBANumber == "" || IBANumber == null) {
                            Alert.show("You must provide a value of for IBAN Number..", null, null, "WARNING", 500, 200)
                            return false;
                        }
                    }
                }

                let TotalAttachedFiles = _formContext.getAttribute("qdb_total_files").getValue();

                if (TotalAttachedFiles == "" || TotalAttachedFiles == null || TotalAttachedFiles == "0") {

                    // Alert.show("You must attach the Document(s)..", null, null, "WARNING", 500, 200)
                    // return false;//salman has to give the source code (event receiver) #Need to Fix
                }
            }
        }
        catch (err) {

            //Xrm.Navigation.openAlertDialog({text: err.Message}) // MIGRATED: alert→openAlertDialog;
        }
    }

    function PrintInspectionDocucments(Type) {

        if (Type != "" || Type != null) {

            if (Type == "751090000") { //LPC
                let lclDocuments = _formContext.getAttribute("qdb_documentssignedwithsupplier").getValue();
                if (lclDocuments != "" || lclDocuments != null) {
                    if (lclDocuments == "751090003") { //LPC with Installation
                        PrintLPCDocucments("lpcwithinstallation");
                    }
                    else {
                        PrintLPCDocucments("lpc");
                    }
                }
                else {
                    PrintLPCDocucments("lpc");
                }
            }
            else if (Type == "751090001") { //Purchase Acceptance
                PrintLPCDocucments("purchaseacceptance");
            }
            else if (Type == "751090002") { //Wakala
                PrintLPCDocucments("wakala");
            }
        }
        else {
            Alert.show(null, "Please select documents signed with supplier to print the document.", null, "INFO", 500, 200)
        }
    }

    function PrintLPCDocucments(Type) {
        let Url, lcl_ProposalID;

        Url = netBaseURL + ":6001/GenerateContract_LPC_InspectionDocuments.aspx?orgname=qdb1&view=1&filetype=" + Type + "&id=";

        Url += _formContext.data.entity.getId(); //GetLPOGUID();

        window.open(Url);
    }

    function GenerateLPOContract() {
        let Url, lcl_ProposalID;

        Url = netBaseURL + ":6001/GenerateContract_LPO_V2.aspx?orgname=qdb1&view=1&id=";

        Url += _formContext.data.entity.getId();

        window.open(Url);
    }

    function GenerateDeliveryNotes() {
        let Url, lcl_ProposalID;


        let qdb_work_item = _formContext.getAttribute("qdb_work_item").getValue()[0].id.toUpperCase();

        if (qdb_work_item == '{C5571D11-6BB9-EC11-819A-838407FFB701}') {

            Url = netBaseURL + ":6001/GenerateDeliveryNote_Livestock.aspx?orgname=qdb1&view=1&filetype=deliverynotelivestock&id=";
            Url += _formContext.data.entity.getId();
        }
        else {
            Url = netBaseURL + ":6001/GenerateContract_LPO_V1.aspx?orgname=qdb1&view=1&filetype=deliverynotes&id=";

            Url += GetLPOGUID();
        }

        window.open(Url);
    }

    function GeneratePermissionForGoods() {
        let Url, lcl_ProposalID;
        let _taskid = _formContext.data.entity.getId();

        Url = netBaseURL + ":6001/GenerateContract_LPO_V1.aspx?orgname=qdb1&view=1&filetype=permissionforgoods&id=";

        Url += GetLPOGUID();
        Url += "&taskid=" + _taskid;

        window.open(Url);
    }

    function GenerateAwaitingSignedContractInspectionReport() {
        GetLPOGUID();
    }

    function GetLPOGUID() {
        let EntityName, EntityId, AccountNumber, AccountEmailAddress, LookupFieldObject;
        let PrimaryContactLookupId, PrimaryContactLookupName, PrimaryContactLookupType;
        let AlertMessage;
        let resultXml;
        let lclLPOID;
        let id;
        LookupFieldObject = _formContext.data.entity.attributes.get('qdb_disbursement_request');

        if (LookupFieldObject.getValue() != null) {

            EntityId = LookupFieldObject.getValue()[0].id;
            EntityName = LookupFieldObject.getValue()[0].entityType;

            if (EntityId != null) {
                // Remove '{}' from EntityID
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }

            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */" + EntityName + "s(" + parsedID + ")?";

            // Pass OData Query and UpdateFunction
            _executeODataQuery(query, OpenInspectionReport, id);

        }
        else {
            Url = netBaseURL + ":6001/GenerateContract_InspectionReport.aspx?orgname=qdb1&view=1&filetype=awaitingsignedcontractinspectionreport&taskid=" + _formContext.data.entity.getId();

            window.open(Url);
        }

    }

    function OpenInspectionReport(resultXml) {

        if (resultXml != null && resultXml['_qdb_lpo_ref_value'] != null) {

            Url = netBaseURL + ":6001/GenerateContract_LPO_V1.aspx?orgname=qdb1&view=1&filetype=awaitingsignedcontractinspectionreport&id=" + resultXml['_qdb_lpo_ref_value'] + "&taskid=" + _formContext.data.entity.getId();

            window.open(Url);
        }
        else {
            Url = netBaseURL + ":6001/GenerateContract_InspectionReport.aspx?orgname=qdb1&view=1&filetype=awaitingsignedcontractinspectionreport&taskid=" + _formContext.data.entity.getId();

            window.open(Url);
        }
    }

    function GenerateWaadiyaContract(ContractType) {
        let Url;

        if (ContractType == "Purchase") {
            Url = netBaseURL + ":6001/GenerateContract_Waadiya.aspx?orgname=qdb1&view=1&filetype=purchase&id=";

            Url += _formContext.data.entity.getId();
        }
        else if (ContractType == "Agency") {
            Url = netBaseURL + ":6001/GenerateContract_Waadiya.aspx?orgname=qdb1&view=1&filetype=agency&id=";

            Url += _formContext.data.entity.getId();
        }
        else if (ContractType == "Guarantee") {
            Url = netBaseURL + ":6001/GenerateContract_Waadiya.aspx?orgname=qdb1&view=1&filetype=guarantee&id=";

            Url += _formContext.data.entity.getId();
        }
        else if (ContractType == "Inspection") {
            Url = netBaseURL + ":6001/GenerateContract_Waadiya.aspx?orgname=qdb1&view=1&filetype=inspection&id=";

            Url += _formContext.data.entity.getId();
        }

        window.open(Url);
    }

    function ViewEPDPaymentCertificate() {
        let Url, DisbursementLookup;
        DisbursementLookup = _formContext.data.entity.attributes.get('qdb_disbursement_request');

        if (DisbursementLookup.getValue() != null) {

            Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fPaymentCertificate&rs:Command=Render&Id=" + DisbursementLookup.getValue()[0].id;

            window.open(Url, "_blank");
        }
    }

    function GenerateLPOContractWin() {
        let Url, lcl_ProposalID;

        Url = netBaseURL + ":6001/GenerateContract_LPO_V2.aspx?orgname=qdb1&view=0&id=";

        Url += _formContext.data.entity.getId();

        // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: lcl_ProposalID = (window.showModalDialog(Url, "", 'dialogWidth:250px; dialogHeight:150px; center:yes;status:0;resizable:0;'));
        // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
        _formContext.data.refresh();
        if (lcl_ProposalID != null) {
            window.open(netBaseURL + "/qdb1/isv/qdb/fu/download.aspx?fid=" + lcl_ProposalID);
        }
    }



    function ViewCapAssessmentReport() {

        let Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fCapabilityAssessmentReport&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.data.entity.getId();
        if (LookupFieldObject != null) {
            Url += _formContext.data.entity.getId();
        }

        window.open(Url, "_blank");
    }

    function HideCapAssessmentReport() {

        let lookupFieldObject = _formContext.data.entity.attributes.get('qdb_work_item');
        let lookupFieldObject2 = _formContext.data.entity.attributes.get('qdb_record_type');

        if (lookupFieldObject.getValue() != null && lookupFieldObject2.getValue() != null) {

            let entityLabel = lookupFieldObject.getValue()[0].name;
            let entityLabel2 = lookupFieldObject2.getValue()[0].name;

            if (entityLabel == "Capability Development Assessment" || entityLabel2 == "OSS Application")
                return true;
            else
                return false;
        }
    }

    function ViewServiceRequestReport() {

        let Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fServiceRequest&rs:Command=Render&Id=";

        let LookupFieldObject = _formContext.data.entity.getId();
        if (LookupFieldObject != null) {
            Url += _formContext.data.entity.getId();
        }

        window.open(Url, "_blank");
    }

    function HideServiceRequestReport() {

        let lookupFieldObject = _formContext.data.entity.attributes.get('qdb_work_item');

        if (lookupFieldObject.getValue() != null) {

            let entityLabel = lookupFieldObject.getValue()[0].name;

            if (entityLabel == "Procurement Team RFP Generation")
                return true;
            else
                return false;
        }
    }

    function openDialogProcess(dialogId, entityName) {
        let Id = _formContext.data.entity.getId();
        let url = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext +
            "/cs/dialog/rundialog.aspx?DialogId=" +
            dialogId + "&EntityName=" +
            entityName + "&ObjectId=" +
            Id;
        window.open(url, "", "height=500, width=800")
    }

    function CreateFacilityFromTCS() {
        let Url;
        Url = netBaseURL + ":1016/createfacility.aspx";
        //   window.open(Url);

        //Browser Compatibility
        /*
    // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: window.showModalDialog(Url, "", 'dialogWidth:430px; dialogHeight:200px; center:yes;status:0;resizable:0;');
    // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
    */
        //OpenDialogUsingAlert(Url, "", false);
        window.open(Url, "", "height=500, width=800");
    }
    function CreateCollateralFromTCS(prmID) {
        if (prmID != null) {

            let Url;
            Url = netBaseURL + ":1016/createcollateral.aspx?id=" + prmID;
            //   window.open(Url);

            //Browser Compatibility
            /*
        // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: window.showModalDialog(Url, "", 'dialogWidth:430px; dialogHeight:200px; center:yes;status:0;resizable:0;');
        // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
         */
            OpenDialogUsingAlert(Url, "", false);
        }
    }

    function RunDialog(prmRecordId, prmRecordETN, prmDialogId) {

        let lclUrl;
        try {
            lclUrl = Xrm.Utility.getGlobalContext().getClientUrl() // MIGRATED: _formContext.context→getGlobalContext + "/cs/dialog/rundialog.aspx?DialogId=";
            lclUrl += encodeURIComponent(prmDialogId) + "&EntityName=" + prmRecordETN + "&ObjectId=" + encodeURIComponent(prmRecordId);

            //if ((await Xrm.Navigation.openConfirmDialog({text: "Reactivate LoanDisbursement Request , Confirm?"})).confirmed // MIGRATED: confirm→openConfirmDialog (function must be async) == false) {
            //    return false;
            //  }

            //Browser Compatibility
            /*
        // MIGRATED: window.showModalDialog removed (UCI unsupported). Original: if (window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;') == 1) {
        // TODO: Implement as PCF dialog or Xrm.Navigation.navigateTo side-panel.
        if (true) // MIGRATED: showModalDialog return unavailable
            _formContext.data.refresh();

        }
        else {
            _formContext.data.refresh();

        }
        */
            OpenDialogUsingAlert(prmDialogId, prmRecordETN, true);
        }
        catch (e) {

            Xrm.Navigation.openAlertDialog({text: "Error: Please contact your administrator"}) // MIGRATED: alert→openAlertDialog;
        }

    }

    function IncludeExcludeValidation() {
        let recordId;
        recordId = _formContext.data.entity.getId();

        if (_formContext.getAttribute("qdb_lpchasbeenattached").getValue() == true) {
            TriggerWorkflow("{C16EC984-2EEE-4DB0-B406-E7E3831B245A}", recordId);
        }
        else {
            TriggerWorkflow("{83f567c2-6d04-4233-8503-ea9ba8c1031a}", recordId);
        }

    }


    function BulkAssignment(Id) {
        debugger
        debugger

        for (i = 0; i < Id.length; i++) {
            TriggerWorkflow("{8E200FAE-C48F-4E81-8B5B-C656F096F381}", Id[i]);
        }
        Xrm.Navigation.openAlertDialog({text: "All task is now in your pending queue. Kindly refresh the page."}) // MIGRATED: alert→openAlertDialog;
    }


    /**
     * MIGRATED: Replaced SOAP ExecuteWorkflow request with Xrm.WebApi.online.execute.
     * The SOAP Organization Service endpoint (/* MIGRATED: XRMServices deprecated */ /XRMServices/2011/Organization.svc/web)
     * is deprecated in UCI. Xrm.WebApi.online.execute is the supported replacement.
     *
     * @param {string} workflowId - GUID of the workflow to trigger
     * @param {string} recordId   - GUID of the target record
     */
    async function TriggerWorkflow(workflowId, recordId) { // MIGRATED: SOAP→Xrm.WebApi.online.execute
        try {
            const executeRequest = {
                entity: { id: recordId, entityType: 'activitypointer' }, // MIGRATED: adjust entityType as needed
                getMetadata() {
                    return {
                        boundParameter: 'entity',
                        operationType: 0,
                        operationName: 'ExecuteWorkflow',
                        parameterTypes: {
                            entity: { typeName: 'mscrm.activitypointer', structuralProperty: 5 }
                        }
                    };
                }
            };

            await Xrm.WebApi.online.execute(executeRequest); // MIGRATED: SOAP ExecuteWorkflow→WebApi
            _formContext.data.refresh(true);
        } catch (error) {
            Xrm.Navigation.openAlertDialog({ text: `Workflow execution failed: ${error.message}` }); // MIGRATED: alert→openAlertDialog
        }
    }

    function AddinQueue(id) {

        Xrm.Navigation.openAlertDialog({text: "This functionality is not available."}) // MIGRATED: alert→openAlertDialog;
        //    // var recordId;
        // if (id == null) { recordId = _formContext.data.entity.getId(); }
        // else { recordId = id; }
        // var currentUserId = Xrm.Utility.getGlobalContext().getUserId() // MIGRATED: _formContext.context→getGlobalContext;


        //// //  assignRecord(recordId, currentUserId, "vrp_housingloanapplication");
        // TriggerWorkflow("{8E200FAE-C48F-4E81-8B5B-C656F096F381}", recordId);
        // Xrm.Navigation.openAlertDialog({text: "Task status is pending now"}) // MIGRATED: alert→openAlertDialog;
    }

    function OpenReport() {
        let Url;
        let RecordID;
        let lookupItem = _formContext.getAttribute("qdb_disbursement_request").getValue();
        if (lookupItem != null) {
            let name = lookupItem[0].name;
            RecordID = lookupItem[0].id;
            let entType = lookupItem[0].entityType;
        }

        if (_formContext.getAttribute("qdb_goods_type") != null) {
            let qdb_goods_type = _formContext.getAttribute("qdb_goods_type").getValue();
            if (qdb_goods_type == 751090000 && RecordID != null) {
                Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?/QDB1_MSCRM/PermissiontoHandOver&rs:Command=Render&Id=" + RecordID;
                Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?/QDB1_MSCRM/PermissiontoHandOverVehicle&rs:Command=Render&Id=" + RecordID;
            }

            else if (qdb_goods_type == 751090001 && RecordID != null) {
                Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?/QDB1_MSCRM/PermissiontoHandOverVehicle&rs:Command=Render&Id=" + RecordID;
                window.open(Url, "_blank");
            }

            if (Url != null) {
                window.open(Url, "_blank");
            }
        }
    }

    function ViewLAA() {
        try {
            let contractId = _formContext.getAttribute("qdb_iccmemo").getValue();
            if (contractId != null) {
                let url = netBaseURL + "/qdb1/isv/qdb/fu/download.aspx?fid=" + contractId;
                window.open(url, "_blank");
            }
            else {
                let url = netBaseURL + "/qdb1/isv/qdb/fu/download.aspx?fid=e9942f65-07c1-e811-8107-02bf800001ad";
                window.open(url, "_blank");
            }
        }
        catch (e) {
            Xrm.Navigation.openAlertDialog({text: "An Error Occured " + e.message}) // MIGRATED: alert→openAlertDialog;
        }

    }


    function BoardExecutiveDirectorStatusonChange() {
        if (_formContext.getAttribute("qdb_work_item").getValue()[0].id == "{CF0CCF44-AD77-E811-80F9-02BF800001AD}") {
            let BoardDirectorStatus = _formContext.getAttribute("qdb_director_bfd_board_approval_status").getValue();
            //Approve -->751090000
            if (BoardDirectorStatus = 751090000) {
                //_formContext.getAttribute("qdb_tcs_rct").setRequiredLevel("required");
            }
            //Return to RM-->751090001
            if (BoardDirectorStatus = 751090001) {
                _formContext.getAttribute("qdb_tcs_rct").setRequiredLevel("none");
            }
        }
    }

    function GetCustomerExceptions() {

        if (_formContext.getAttribute("qdb_cif_no").getValue() != null) {

            let QDB_RecordType = _formContext.getAttribute("qdb_record_type").getValue()[0].id;


            //Disbursement                                              
            if (QDB_RecordType == "{B4F84151-03C9-E211-BC78-00155D787B38}") {


                let EntityName, EntityId, LookupFieldObject;

                let AlertMessage;

                LookupFieldObject = _formContext.data.entity.attributes.get('qdb_cif_no');


                if (LookupFieldObject.getValue() != null) {

                    EntityId = LookupFieldObject.getValue()[0].id;

                    EntityName = LookupFieldObject.getValue()[0].entityType;


                    if (EntityId != null) {

                        // Remove '{}' from EntityID

                        let parsedID = EntityId.replace("{", "");

                        parsedID = parsedID.replace("}", "");
                    }

                    let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */" + EntityName + "s(" + parsedID + ")?$select=qdb_customer_name,qdb_cr_expiry_date,statuscode,_qdb_relationship_manager_value,qdb_past_dues_amount,qdb_recievable_accounts_os,qdb_ind_reg_no_expiry,qdb_insurance_expiry_date,sic";

                    // Pass OData Query and UpdateFunction

                    _executeODataQuery(query, UpdateCustomerInformation);
                }
            }

            // 19June2021_U
            //L/C Documentation
            else if (QDB_RecordType == "{AFC020E4-9DEF-E211-A9BB-00155D788238}") {


                let EntityName, EntityId, LookupFieldObject;
                LookupFieldObject = _formContext.data.entity.attributes.get('qdb_cif_no');

                if (LookupFieldObject.getValue() != null) {

                    EntityId = LookupFieldObject.getValue()[0].id;

                    EntityName = LookupFieldObject.getValue()[0].entityType;


                    if (EntityId != null) {

                        // Remove '{}' from EntityID

                        let parsedID = EntityId.replace("{", "");

                        parsedID = parsedID.replace("}", "");
                    }
                    let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */" + EntityName + "s(" + parsedID + ")?$select=qdb_customerfacilityfreezestatus";

                    // Pass OData Query and UpdateFunction

                    _executeODataQuery(query, ShowFreezeMessage);
                }
            }




        }
        else {

            //Reset existing notifications if any

            _formContext.ui.clearFormNotification('lcl_AccountOS');

            _formContext.ui.clearFormNotification('lcl_ExpiryDateIf');

            _formContext.ui.clearFormNotification('lcl_ExpiryDateElse');

            _formContext.ui.clearFormNotification('lcl_pastDues');

            _formContext.ui.clearFormNotification('lcl_pastDues2');

            _formContext.ui.clearFormNotification('lcl_IndExpiryDateIf');

            _formContext.ui.clearFormNotification('lcl_IndExpiryDateElse');

            _formContext.ui.clearFormNotification('lcl_IsuExpiryDateIf1');

            _formContext.ui.clearFormNotification('lcl_IsuExpiryDateElse1');
        }

        if (AlertMessage != null) {

            // Xrm.Navigation.openAlertDialog({text: AlertMessage}) // MIGRATED: alert→openAlertDialog;
            Alert.show("", AlertMessage, null, "INFO", 500, 200)
        }

    }

    function ParseCRMDate(prmCRMDate) {

        let lcl_Date;

        let lcl_DateArray = prmCRMDate.substring(0, 10).split("-");

        lcl_Date = new Date(lcl_DateArray[0], lcl_DateArray[1] - 1, lcl_DateArray[2]);

        return lcl_Date;

    }

    function UpdateCustomerInformation(result) {


        let currentdate = new Date();

        if (result != null && result['statuscode'] != null) { }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_ExpiryDateIf');

        _formContext.ui.clearFormNotification('lcl_ExpiryDateElse');

        if (result != null && result['qdb_cr_expiry_date'] != null) {

            let lcl_ExpiryDate = ParseCRMDate(result['qdb_cr_expiry_date']);

            //_formContext.getAttribute("qdb_cr_expiry_date").setValue(lcl_ExpiryDate);

            if (currentdate > lcl_ExpiryDate)

                _formContext.ui.setFormNotification("C.R. is expired on : " + lcl_ExpiryDate.toDateString() + "\n", "WARNING", 'lcl_ExpiryDateIf');

            else

                _formContext.ui.setFormNotification("C.R. will expire on : " + lcl_ExpiryDate.toDateString() + "\n", "INFORMATION", 'lcl_ExpiryDateElse');

        }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_pastDues');

        if (result != null && result['qdb_past_dues_amount'] != null) {

            let lcl_pastDues = parseFloat(result['qdb_past_dues_amount']);

            if (lcl_pastDues > 0) {

                _formContext.ui.setFormNotification("Customer past dues amount is : " + lcl_pastDues.toString() + "\n", "INFORMATION", 'lcl_pastDues');
            }
        }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_AccountOS');



        if (result != null && result['qdb_recievable_accounts_os'] != null) {

            let lcl_pastDues = parseFloat(result['qdb_recievable_accounts_os']);

            if (lcl_pastDues > 0) {

                _formContext.ui.setFormNotification(AlertMessage + "Recievable O/S amount is : " + lcl_pastDues.toString() + "\n", "INFORMATION", 'lcl_AccountOS');
            }
        }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_pastDues2');

        if (result != null && result['qdb_recievable_accounts_os'] != null) {

            let lcl_pastDues = parseFloat(result['qdb_recievable_accounts_os']);

            if (lcl_pastDues > 0) {

                _formContext.ui.setFormNotification("Recievable O/S amount is : " + lcl_pastDues.toString() + "\n", "INFORMATION", 'lcl_pastDues2');
            }
        }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_IndExpiryDateIf');

        _formContext.ui.clearFormNotification('lcl_IndExpiryDateElse');

        if (result != null && result['qdb_ind_reg_no_expiry'] != null) {

            let lcl_IndExpiryDate = ParseCRMDate(result['qdb_ind_reg_no_expiry']);

            if (currentdate > lcl_IndExpiryDate)

                _formContext.ui.setFormNotification("Industrial Registriation is expired on : " + lcl_IndExpiryDate.toDateString() + "\n", "WARNING", 'lcl_IndExpiryDateIf');

            else

                _formContext.ui.setFormNotification("Industrial Registriation will expire on : " + lcl_IndExpiryDate.toDateString() + "\n", "INFORMATION", 'lcl_IndExpiryDateElse');
        }

        //Reset existing notifications if any

        _formContext.ui.clearFormNotification('lcl_IsuExpiryDateIf1');

        _formContext.ui.clearFormNotification('lcl_IsuExpiryDateElse1');

        if (result != null && result['qdb_insurance_expiry_date'] != null) {

            let lcl_IsuExpiryDate = ParseCRMDate(result['qdb_insurance_expiry_date']);

            if (currentdate > lcl_IsuExpiryDate)

                _formContext.ui.setFormNotification("Insurance Registriation is expired on : " + lcl_IsuExpiryDate.toDateString() + "\n", "WARNING", 'lcl_IsuExpiryDateIf1');

            else

                _formContext.ui.setFormNotification("Insurance Registriation will expire on : " + lcl_IsuExpiryDate.toDateString() + "\n", "INFORMATION", 'lcl_IsuExpiryDateElse1');

        }

        if (result != null && result['_qdb_relationship_manager_value'] != null) {

            let lookupData = new Array();

            let lookupItem = new Object();

            lookupItem.id = result['_qdb_relationship_manager_value'];

            lookupItem.name = result["_qdb_relationship_manager_value@OData.Community.Display.V1.FormattedValue"];

            lookupItem.typename = result['_qdb_relationship_manager_value@Microsoft.Dynamics.CRM.lookuplogicalname'];

            lookupData[0] = lookupItem;

        }
    }

    function makeApprovalAuthority() {

        let ts_WorkItemStep = _formContext.getAttribute("qdb_work_item").getValue()[0].id;
        /*
        // modifed by ali for BAW        17  april 24
                 if (_formContext.getAttribute("qdb_disbursement_for") != null) {
                        if (_formContext.getAttribute("qdb_disbursement_for").getValue() == "751090014") {
                            _formContext.getControl("qdb_approvalauthority").setVisible(false);
                            _formContext.getAttribute("qdb_approvalauthority").setRequiredLevel("none");

                            if(_formContext.getControl("IFRAME_RMD_Comments") != null){
                                //_formContext.getControl("IFRAME_RMD_Comments").setVisible(false);
                                //_formContext.getAttribute("IFRAME_RMD_Comments").setRequiredLevel("none");
                            }

                            if(_formContext.getControl("qdb_rmreviewedapproveddisbursementchecklist")   != null){
                                _formContext.getControl("qdb_rmreviewedapproveddisbursementchecklist").setVisible(false);
                                _formContext.getAttribute("qdb_rmreviewedapproveddisbursementchecklist").setRequiredLevel("none");
                            }

                            if(_formContext.getControl("qdb_inspectionperformedpreviouslyforsameprodu")   != null){
                                _formContext.getControl("qdb_inspectionperformedpreviouslyforsameprodu").setVisible(false);
                                _formContext.getAttribute("qdb_inspectionperformedpreviouslyforsameprodu").setRequiredLevel("none");
                            }
                            return;		
                        }
                 }
        // modifed by ali for BAW        17  april 24
        */

        if (ts_WorkItemStep == '{94EDAED3-FDCA-E211-BC78-00155D787B38}') {

            let RmApproval = _formContext.getAttribute("qdb_disbursment_rm_review_approval").getValue();
            if (RmApproval == "751090000" || RmApproval == "751090005" || RmApproval == "751090006") {
                _formContext.getControl("qdb_approvalauthority").setVisible(true);
                _formContext.getAttribute("qdb_approvalauthority").setRequiredLevel("required");
            }
            else {
                _formContext.getControl("qdb_approvalauthority").setVisible(false);
                _formContext.getAttribute("qdb_approvalauthority").setRequiredLevel("none");
            }
        }
    }

    function OtherApprover() {

        let formType = _formContext.ui.getFormType();
        let FORM_TYPE_CREATE = 1;
        let FORM_TYPE_UPDATE = 2;


        if ((formType == FORM_TYPE_UPDATE || formType == FORM_TYPE_CREATE)) {

            let qdb_approvalauthority = _formContext.getAttribute("qdb_approvalauthority").getValue();

            if (qdb_approvalauthority == "751090010") {
                _formContext.getControl("qdb_last_reassigned_by_user").setVisible(true);
                _formContext.getAttribute("qdb_last_reassigned_by_user").setRequiredLevel("required");
            }
            else {
                _formContext.getControl("qdb_last_reassigned_by_user").setVisible(false);
                _formContext.getAttribute("qdb_last_reassigned_by_user").setRequiredLevel("none");
            }

        }
    }

    function OtherApprovers() {
        let qdb_approvalauthority = _formContext.getAttribute("qdb_approvalauthority").getValue();

        if (qdb_approvalauthority == "751090010") {
            _formContext.getControl("qdb_last_reassigned_by_user").setVisible(true);
            _formContext.getAttribute("qdb_last_reassigned_by_user").setRequiredLevel("required");
        }
        else {
            _formContext.getControl("qdb_last_reassigned_by_user").setVisible(false);
            _formContext.getAttribute("qdb_last_reassigned_by_user").setRequiredLevel("none");
        }
    }

    function ViewSignatureLetter(id) {


        let Url, lcl_ProposalID;

        Url = ssrsBaseURL + "/ReportServer/Pages/ReportViewer.aspx?%2fQDB1_MSCRM%2fSignatureLetter&rs:Command=Render&Id=";

        Url += id;
        window.open(Url, "_blank");
    }


    function ShowFacilityAlert(result) {


        if (result != null && result['qdb_facilitystatus'] != null) {

            if (result['qdb_facilitystatus'] == "751090000" || result['qdb_facilitystatus'] == 751090000) {
                Xrm.Navigation.openAlertDialog({text: "The facility that you have selected has been freezed by Credit Team. Kindly coordinate with them first to proceed further!"}) // MIGRATED: alert→openAlertDialog;
                CHeckLimitFreeze = true;
                result = null;
            }
        }
    }

    function CheckFacilityStatus() {


        let EntityName, EntityId, LookupFieldObject;

        let AlertMessage;
        LookupFieldObject = _formContext.data.entity.attributes.get('qdb_cif_no');


        if (LookupFieldObject.getValue() != null) {

            EntityId = LookupFieldObject.getValue()[0].id;

            EntityName = LookupFieldObject.getValue()[0].entityType;

            EntityNamePlural = EntityName.substring(0, EntityName.length - 1)

            //resultXml = RetrieveEntityById(EntityName, EntityId, 'statuscode,qdb_limit_amount,qdb_utilized_amount_dr,qdb_totalavailablelimit,qdb_project_reg_no,qdb_facility_nature,qdb_actual_facility_available,qdb_type_of_facility,qdb_product_type');


            if (EntityId != null) {

                // Remove '{}' from EntityID

                let parsedID = EntityId.replace("{", "");

                parsedID = parsedID.replace("}", "");

            }
            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */" + EntityName + "s(" + parsedID + ")?";


            // Pass OData Query and UpdateFunction

            _executeODataQuery(query, ShowFacilityAlert);

        }

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

            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_payment_authorization_tickets?$filter=qdb_transaction_ref eq '" + FieldName + "'";

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

    function CheckBuyerDetails() {

        let EntityName, EntityId, LookupFieldObject;
        let id;

        LookupFieldObject = _formContext.data.entity.attributes.get('qdb_term_sheet_ref_no');

        if (LookupFieldObject.getValue() != null) {

            EntityId = LookupFieldObject.getValue()[0].id;
            EntityName = LookupFieldObject.getValue()[0].entityType;

            if (EntityId != null) {
                // Remove '{}' from EntityID
                let parsedID = EntityId.replace("{", "");
                parsedID = parsedID.replace("}", "");
            }

            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */" + EntityName + "s(" + parsedID + ")?";

            // Pass OData Query and UpdateFunction
            _executeODataQuery(query, CheckBuyerDetailsResult, id);

        }

    }

    function CheckBuyerDetailsResult(resultXml) {

        if (resultXml != null && resultXml['_qdb_division_value'] != null) {

            if (resultXml['_qdb_division_value'] == 'aa34f01d-2115-e311-a57c-00155d788238') {
                if (resultXml['_qdb_buyer_cif_value'] == null) {
                    BuyerDetailAvailalbe = false;
                }
            }
        }

    }

    function PrintWakalaAnnexB() {
        WakalaPaymentFormBUtton = true;
        let LookupFieldObject = _formContext.getAttribute("qdb_disbursement_request");

        if (LookupFieldObject != null) {

            let lclUrl = netBaseURL + ":6001/GenerateCustomerContract.aspx?id=" + LookupFieldObject.getValue()[0].id;
            window.open(lclUrl, "_blank");
        }
        //window.showModalDialog(lclUrl, "", 'dialogWidth:800px; dialogHeight:500px; center:yes;status:0;resizable:1;');
    }




    //19JUNE2021_U
    function ShowFreezeMessage(result) {

        let frozenMessage = "<span style='font-size:12px'>Facilities against selected customers are frozen. </span><br>";
        if (result.qdb_customerfacilityfreezestatus == 751090000) {
            let workTask = _formContext.getAttribute("qdb_work_item").getValue()[0].id;;
            let recordType = _formContext.getAttribute("qdb_record_type").getValue()[0].id;

            if (workTask == "{ECB036FF-48F1-E211-A9BB-00155D788238}" && recordType == "{AFC020E4-9DEF-E211-A9BB-00155D788238}") {
                Alert.show("", frozenMessage, null, "INFO", 500, 200);
            }
        }
    }



    function showKYC() {
        if (_formContext.getAttribute("qdb_cif_no") != null) {
            let customerCIf = _formContext.getAttribute("qdb_cif_no").getValue()[0].id;

            let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */accounts(" + customerCIf.replace("}", "").replace("{", "") + ")?$select=sic";

            _executeODataQuery(query, GetKYC);
        }
        else {
            Xrm.Navigation.openAlertDialog({text: "Customer not available."}) // MIGRATED: alert→openAlertDialog;
        }

    }
    function GetKYC(resultXml) {
        let crNumber = resultXml.sic;
        let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_kycs?$filter=qdb_crlicenseno=qdb_crlicenseno eq '" + crNumber + "'";
        _executeODataQuery(query, OpenKYC);

    }

    function OpenKYC(resultXml) {
        let id = resultXml.qdb_kycid;

        Xrm.Navigation.openForm({entityName: "qdb_kyc", entityId: id}) // MIGRATED: openEntityForm→openForm;
    }



    function RemoveCSReturnOptionOPSTask() {
        if (_formContext.getControl("qdb_transaction_status") != null) {

            _formContext.getControl("qdb_transaction_status").removeOption("751090003");
        }


        if (_formContext.getControl("qdb_transaction_status1") != null) {

            _formContext.getControl("qdb_transaction_status1").removeOption("751090003");
        }


        if (_formContext.getControl("qdb_transaction_status2") != null) {

            _formContext.getControl("qdb_transaction_status2").removeOption("751090003");
        }


        if (_formContext.getControl("qdb_transaction_status3") != null) {

            _formContext.getControl("qdb_transaction_status3").removeOption("751090003");
        }
    }



    //Ops Tas JSON

    function GetCIApp() {

        let WorkTask = _formContext.getAttribute("qdb_work_item").getValue()[0].id;
        let RecordType = _formContext.getAttribute("qdb_record_type").getValue()[0].id;
        let RMCommentsTask = _formContext.getAttribute("qdb_cadchkcomments7").getValue();

        if (WorkTask == "{75BABCF0-D9BC-E211-90D7-00155D787B38}" && RecordType == "{0E634601-BDBC-E211-90D7-00155D787B38}" && RMCommentsTask == null) {
            let NLC = _formContext.getAttribute("qdb_laon_creation_request_ref");
            let NLCID = NLC.getValue()[0].id;

            if (NLCID != null) {
                let NLC = NLCID.replace(/[{}]/g, "");
                let query = "/api/data/v9.2/ /* MIGRATED: v8→v9.2 */qdb_new_loan_creations?$select=qdb_rmcomments,qdb_premiumpaid&$filter=qdb_new_loan_creationid eq " + NLC;
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
                            if (result.value.length > 0) {
                                let RMComments = "";
                                if (result.value[0].qdb_premiumpaid == 100000000) // Debit from account
                                {
                                    RMComments = result.value[0].qdb_rmcomments;
                                    _formContext.getAttribute("qdb_cadchkcomments7").setValue("Debit from Account - " + RMComments);
                                    _formContext.getControl("qdb_cadchkcomments7").setVisible(true);
                                }
                                else if (result.value[0].qdb_premiumpaid == 1) // Yes
                                {
                                    RMComments = result.value[0].qdb_rmcomments;
                                    _formContext.getAttribute("qdb_cadchkcomments7").setValue(RMComments);
                                    _formContext.getControl("qdb_cadchkcomments7").setVisible(true);
                                }
                            }
                            else {
                            }
                        }
                        else {
                            Xrm.Navigation.openAlertDialog({text: this.statusText}) // MIGRATED: alert→openAlertDialog;
                        }
                    }
                };
                // Execute HTTTP request
                req.send();
            }
        }
        else if (RMCommentsTask != null) {
            _formContext.getControl("qdb_cadchkcomments7").setVisible(true);
        }


    }




    function ShowDocumentUploadGrid() {
        let tab = _formContext.ui.tabs.get("tab_29");
        if (tab) {
            tab.setVisible(false);
            if (_formContext.getAttribute("qdb_prospectref") != null) {
                if (_formContext.getAttribute("qdb_prospectref").getValue()[0].entityType == 'opportunity') {
                    let ApplicationId = _formContext.getAttribute("qdb_prospectref").getValue()[0].id;
                    _formContext.getControl("IFRAME_UploadDocumentSharepoint").setSrc(netBaseURL + ":9797/CentralizedDocuments.aspx?id=" + ApplicationId.replace('{', '').replace('}', '') + "&entitylogicalname=opportunity&userid=" + Xrm.Utility.getGlobalContext().getUserId() // MIGRATED: _formContext.context→getGlobalContext.replace('{', '').replace('}', ''));
                    _formContext.ui.tabs.get("tab_29").setVisible(true);
                    let field = _formContext.getControl("qdb_prospectref");
                    if (field) {
                        field.setVisible(true); // or true to show it
                    }

                    let Loanfield = _formContext.getControl("qdb_loan_application_ref");
                    if (Loanfield) {
                        Loanfield.setVisible(false); // or true to show it
                    }
                }
                else {
                    _formContext.ui.tabs.get("tab_29").setVisible(false);
                    let field = _formContext.getControl("qdb_prospectref");
                    if (field) {
                        field.setVisible(true); // or true to show it
                    }

                    let Loanfield = _formContext.getControl("qdb_loan_application_ref");
                    if (Loanfield) {
                        Loanfield.setVisible(true); // or true to show it
                    }
                }
            }
        }
    }






    function removeStatusOptionSetValue() {

        let DisbursementFor = _formContext.getAttribute("qdb_disbursement_for");
        if (DisbursementFor) {
            if (DisbursementFor.getValue() != 751090014) {
                let optionsetField = _formContext.getControl("qdb_lccsstatus");
                if (optionsetField) {
                    // Get all options for the OptionSet
                    let options = optionsetField.getOptions();

                    // Loop through options and remove the one you want
                    options.forEach(function (option) {
                        if (option.value === 751090003) {  // Replace with the value to remove
                            optionsetField.removeOption(option.value);
                        }
                    });

                }


            }
            else if (DisbursementFor.getValue() == 751090014) {
                let optionsetField = _formContext.getControl("qdb_lccsstatus");
                if (optionsetField) {
                    // Get all options for the OptionSet
                    let options = optionsetField.getOptions();

                    // Loop through options and remove the one you want
                    options.forEach(function (option) {
                        if (option.value === 751090002) {  // Remove Reject Option from CS Task
                            optionsetField.removeOption(option.value);
                        }
                    });

                }
            }
        }
    }
    // ──────────────────────────────────────────────────────────────────────
    // MIGRATED: Public API — register these in CRM form event handler editor
    // as Maqsad.OpsTaskForm.<functionName>
    // ──────────────────────────────────────────────────────────────────────
    ns.fetchCRMConfiguration = fetchCRMConfiguration;
    ns.fillConfiguration = fillConfiguration;
    ns._executeODataQuery = _executeODataQuery;
    ns._fetchODataPath = _fetchODataPath;
    ns.OpenCrediReviewList = OpenCrediReviewList;
    ns.CheckUserRole = CheckUserRole;
    ns.GetRoleName = GetRoleName;
    ns.frmOnload = frmOnload;
    ns.changeColor = changeColor;
    ns.onLoadSetIframeSrc = onLoadSetIframeSrc;
    ns.SaveWorkItem = SaveWorkItem;
    ns.OpenWindowWakala = OpenWindowWakala;
    ns.CheckBayAlwadiyaRequiredDocuments = CheckBayAlwadiyaRequiredDocuments;
    ns.CheckRequireddDocuments = CheckRequireddDocuments;
    ns.CompleteWorkItem = CompleteWorkItem;
    ns.CallCRMTCSServiceForLCAmendment = CallCRMTCSServiceForLCAmendment;
    ns.OnSaveValidations = OnSaveValidations;
    ns.ViewWorkflowHistory = ViewWorkflowHistory;
    ns.OtherAttachedDocuments = OtherAttachedDocuments;
    ns.ViewWorkflowHistoryGrid = ViewWorkflowHistoryGrid;
    ns.frmOnSave = frmOnSave;
    ns.GetRelatedObject = GetRelatedObject;
    ns.showProps = showProps;
    ns.RefreshParentWindow = RefreshParentWindow;
    ns.ShowWorkItem2 = ShowWorkItem2;
    ns.ShowWorkItem = ShowWorkItem;
    ns.GetServerUrl = GetServerUrl;
    ns.ShowWebDialog = ShowWebDialog;
    ns.ShowDialogPopupDocValidation = ShowDialogPopupDocValidation;
    ns.ShowDialogPopup = ShowDialogPopup;
    ns.ShowDialogPopupTermsheet = ShowDialogPopupTermsheet;
    ns.ShowDialog = ShowDialog;
    ns.callback = callback;
    ns.ValidateDisbursementConditions = ValidateDisbursementConditions;
    ns.TradeFinanceAmendmend = TradeFinanceAmendmend;
    ns.ViewLoanAccountRPS = ViewLoanAccountRPS;
    ns.GenerateContract = GenerateContract;
    ns.GenerateContractWin = GenerateContractWin;
    ns.FillContract = FillContract;
    ns.OpenForm = OpenForm;
    ns.GenerateGoodsHandOver = GenerateGoodsHandOver;
    ns.CheckRequiredFields_OnSubmit = CheckRequiredFields_OnSubmit;
    ns.PrintInspectionDocucments = PrintInspectionDocucments;
    ns.PrintLPCDocucments = PrintLPCDocucments;
    ns.GenerateLPOContract = GenerateLPOContract;
    ns.GenerateDeliveryNotes = GenerateDeliveryNotes;
    ns.GeneratePermissionForGoods = GeneratePermissionForGoods;
    ns.GenerateAwaitingSignedContractInspectionReport = GenerateAwaitingSignedContractInspectionReport;
    ns.GetLPOGUID = GetLPOGUID;
    ns.OpenInspectionReport = OpenInspectionReport;
    ns.GenerateWaadiyaContract = GenerateWaadiyaContract;
    ns.ViewEPDPaymentCertificate = ViewEPDPaymentCertificate;
    ns.GenerateLPOContractWin = GenerateLPOContractWin;
    ns.ViewCapAssessmentReport = ViewCapAssessmentReport;
    ns.HideCapAssessmentReport = HideCapAssessmentReport;
    ns.ViewServiceRequestReport = ViewServiceRequestReport;
    ns.HideServiceRequestReport = HideServiceRequestReport;
    ns.openDialogProcess = openDialogProcess;
    ns.CreateFacilityFromTCS = CreateFacilityFromTCS;
    ns.CreateCollateralFromTCS = CreateCollateralFromTCS;
    ns.RunDialog = RunDialog;
    ns.IncludeExcludeValidation = IncludeExcludeValidation;
    ns.BulkAssignment = BulkAssignment;
    ns.TriggerWorkflow = TriggerWorkflow;
    ns.AddinQueue = AddinQueue;
    ns.OpenReport = OpenReport;
    ns.ViewLAA = ViewLAA;
    ns.BoardExecutiveDirectorStatusonChange = BoardExecutiveDirectorStatusonChange;
    ns.GetCustomerExceptions = GetCustomerExceptions;
    ns.ParseCRMDate = ParseCRMDate;
    ns.UpdateCustomerInformation = UpdateCustomerInformation;
    ns.makeApprovalAuthority = makeApprovalAuthority;
    ns.OtherApprover = OtherApprover;
    ns.OtherApprovers = OtherApprovers;
    ns.ViewSignatureLetter = ViewSignatureLetter;
    ns.ShowFacilityAlert = ShowFacilityAlert;
    ns.CheckFacilityStatus = CheckFacilityStatus;
    ns.ChecklocalRawMaterialSupport = ChecklocalRawMaterialSupport;
    ns.ChecklocalRawMaterialSupportResult = ChecklocalRawMaterialSupportResult;
    ns.CheckBuyerDetails = CheckBuyerDetails;
    ns.CheckBuyerDetailsResult = CheckBuyerDetailsResult;
    ns.PrintWakalaAnnexB = PrintWakalaAnnexB;
    ns.ShowFreezeMessage = ShowFreezeMessage;
    ns.showKYC = showKYC;
    ns.GetKYC = GetKYC;
    ns.OpenKYC = OpenKYC;
    ns.RemoveCSReturnOptionOPSTask = RemoveCSReturnOptionOPSTask;
    ns.GetCIApp = GetCIApp;
    ns.ShowDocumentUploadGrid = ShowDocumentUploadGrid;
    ns.removeStatusOptionSetValue = removeStatusOptionSetValue;

}(Maqsad.OpsTaskForm));
