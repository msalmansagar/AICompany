using System;
using System.Security.Cryptography;
using System.Text;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// Secure-link tokens (section 8, ADR-004): 256 random bits, Base64URL, no business data. Only
    /// the SHA-256 hash is stored (qdb_token_hash); the plaintext exists only in the link sent to the
    /// customer and is never persisted or logged.
    /// </summary>
    public static class LinkToken
    {
        private const int TokenBytes = 32;

        /// <summary>A new unguessable token, about 43 URL-safe characters.</summary>
        public static string Generate()
        {
            var bytes = new byte[TokenBytes];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(bytes);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        /// <summary>The lowercase hex SHA-256 of the token as sent, which is what qdb_token_hash holds.</summary>
        public static string Hash(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("A token is required.", nameof(token));
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(token.Trim()));
                var builder = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) builder.Append(b.ToString("x2"));
                return builder.ToString();
            }
        }
    }
}
