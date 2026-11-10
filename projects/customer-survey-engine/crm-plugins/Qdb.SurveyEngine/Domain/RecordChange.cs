using System;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>The CRM message that changed a source record.</summary>
    public enum ChangeMessage
    {
        Create,
        Update,
    }

    /// <summary>
    /// What happened to one source record, as the trigger rules need it. Codes are text so
    /// option sets, Yes/No fields and text fields compare the same way (see <see cref="CodeList"/>).
    /// </summary>
    public sealed class RecordChange
    {
        public ChangeMessage Message { get; set; }
        public string TableLogicalName { get; set; }
        public Guid RecordId { get; set; }

        /// <summary>Status before the save; null on Create or when it was empty.</summary>
        public string OldStatus { get; set; }

        public string NewStatus { get; set; }
        public string Type { get; set; }
        public string Origin { get; set; }

        /// <summary>The account the request belongs to; null when the lookup is empty.</summary>
        public Guid? CustomerId { get; set; }
    }
}
