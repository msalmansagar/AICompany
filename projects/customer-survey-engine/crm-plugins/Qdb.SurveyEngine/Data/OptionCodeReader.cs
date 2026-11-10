using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Qdb.SurveyEngine.Activation;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads choice, status and Yes/No codes from attribute metadata (FR-CSE-004).</summary>
    public sealed class OptionCodeReader : IOptionCodeReader
    {
        private readonly IOrganizationService _service;

        public OptionCodeReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyCollection<string> ReadCodes(string table, string column)
        {
            var response = (RetrieveAttributeResponse)_service.Execute(new RetrieveAttributeRequest { EntityLogicalName = table, LogicalName = column });
            if (response.AttributeMetadata is EnumAttributeMetadata choice)
                return choice.OptionSet.Options.Where(o => o.Value.HasValue).Select(o => o.Value.Value.ToString()).ToList();
            return response.AttributeMetadata is BooleanAttributeMetadata ? new[] { "true", "false" } : null;
        }
    }
}
