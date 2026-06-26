using System;
using System.Security.Cryptography;
using System.Text;

namespace Qdb.FormEngine.Core.Hashing
{
    /// <summary>
    /// Provides SHA-256 hashing for integrity verification of cached form JSON payloads.
    /// Used to detect whether a cache entry has been tampered with or corrupted.
    /// </summary>
    public static class HashService
    {
        /// <summary>
        /// Computes a SHA-256 hash of the supplied byte array and returns
        /// it as a lowercase hexadecimal string.
        /// </summary>
        /// <param name="data">The byte array to hash.</param>
        /// <returns>A 64-character lowercase hex string representing the SHA-256 digest.</returns>
        /// <exception cref="ArgumentNullException">Thrown when <paramref name="data"/> is null.</exception>
        public static string ComputeSha256Hex(byte[] data)
        {
            if (data == null) throw new ArgumentNullException("data");

            using (var sha256 = SHA256.Create())
            {
                var hashBytes = sha256.ComputeHash(data);
                var builder = new StringBuilder(hashBytes.Length * 2);
                foreach (var b in hashBytes)
                    builder.AppendFormat("{0:x2}", b);
                return builder.ToString();
            }
        }
    }
}
