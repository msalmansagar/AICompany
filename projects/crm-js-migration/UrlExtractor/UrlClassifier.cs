namespace Maqsad.CrmJsUrlExtractor;

/// <summary>
/// Classifies a raw URL string into a <see cref="UrlCategory"/>
/// based on its path structure.
/// </summary>
public static class UrlClassifier
{
    public static UrlCategory Classify(string url)
    {
        if (url.Contains("/api/data/", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.ODataApi;

        if (url.Contains("/ReportServer/", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.SsrsReport;

        if (url.Contains("/XRMServices/2011/OrganizationData", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.ODataV1OrganizationData;

        if (url.Contains("/XRMServices/", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.SoapOrganizationService;

        if (url.Contains("/cs/dialog/", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.CrmDialog;

        if (url.Contains("/main.aspx", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.CrmNavigation;

        if (url.Contains("/WebResources/", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.WebResource;

        if (url.Contains("sharepoint", StringComparison.OrdinalIgnoreCase)
            || url.Contains("DisbursementDocuments", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.SharePoint;

        if (url.StartsWith("http://schemas.", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("http://www.w3.org", StringComparison.OrdinalIgnoreCase)
            || url.Contains("xmlsoap.org", StringComparison.OrdinalIgnoreCase)
            || url.Contains("datacontract.org", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.SoapNamespace;

        // Ports like :6001, :9798, :9797, :1016, :6565 indicate custom ASP.NET apps
        if (System.Text.RegularExpressions.Regex.IsMatch(url, @":\d{4,5}/"))
            return UrlCategory.CustomWebApplication;

        if (url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            return UrlCategory.Absolute;

        return UrlCategory.RelativePath;
    }
}
