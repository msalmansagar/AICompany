using System;
using EDP.RuleRuntime.Hashing;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>ADR-20 §number form: exact decimal text by string manipulation, never binary floating point.</summary>
    public class CanonicalNumberTests
    {
        private const int Limit = 1000;

        [Theory]
        [InlineData("0", "0")]
        [InlineData("-0", "0")]
        [InlineData("-0.000", "0")]
        [InlineData("0e5", "0")]
        [InlineData("1.50", "1.5")]
        [InlineData("1.0", "1")]
        [InlineData("007", "7")]
        [InlineData("1e3", "1000")]
        [InlineData("1E+3", "1000")]
        [InlineData("2.5E+2", "250")]
        [InlineData("1e-7", "0.0000001")]
        [InlineData("12.5e-1", "1.25")]
        [InlineData("-12.340e1", "-123.4")]
        [InlineData("0.1", "0.1")]
        [InlineData("100000000000000000000000000001", "100000000000000000000000000001")]
        [InlineData("123456789.123456789123456789123", "123456789.123456789123456789123")]
        public void Canonicalize_ValidNumber_ReturnsExactDecimalText(string raw, string expected)
            => Assert.Equal(expected, CanonicalNumber.Canonicalize(raw, Limit));

        [Theory]
        [InlineData("1e1001")]
        [InlineData("1e-1001")]
        public void Canonicalize_ExponentBeyondLimit_Throws(string raw)
            => Assert.Throws<FormatException>(() => CanonicalNumber.Canonicalize(raw, Limit));

        [Theory]
        [InlineData("")]
        [InlineData("abc")]
        [InlineData("1.2.3")]
        [InlineData("--1")]
        public void Canonicalize_NotANumber_Throws(string raw)
            => Assert.Throws<FormatException>(() => CanonicalNumber.Canonicalize(raw, Limit));
    }
}
