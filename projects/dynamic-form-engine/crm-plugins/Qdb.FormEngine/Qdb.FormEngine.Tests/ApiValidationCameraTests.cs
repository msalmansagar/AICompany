using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// DFE-APIVAL-CAM-001. The API validation rule type and the camera-only capture mode must
    /// survive publishing, and fields that use neither must publish exactly as before.
    /// </summary>
    public sealed class ApiValidationCameraTests
    {
        [Fact]
        public void ToValidationRuleType_MapsApiValidation()
        {
            Assert.Equal("apiValidation", PicklistMapper.ToValidationRuleType(100000014));
        }

        [Fact]
        public void Apply_ApiValidationPayload_SetsTheKey()
        {
            var rule = new ValidationRule();

            ValidationRuleJsonReader.Apply(rule, "{\"schemaVersion\":2,\"type\":\"api_validation\",\"key\":\" IBAN \"}");

            Assert.Equal("IBAN", rule.ValidationKey);
        }

        [Fact]
        public void Apply_ApiValidationWithBlankKey_LeavesNoKey()
        {
            var rule = new ValidationRule();

            ValidationRuleJsonReader.Apply(rule, "{\"schemaVersion\":2,\"type\":\"api_validation\",\"key\":\"  \"}");

            Assert.Null(rule.ValidationKey);
        }

        [Fact]
        public void Serialize_FileFieldThatIsNotCameraOnly_OmitsCaptureMode()
        {
            var json = Newtonsoft.Json.JsonConvert.SerializeObject(new FileUploadConfig { MaxFiles = 1 });

            Assert.DoesNotContain("captureMode", json);
        }

        [Fact]
        public void Serialize_RuleWithoutKey_OmitsValidationKey()
        {
            var json = Newtonsoft.Json.JsonConvert.SerializeObject(new ValidationRule { RuleType = "required" });

            Assert.DoesNotContain("validationKey", json);
        }

        [Theory]
        [InlineData(100000001, "camera")]
        [InlineData(100000000, null)]
        [InlineData(null, null)]
        public void ToFileCaptureMode_PublishesOnlyCamera(int? optionValue, string expected)
        {
            Assert.Equal(expected, PicklistMapper.ToFileCaptureMode(optionValue));
        }
    }
}
