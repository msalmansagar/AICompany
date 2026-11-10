using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// JSON through the in-box DataContractJsonSerializer, which the CRM sandbox allows, so the
    /// assembly needs no merged JSON library. Members the contract does not declare are ignored.
    /// </summary>
    public static class JsonText
    {
        private static readonly DataContractJsonSerializerSettings Settings = new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true };

        /// <summary>The object as JSON text.</summary>
        public static string Write<T>(T value)
        {
            using (var stream = new MemoryStream())
            {
                new DataContractJsonSerializer(typeof(T), Settings).WriteObject(stream, value);
                return Encoding.UTF8.GetString(stream.ToArray());
            }
        }

        /// <summary>The JSON text read into <typeparamref name="T"/>.</summary>
        /// <exception cref="SurveyApiException">The text is not valid JSON for the contract.</exception>
        public static T Read<T>(string json, string what)
        {
            try
            {
                using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json ?? string.Empty)))
                    return (T)new DataContractJsonSerializer(typeof(T), Settings).ReadObject(stream);
            }
            catch (SerializationException invalid)
            {
                throw new SurveyApiException(SurveyApiException.BadRequest, $"{what} is not valid JSON: {invalid.Message}");
            }
        }
    }
}
