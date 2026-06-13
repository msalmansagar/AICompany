// Models/StepAssignment.cs
using Newtonsoft.Json;

namespace Qdb.WorkflowDesigner.Plugins.Models
{
    /// <summary>
    /// JSON-deserialisable model for per-step assignment config from the wizard.
    /// Validated before use — all GUIDs parsed with Guid.TryParse.
    /// CamelCasePropertyNamesContractResolver handles property-name mapping.
    /// </summary>
    internal sealed class StepAssignment
    {
        [JsonProperty("sopStepId")]
        public string SopStepId { get; set; } = string.Empty;

        [JsonProperty("taskSubject")]
        public string TaskSubject { get; set; } = string.Empty;

        [JsonProperty("assignToType")]
        public int? AssignToType { get; set; }

        [JsonProperty("assignedUserId")]
        public string? AssignedUserId { get; set; }

        [JsonProperty("teamId")]
        public string? TeamId { get; set; }

        [JsonProperty("enableRoundRobin")]
        public bool EnableRoundRobin { get; set; }

        [JsonProperty("roundRobinTeamId")]
        public string? RoundRobinTeamId { get; set; }
    }
}
