namespace Maqsad.CrmJsUrlExtractor;

/// <summary>
/// Represents a single URL discovered in a CRM JavaScript web resource.
/// </summary>
public sealed record UrlRecord(
    string LibraryName,
    string FilePath,
    int    LineNumber,
    string Url,
    UrlCategory Category,
    bool   IsInComment,
    string RawLine
);

/// <summary>
/// Classifies the purpose of a URL found in a CRM JavaScript file.
/// </summary>
public enum UrlCategory
{
    ODataApi,
    SsrsReport,
    SoapOrganizationService,
    ODataV1OrganizationData,
    CrmDialog,
    CrmNavigation,
    WebResource,
    CustomWebApplication,
    SharePoint,
    SoapNamespace,
    Absolute,
    RelativePath
}
