using System.Text;
using Qdb.FormEngine.Core.Serialization;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="GzipCompressor"/>.
    /// </summary>
    public sealed class GzipCompressorTests
    {
        [Fact]
        public void Compress_ThenDecompress_ReturnsOriginalData()
        {
            // Arrange
            var original = Encoding.UTF8.GetBytes("Hello, World! This is a test payload for GZip round-trip verification.");

            // Act
            var compressed = GzipCompressor.Compress(original);
            var decompressed = GzipCompressor.Decompress(compressed);

            // Assert
            Assert.Equal(original, decompressed);
        }

        [Fact]
        public void Compress_EmptyArray_RoundTripsToEmpty()
        {
            // Arrange
            var empty = new byte[0];

            // Act
            var compressed = GzipCompressor.Compress(empty);
            var decompressed = GzipCompressor.Decompress(compressed);

            // Assert — empty input round-trips back to empty. On .NET Framework,
            // GZipStream emits no bytes for zero-length input; that is fine because
            // an empty cached payload is explicitly treated as a cache-miss downstream
            // (RenderCacheRepository read guard + Node PublishedFormService).
            Assert.NotNull(compressed);
            Assert.Empty(decompressed);
        }

        [Fact]
        public void Compress_LargeJsonLike_SmallerThanOriginal()
        {
            // Arrange — a JSON-like string with high repetition compresses well
            var largeJson = Encoding.UTF8.GetBytes(BuildRepetitiveJson());

            // Act
            var compressed = GzipCompressor.Compress(largeJson);

            // Assert — GZip must reduce the size for highly repetitive content
            Assert.True(compressed.Length < largeJson.Length,
                "Compressed size should be smaller than original for repetitive JSON.");
        }

        [Fact]
        public void Compress_ThenDecompress_PreservesUtf8Encoding()
        {
            // Arrange — Arabic characters to verify multi-byte UTF-8 round-trip
            var arabicText = Encoding.UTF8.GetBytes("مرحبا بالعالم");

            // Act
            var compressed = GzipCompressor.Compress(arabicText);
            var decompressed = GzipCompressor.Decompress(compressed);

            // Assert
            Assert.Equal(arabicText, decompressed);
        }

        private static string BuildRepetitiveJson()
        {
            var builder = new System.Text.StringBuilder();
            builder.Append("{\"fields\":[");
            for (var i = 0; i < 200; i++)
            {
                if (i > 0) builder.Append(",");
                builder.AppendFormat("{{\"id\":\"{0}\",\"label\":\"Field {0}\",\"type\":\"text\",\"isRequired\":false}}", i);
            }
            builder.Append("]}");
            return builder.ToString();
        }
    }
}
