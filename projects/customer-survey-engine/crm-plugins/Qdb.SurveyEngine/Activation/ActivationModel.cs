using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Qdb.SurveyEngine.Activation
{
    /// <summary>A source as activation needs it (phase-3-arch.md section 6.1, FR-CSE-003).</summary>
    public sealed class ActivationSource
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public string TableLogicalName { get; set; }
        public string StatusField { get; set; } = "statuscode";
        public string TypeField { get; set; }
        public IReadOnlyList<StepRegistration> Registrations { get; set; } = new StepRegistration[0];
    }

    /// <summary>One plugin step activation enabled, and whether activation created it (so deactivation deletes it).</summary>
    [DataContract]
    public sealed class StepRegistration
    {
        [DataMember(Name = "message", Order = 1)] public string Message { get; set; }
        [DataMember(Name = "stepId", Order = 2)] public Guid StepId { get; set; }
        [DataMember(Name = "created", Order = 3)] public bool WasCreatedByActivation { get; set; }

        /// <summary>The qdb_step_registration_json text for these registrations.</summary>
        public static string ToJson(IEnumerable<StepRegistration> registrations)
        {
            var serializer = new DataContractJsonSerializer(typeof(StepRegistration[]));
            using (var stream = new MemoryStream())
            {
                serializer.WriteObject(stream, registrations.ToArray());
                return Encoding.UTF8.GetString(stream.ToArray());
            }
        }

        /// <summary>Parses qdb_step_registration_json; blank means nothing was registered.</summary>
        public static IReadOnlyList<StepRegistration> FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new StepRegistration[0];
            var serializer = new DataContractJsonSerializer(typeof(StepRegistration[]));
            using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
            {
                return (StepRegistration[])serializer.ReadObject(stream);
            }
        }
    }

    /// <summary>A registered plugin step as the registry reports it.</summary>
    public sealed class RegisteredStep
    {
        public Guid Id { get; set; }
        public bool IsEnabled { get; set; }
        public string FilteringAttributes { get; set; }
        public string PreImageAttributes { get; set; }
    }

    /// <summary>The step activation wants for one message on one table.</summary>
    public sealed class StepSpec
    {
        public StepSpec(string message, string table, string statusField)
        {
            Message = message;
            Table = table;
            StatusField = statusField;
        }

        public string Message { get; }
        public string Table { get; }
        public string StatusField { get; }

        /// <summary>Update is filtered to the status field and carries it in the pre-image; Create has neither.</summary>
        public bool IsUpdate => Message == "Update";
    }

    /// <summary>The status and type codes one trigger is configured with, for validation against metadata.</summary>
    public sealed class TriggerCodes
    {
        public string TriggerName { get; set; }
        public IReadOnlyList<string> StatusCodes { get; set; } = new string[0];
        public IReadOnlyList<string> TypeCodes { get; set; } = new string[0];
    }

    /// <summary>Activation was refused; the message says why and is shown to the caller.</summary>
    public sealed class ActivationRefusedException : Exception
    {
        public ActivationRefusedException(string message) : base(message) { }
    }
}
