using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Qdb.FormEngine.Core.Serialization
{
    /// <summary>
    /// Newtonsoft.Json implementation of <see cref="IJsonSerializer"/>.
    /// Serialises to camelCase JSON with null values omitted and ISO 8601 date formatting.
    /// </summary>
    public sealed class NewtonsoftJsonSerializer : IJsonSerializer
    {
        private readonly JsonSerializerSettings _settings;

        /// <summary>
        /// Initialises a new instance with the standard form-engine serialiser settings.
        /// </summary>
        public NewtonsoftJsonSerializer()
        {
            _settings = new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver(),
                NullValueHandling = NullValueHandling.Ignore,
                DateFormatHandling = DateFormatHandling.IsoDateFormat
            };
        }

        /// <summary>
        /// Serialises <paramref name="value"/> to a camelCase JSON string.
        /// </summary>
        /// <typeparam name="T">The type to serialise.</typeparam>
        /// <param name="value">The value to serialise.</param>
        /// <returns>A JSON string.</returns>
        public string Serialize<T>(T value)
        {
            return JsonConvert.SerializeObject(value, _settings);
        }

        /// <summary>
        /// Deserialises a JSON string to an instance of <typeparamref name="T"/>.
        /// </summary>
        /// <typeparam name="T">The target type.</typeparam>
        /// <param name="json">The JSON string to deserialise.</param>
        /// <returns>A populated instance of <typeparamref name="T"/>.</returns>
        public T Deserialize<T>(string json)
        {
            return JsonConvert.DeserializeObject<T>(json, _settings);
        }
    }
}
