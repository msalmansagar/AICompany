using System;

namespace Qdb.ReportEngine.CrmPlugin.Model
{
    /// <summary>The output the caller asked for. <see cref="Run"/> returns JSON rows; the rest are files.</summary>
    internal enum ReportFormat
    {
        Run,
        Pdf,
        Xlsx,
        Docx,
        Csv,
        Png
    }

    internal static class ReportFormatExtensions
    {
        /// <summary>Parses the caller's <c>format</c> string; defaults to <see cref="ReportFormat.Run"/>.</summary>
        public static ReportFormat Parse(string format)
        {
            if (string.IsNullOrWhiteSpace(format))
            {
                return ReportFormat.Run;
            }

            switch (format.Trim().ToUpperInvariant())
            {
                case "PDF": return ReportFormat.Pdf;
                case "XLSX": return ReportFormat.Xlsx;
                case "DOCX": return ReportFormat.Docx;
                case "CSV": return ReportFormat.Csv;
                case "PNG": return ReportFormat.Png;
                case "RUN": return ReportFormat.Run;
                default: throw new ArgumentException("Unsupported report format: " + format);
            }
        }

        /// <summary>Maps to the middle-tier export query value (<c>?format=</c>). Not valid for <see cref="ReportFormat.Run"/>.</summary>
        public static string ToExportQueryValue(this ReportFormat format)
        {
            switch (format)
            {
                case ReportFormat.Pdf: return "pdf";
                case ReportFormat.Xlsx: return "excel";
                case ReportFormat.Docx: return "word";
                case ReportFormat.Csv: return "csv";
                case ReportFormat.Png: return "image";
                default: throw new InvalidOperationException("Run is not an export format.");
            }
        }

        public static bool IsExport(this ReportFormat format) => format != ReportFormat.Run;
    }
}
