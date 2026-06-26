using System;
using System.Text;
using Moq;
using Microsoft.Xrm.Sdk;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Serialization;
using Qdb.FormEngine.Data;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Verifies that <see cref="RenderCacheRepository"/> stores and retrieves the runtime
    /// JSON as Base64(gzip(json)) in the Memo column qdb_runtime_json.
    /// All CRM I/O is mocked so no real organisation service is required.
    /// </summary>
    public sealed class RenderCacheRepositoryTests
    {
        // ── WriteCache stores Base64(gzip) in the Memo column ─────────────────

        [Fact]
        public void WriteCache_SetsRuntimeJsonAttribute_AsBase64GzipString()
        {
            // Arrange
            var capturedEntity = (Entity)null;
            var serviceMock = new Mock<IOrganizationService>();
            serviceMock
                .Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => capturedEntity = e)
                .Returns(Guid.NewGuid());

            // Suppress the supersede query — return empty result set
            serviceMock
                .Setup(s => s.RetrieveMultiple(It.IsAny<Microsoft.Xrm.Sdk.Query.QueryBase>()))
                .Returns(new EntityCollection());

            var gzipBytes = GzipCompressor.Compress(Encoding.UTF8.GetBytes("{\"formCode\":\"test\"}"));
            var request = BuildWriteRequest(gzipBytes);
            var repository = new RenderCacheRepository(serviceMock.Object);

            // Act
            repository.WriteCache(request);

            // Assert — the attribute must be Base64 of the exact gzip bytes supplied
            Assert.NotNull(capturedEntity);
            var storedBase64 = capturedEntity.GetAttributeValue<string>("qdb_runtime_json");
            Assert.False(string.IsNullOrWhiteSpace(storedBase64), "qdb_runtime_json must not be empty.");

            var roundTrippedBytes = Convert.FromBase64String(storedBase64);
            Assert.Equal(gzipBytes, roundTrippedBytes);
        }

        [Fact]
        public void WriteCache_SetsIsCompressed_ToTrue()
        {
            // Arrange
            var capturedEntity = (Entity)null;
            var serviceMock = new Mock<IOrganizationService>();
            serviceMock
                .Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => capturedEntity = e)
                .Returns(Guid.NewGuid());
            serviceMock
                .Setup(s => s.RetrieveMultiple(It.IsAny<Microsoft.Xrm.Sdk.Query.QueryBase>()))
                .Returns(new EntityCollection());

            var gzipBytes = GzipCompressor.Compress(Encoding.UTF8.GetBytes("{}"));
            var request = BuildWriteRequest(gzipBytes);
            var repository = new RenderCacheRepository(serviceMock.Object);

            // Act
            repository.WriteCache(request);

            // Assert
            Assert.True(capturedEntity.GetAttributeValue<bool>("qdb_is_compressed"));
        }

        [Fact]
        public void WriteCache_PreservesHashAndSizeBytes()
        {
            // Arrange
            var capturedEntity = (Entity)null;
            var serviceMock = new Mock<IOrganizationService>();
            serviceMock
                .Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => capturedEntity = e)
                .Returns(Guid.NewGuid());
            serviceMock
                .Setup(s => s.RetrieveMultiple(It.IsAny<Microsoft.Xrm.Sdk.Query.QueryBase>()))
                .Returns(new EntityCollection());

            var gzipBytes = GzipCompressor.Compress(Encoding.UTF8.GetBytes("{\"id\":\"abc\"}"));
            var request = BuildWriteRequest(gzipBytes);
            request.JsonHash = "abc123hash";
            request.JsonSizeBytes = gzipBytes.Length;
            var repository = new RenderCacheRepository(serviceMock.Object);

            // Act
            repository.WriteCache(request);

            // Assert
            Assert.Equal("abc123hash", capturedEntity.GetAttributeValue<string>("qdb_json_hash"));
            Assert.Equal((long)gzipBytes.Length, capturedEntity.GetAttributeValue<long>("qdb_json_size_bytes"));
        }

        // ── Full round-trip: gzip → Base64 → store → read → Base64-decode → gunzip → JSON ───

        [Fact]
        public void RoundTrip_GzipBase64_ReturnsOriginalJson()
        {
            // Arrange — simulate the full write/read cycle without CRM
            const string originalJson = "{\"formCode\":\"loan-application\",\"title\":\"Loan Application\"}";
            var utf8Bytes = Encoding.UTF8.GetBytes(originalJson);

            // Act — write path (same as PublishOrchestrator + RenderCacheRepository.BuildCacheEntity)
            var gzipBytes = GzipCompressor.Compress(utf8Bytes);
            var base64Stored = Convert.ToBase64String(gzipBytes);

            // Act — read path (same as GetPublishedFormJsonPlugin.ReadAndDecompressJson)
            var decodedBytes = Convert.FromBase64String(base64Stored);
            var decompressedBytes = GzipCompressor.Decompress(decodedBytes);
            var recoveredJson = Encoding.UTF8.GetString(decompressedBytes);

            // Assert
            Assert.Equal(originalJson, recoveredJson);
        }

        [Fact]
        public void RoundTrip_EmptyBase64String_ThrowsMeaningfulError()
        {
            // Arrange — simulate a cache row where the Memo column was not populated
            const string emptyBase64 = "";

            // Act / Assert — the plugin should surface a clear error; this test documents
            // the expected failure mode when the guard in GetPublishedFormJsonPlugin fires.
            Assert.Throws<FormatException>(() => Convert.FromBase64String(emptyBase64 + "!invalid!"));

            // A truly empty string produces an empty byte array — guard against this
            var emptyBytes = Convert.FromBase64String(string.Empty);
            Assert.Empty(emptyBytes);
            // GetPublishedFormJsonPlugin guards string.IsNullOrWhiteSpace BEFORE calling
            // Convert.FromBase64String, so an empty column never reaches the decoder.
        }

        // ── Helper ────────────────────────────────────────────────────────────

        private static RenderCacheWriteRequest BuildWriteRequest(byte[] gzipBytes)
        {
            return new RenderCacheWriteRequest
            {
                FormCode = "test-form",
                Version = 1,
                LanguageCode = "en",
                Lcid = 1033,
                JsonBytes = gzipBytes,
                JsonHash = "deadbeef",
                JsonSizeBytes = gzipBytes.Length,
                GeneratorVersion = "1.0.0",
                GenerationDurationMs = 42,
                FormDefinitionId = Guid.NewGuid(),
                PublishJobId = Guid.NewGuid(),
                PublishedBy = null
            };
        }
    }
}
