using System;
using System.Collections.Generic;

namespace Qdb.SurveyEngine.Activation
{
    /// <summary>Reads and saves a source's activation state.</summary>
    public interface IActivationSourceStore
    {
        /// <summary>The source, or null when no source has this id.</summary>
        ActivationSource Find(Guid sourceId);

        /// <summary>Sets qdb_is_active and qdb_step_registration_json together.</summary>
        void SaveActivation(Guid sourceId, bool isActive, IReadOnlyList<StepRegistration> registrations);

        /// <summary>Status and type codes of every trigger that uses this source.</summary>
        IReadOnlyList<TriggerCodes> GetTriggerCodes(Guid sourceId);
    }

    /// <summary>Finds, creates, enables, disables and deletes SurveyTriggerPlugin steps.</summary>
    public interface IStepRegistry
    {
        /// <summary>True when the table supports the message (it exists and is not read-only).</summary>
        bool SupportsMessage(string table, string message);

        /// <summary>The SurveyTriggerPlugin step for this message and table, or null.</summary>
        RegisteredStep Find(StepSpec spec);

        /// <summary>Creates the step (and Update pre-image), enabled; answers its id.</summary>
        Guid Create(StepSpec spec);

        /// <summary>Points an existing Update step's filter and pre-image at the spec's status field.</summary>
        void Reconfigure(Guid stepId, StepSpec spec);

        void SetEnabled(Guid stepId, bool isEnabled);

        void Delete(Guid stepId);
    }

    /// <summary>Answers whether a user may activate sources.</summary>
    public interface IAdministratorCheck
    {
        bool IsSystemAdministrator(Guid userId);
    }

    /// <summary>Reads the valid codes of a choice, status or Yes/No column from metadata (FR-CSE-004).</summary>
    public interface IOptionCodeReader
    {
        /// <summary>The column's codes as text, or null when the column is not a choice-like column.</summary>
        IReadOnlyCollection<string> ReadCodes(string table, string column);
    }
}
