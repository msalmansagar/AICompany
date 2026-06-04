using Maqsad.CrmJsUrlExtractor;

// ─────────────────────────────────────────────────────────────────────────────
// CRM JavaScript URL Extractor
// Usage: CrmJsUrlExtractor <js-directory> [output.xlsx]
//
// Scans all .js files recursively, extracts every URL reference,
// and exports the results to Excel with category classification.
// ─────────────────────────────────────────────────────────────────────────────

if (args.Length == 0)
{
    PrintUsage();
    return 1;
}

string scanDirectory = args[0];
string outputPath    = args.Length > 1
    ? args[1]
    : Path.Combine(Directory.GetCurrentDirectory(), "CrmUrlInventory.xlsx");

if (!Directory.Exists(scanDirectory))
{
    Console.Error.WriteLine($"[ERROR] Directory not found: {scanDirectory}");
    return 1;
}

try
{
    Console.WriteLine($"Scanning: {scanDirectory}");

    JsUrlExtractor extractor = new();
    List<UrlRecord> records  = extractor
        .ExtractFromDirectory(scanDirectory)
        .OrderBy(r => r.LibraryName)
        .ThenBy(r => r.LineNumber)
        .ToList();

    if (records.Count == 0)
    {
        Console.WriteLine("No URLs found.");
        return 0;
    }

    PrintConsoleSummary(records);

    Console.WriteLine($"\nExporting {records.Count} records to: {outputPath}");
    ExcelExporter exporter = new();
    exporter.Export(records, outputPath);

    Console.WriteLine("Done.");
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[ERROR] {ex.Message}");
    return 1;
}

// ── Local functions ───────────────────────────────────────────────────────────

static void PrintConsoleSummary(List<UrlRecord> records)
{
    Console.WriteLine($"\nFound {records.Count} URL references across {records.Select(r => r.LibraryName).Distinct().Count()} library(ies):\n");

    IEnumerable<IGrouping<UrlCategory, UrlRecord>> byCategory = records
        .GroupBy(r => r.Category)
        .OrderByDescending(g => g.Count());

    foreach (IGrouping<UrlCategory, UrlRecord> group in byCategory)
    {
        int liveCount    = group.Count(r => !r.IsInComment);
        int commentCount = group.Count(r => r.IsInComment);
        Console.WriteLine($"  {group.Key,-30} {group.Count(),4} total  ({liveCount} live, {commentCount} in comments)");
    }
}

static void PrintUsage()
{
    Console.WriteLine("CRM JavaScript URL Extractor");
    Console.WriteLine("Usage: CrmJsUrlExtractor <js-directory> [output.xlsx]");
    Console.WriteLine();
    Console.WriteLine("  js-directory   Directory to scan recursively for .js files");
    Console.WriteLine("  output.xlsx    Output Excel file (default: CrmUrlInventory.xlsx)");
    Console.WriteLine();
    Console.WriteLine("Example:");
    Console.WriteLine("  CrmJsUrlExtractor C:\\CrmWebResources\\js  C:\\Reports\\UrlInventory.xlsx");
}
