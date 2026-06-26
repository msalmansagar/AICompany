using System;
using System.IO;
using System.IO.Compression;

namespace Qdb.FormEngine.Core.Serialization
{
    /// <summary>
    /// Provides GZip compression and decompression of byte arrays.
    /// Used to reduce the size of cached form JSON before writing to the file column.
    /// </summary>
    public static class GzipCompressor
    {
        /// <summary>
        /// Compresses <paramref name="data"/> using GZip compression.
        /// </summary>
        /// <param name="data">The raw byte array to compress.</param>
        /// <returns>A GZip-compressed byte array.</returns>
        /// <exception cref="ArgumentNullException">Thrown when <paramref name="data"/> is null.</exception>
        public static byte[] Compress(byte[] data)
        {
            if (data == null) throw new ArgumentNullException("data");

            using (var outputStream = new MemoryStream())
            {
                using (var gzipStream = new GZipStream(outputStream, CompressionMode.Compress, leaveOpen: true))
                {
                    gzipStream.Write(data, 0, data.Length);
                }
                return outputStream.ToArray();
            }
        }

        /// <summary>
        /// Decompresses a GZip-compressed byte array back to its original form.
        /// </summary>
        /// <param name="data">The GZip-compressed byte array to decompress.</param>
        /// <returns>The decompressed byte array.</returns>
        /// <exception cref="ArgumentNullException">Thrown when <paramref name="data"/> is null.</exception>
        public static byte[] Decompress(byte[] data)
        {
            if (data == null) throw new ArgumentNullException("data");

            using (var inputStream = new MemoryStream(data))
            using (var gzipStream = new GZipStream(inputStream, CompressionMode.Decompress))
            using (var outputStream = new MemoryStream())
            {
                gzipStream.CopyTo(outputStream);
                return outputStream.ToArray();
            }
        }
    }
}
