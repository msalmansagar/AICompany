using System;
using System.Collections.Generic;
using System.Linq;

namespace Qdb.SurveyEngine.Activation
{
    /// <summary>
    /// Activates and deactivates a survey source (A3, FR-CSE-002, 003). Activation enables the
    /// source's SurveyTriggerPlugin steps, creating them for a source added after deployment, and
    /// records what it did so deactivation reverses exactly that. System Administrator only.
    /// </summary>
    public sealed class SourceActivationService
    {
        private static readonly string[] Messages = { "Create", "Update" };
        private readonly ActivationDependencies _deps;

        public SourceActivationService(ActivationDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            if (_deps.Sources == null || _deps.Steps == null || _deps.Administrators == null || _deps.OptionCodes == null)
                throw new ArgumentException("Every ActivationDependencies member is required.", nameof(dependencies));
        }

        /// <summary>Activates the source and answers a summary for the caller.</summary>
        /// <exception cref="ActivationRefusedException">Not an administrator, unknown source or table, or unknown trigger codes.</exception>
        public string Activate(Guid sourceId, Guid callerId)
        {
            var source = LoadForAdministrator(sourceId, callerId);
            EnsureTableSupportsSteps(source);
            EnsureTriggerCodesExist(source);
            var registrations = Messages.Select(message => EnableStep(new StepSpec(message, source.TableLogicalName, source.StatusField))).ToList();
            _deps.Sources.SaveActivation(source.Id, true, registrations);
            var created = registrations.Count(r => r.WasCreatedByActivation);
            return $"Source {source.Name} is active: {registrations.Count} steps enabled ({created} created, {registrations.Count - created} reused).";
        }

        /// <summary>Deactivates the source: deletes the steps activation created, disables the rest.</summary>
        /// <exception cref="ActivationRefusedException">Not an administrator, or unknown source.</exception>
        public string Deactivate(Guid sourceId, Guid callerId)
        {
            var source = LoadForAdministrator(sourceId, callerId);
            var registrations = source.Registrations.Count > 0 ? source.Registrations : FindExistingSteps(source);
            foreach (var registration in registrations) RemoveStep(registration);
            _deps.Sources.SaveActivation(source.Id, false, new StepRegistration[0]);
            return $"Source {source.Name} is inactive: {registrations.Count(r => r.WasCreatedByActivation)} steps deleted, {registrations.Count(r => !r.WasCreatedByActivation)} disabled.";
        }

        private ActivationSource LoadForAdministrator(Guid sourceId, Guid callerId)
        {
            if (!_deps.Administrators.IsSystemAdministrator(callerId))
                throw new ActivationRefusedException("Only a System Administrator can activate or deactivate a survey source (FR-CSE-003).");
            return _deps.Sources.Find(sourceId) ?? throw new ActivationRefusedException($"No survey source has id {sourceId:D}.");
        }

        private void EnsureTableSupportsSteps(ActivationSource source)
        {
            var unsupported = Messages.Where(message => !_deps.Steps.SupportsMessage(source.TableLogicalName, message)).ToList();
            if (unsupported.Count > 0)
                throw new ActivationRefusedException($"Table {source.TableLogicalName} does not exist on this org or does not support {string.Join(" and ", unsupported)}.");
        }

        private void EnsureTriggerCodesExist(ActivationSource source)
        {
            var valid = new ValidSourceCodes
            {
                Status = _deps.OptionCodes.ReadCodes(source.TableLogicalName, source.StatusField),
                Type = string.IsNullOrWhiteSpace(source.TypeField) ? null : _deps.OptionCodes.ReadCodes(source.TableLogicalName, source.TypeField),
            };
            var problems = TriggerCodeValidator.FindUnknownCodes(_deps.Sources.GetTriggerCodes(source.Id), valid);
            if (problems.Count > 0) throw new ActivationRefusedException("Fix these trigger codes before activating:\n" + string.Join("\n", problems));
        }

        // Reuses a pre-registered step (the three seed sources) and creates one only for a source added later.
        private StepRegistration EnableStep(StepSpec spec)
        {
            var existing = _deps.Steps.Find(spec);
            if (existing == null) return new StepRegistration { Message = spec.Message, StepId = _deps.Steps.Create(spec), WasCreatedByActivation = true };
            if (spec.IsUpdate && !IsConfiguredFor(existing, spec)) _deps.Steps.Reconfigure(existing.Id, spec);
            if (!existing.IsEnabled) _deps.Steps.SetEnabled(existing.Id, true);
            return new StepRegistration { Message = spec.Message, StepId = existing.Id, WasCreatedByActivation = false };
        }

        private static bool IsConfiguredFor(RegisteredStep step, StepSpec spec) =>
            string.Equals(step.FilteringAttributes, spec.StatusField, StringComparison.OrdinalIgnoreCase)
            && string.Equals(step.PreImageAttributes, spec.StatusField, StringComparison.OrdinalIgnoreCase);

        // A source activated outside this API (no record) still has its pre-registered steps turned off.
        private IReadOnlyList<StepRegistration> FindExistingSteps(ActivationSource source) =>
            Messages.Select(message => _deps.Steps.Find(new StepSpec(message, source.TableLogicalName, source.StatusField)))
                .Where(step => step != null)
                .Select(step => new StepRegistration { StepId = step.Id, WasCreatedByActivation = false })
                .ToList();

        private void RemoveStep(StepRegistration registration)
        {
            if (registration.WasCreatedByActivation) _deps.Steps.Delete(registration.StepId);
            else _deps.Steps.SetEnabled(registration.StepId, false);
        }
    }

    /// <summary>Collaborators of <see cref="SourceActivationService"/>.</summary>
    public sealed class ActivationDependencies
    {
        public IActivationSourceStore Sources { get; set; }
        public IStepRegistry Steps { get; set; }
        public IAdministratorCheck Administrators { get; set; }
        public IOptionCodeReader OptionCodes { get; set; }
    }
}
