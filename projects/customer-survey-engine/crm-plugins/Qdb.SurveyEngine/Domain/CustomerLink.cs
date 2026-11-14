using System;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>qdb_survey_settings.qdb_customer_table: which CRM table holds this org's customers.</summary>
    public enum CustomerTable
    {
        Account = 100000000,
        Contact = 100000001,
    }

    /// <summary>
    /// Where a customer lives and which lookup column carries them on the survey tables (B9, on-prem
    /// finding F1): the cloud org and BFD/QDB1 keep corporate customers as accounts, HL CRM keeps
    /// individuals as contacts. Invitation, response and suppression log have one lookup per table;
    /// the org's setting decides which one the engine reads and writes.
    /// </summary>
    public sealed class CustomerLink
    {
        public static readonly CustomerLink Account = new CustomerLink(CustomerTable.Account, "account", "qdb_customer_id");
        public static readonly CustomerLink Contact = new CustomerLink(CustomerTable.Contact, "contact", "qdb_customer_contact_id");

        private CustomerLink(CustomerTable table, string tableLogicalName, string lookupColumn)
        {
            Table = table;
            TableLogicalName = tableLogicalName;
            LookupColumn = lookupColumn;
        }

        public CustomerTable Table { get; }

        /// <summary>account or contact.</summary>
        public string TableLogicalName { get; }

        /// <summary>The lookup on invitation, response and suppression log that points at this table.</summary>
        public string LookupColumn { get; }

        /// <summary>The link for a setting value; an unset setting means account, the original behaviour.</summary>
        public static CustomerLink For(CustomerTable? table) => table == CustomerTable.Contact ? Contact : Account;

        public override string ToString() => TableLogicalName;
    }
}
