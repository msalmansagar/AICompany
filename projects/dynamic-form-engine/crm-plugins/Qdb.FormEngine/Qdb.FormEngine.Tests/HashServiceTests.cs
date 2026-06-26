using System.Text;
using Qdb.FormEngine.Core.Hashing;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="HashService"/>.
    /// </summary>
    public sealed class HashServiceTests
    {
        [Fact]
        public void ComputeSha256Hex_KnownInput_ReturnsExpectedHash()
        {
            // Arrange
            // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
            var input = Encoding.UTF8.GetBytes("hello");
            const string expectedHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

            // Act
            var result = HashService.ComputeSha256Hex(input);

            // Assert
            Assert.Equal(expectedHash, result);
        }

        [Fact]
        public void ComputeSha256Hex_EmptyArray_ReturnsExpectedHash()
        {
            // Arrange
            // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
            var input = new byte[0];
            const string expectedHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

            // Act
            var result = HashService.ComputeSha256Hex(input);

            // Assert
            Assert.Equal(expectedHash, result);
        }

        [Fact]
        public void ComputeSha256Hex_SameInput_ReturnsSameHash()
        {
            // Arrange — deterministic: same input always produces the same hash
            var input = Encoding.UTF8.GetBytes("deterministic test");

            // Act
            var hash1 = HashService.ComputeSha256Hex(input);
            var hash2 = HashService.ComputeSha256Hex(input);

            // Assert
            Assert.Equal(hash1, hash2);
        }

        [Fact]
        public void ComputeSha256Hex_DifferentInputs_ReturnsDifferentHashes()
        {
            // Arrange
            var input1 = Encoding.UTF8.GetBytes("input one");
            var input2 = Encoding.UTF8.GetBytes("input two");

            // Act
            var hash1 = HashService.ComputeSha256Hex(input1);
            var hash2 = HashService.ComputeSha256Hex(input2);

            // Assert
            Assert.NotEqual(hash1, hash2);
        }

        [Fact]
        public void ComputeSha256Hex_ReturnsLowercaseHexString()
        {
            // Arrange
            var input = Encoding.UTF8.GetBytes("case test");

            // Act
            var result = HashService.ComputeSha256Hex(input);

            // Assert — all characters are lowercase hex digits
            Assert.Matches("^[0-9a-f]{64}$", result);
        }
    }
}
