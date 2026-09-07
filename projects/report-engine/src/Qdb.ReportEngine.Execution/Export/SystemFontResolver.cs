using PdfSharp.Fonts;

namespace Qdb.ReportEngine.Execution.Export;

/// <summary>
/// Supplies a sans-serif font to PDFsharp/MigraDoc from common OS font paths (Windows/Linux/macOS).
/// V1 relies on a system font; bundling an embedded open font for fully self-contained rendering is
/// a hardening follow-up (ADR-RPT-009). Registered once via <see cref="EnsureRegistered"/>.
/// </summary>
internal sealed class SystemFontResolver : IFontResolver
{
    private const string Regular = "regular";
    private const string Bold = "bold";

    private static readonly string[] RegularPaths =
    [
        @"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/Library/Fonts/Arial.ttf"
    ];

    private static readonly string[] BoldPaths =
    [
        @"C:\Windows\Fonts\arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf"
    ];

    private static readonly object Gate = new();
    private static bool _registered;

    /// <summary>Installs this resolver as the global font resolver once.</summary>
    public static void EnsureRegistered()
    {
        if (_registered)
        {
            return;
        }

        lock (Gate)
        {
            if (_registered)
            {
                return;
            }

            GlobalFontSettings.FontResolver = new SystemFontResolver();
            _registered = true;
        }
    }

    /// <inheritdoc />
    public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic) =>
        new(isBold ? Bold : Regular);

    /// <inheritdoc />
    public byte[]? GetFont(string faceName)
    {
        var candidates = faceName == Bold ? BoldPaths : RegularPaths;
        return ReadFirstAvailable(candidates)
            ?? ReadFirstAvailable(RegularPaths)
            ?? throw new FileNotFoundException("No system sans-serif font found for PDF rendering.");
    }

    private static byte[]? ReadFirstAvailable(IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            if (File.Exists(path))
            {
                return File.ReadAllBytes(path);
            }
        }

        return null;
    }
}
