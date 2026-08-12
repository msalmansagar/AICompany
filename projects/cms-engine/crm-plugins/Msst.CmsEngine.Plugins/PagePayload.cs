using System;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>
    /// Encodes and decodes the stored form of a page payload: gzip, then Base64.
    /// </summary>
    /// <remarks>
    /// ADR-CMS-001 stores both the version and the render cache this way, in Memo
    /// columns, on cloud and on-premise alike. Base64 inflates by 4/3, so the
    /// stored length — not the compressed length — is what the size gate measures.
    /// </remarks>
    public static class PagePayload
    {
        /// <summary>Dataverse Memo maximum, in characters.</summary>
        public const int MemoLimit = 1048576;

        /// <summary>Above this share of the limit the author is warned.</summary>
        public const double WarnThreshold = 0.60;

        /// <summary>Above this share of the limit the publish is rejected.</summary>
        public const double RejectThreshold = 0.90;

        /// <summary>Compresses JSON to its stored representation.</summary>
        public static string Encode(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));

            var raw = Encoding.UTF8.GetBytes(json);
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionMode.Compress, true))
                {
                    gzip.Write(raw, 0, raw.Length);
                }
                return Convert.ToBase64String(output.ToArray());
            }
        }

        /// <summary>Restores JSON from its stored representation.</summary>
        public static string Decode(string stored)
        {
            if (string.IsNullOrEmpty(stored)) throw new ArgumentNullException(nameof(stored));

            var compressed = Convert.FromBase64String(stored);
            using (var input = new MemoryStream(compressed))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var output = new MemoryStream())
            {
                gzip.CopyTo(output);
                return Encoding.UTF8.GetString(output.ToArray());
            }
        }

        /// <summary>Answers what share of the Memo limit a stored payload occupies.</summary>
        public static double ShareOfLimit(string stored)
        {
            if (stored == null) throw new ArgumentNullException(nameof(stored));
            return (double)stored.Length / MemoLimit;
        }
    }
}
