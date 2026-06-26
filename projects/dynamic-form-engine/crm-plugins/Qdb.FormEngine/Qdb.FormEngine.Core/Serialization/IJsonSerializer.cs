namespace Qdb.FormEngine.Core.Serialization
{
    /// <summary>
    /// Abstracts JSON serialisation so the concrete Newtonsoft dependency
    /// is confined to the infrastructure layer and can be replaced in tests.
    /// </summary>
    public interface IJsonSerializer
    {
        /// <summary>
        /// Serialises <paramref name="value"/> to a JSON string.
        /// </summary>
        /// <typeparam name="T">The type of the value to serialise.</typeparam>
        /// <param name="value">The value to serialise.</param>
        /// <returns>A JSON string representation of <paramref name="value"/>.</returns>
        string Serialize<T>(T value);

        /// <summary>
        /// Deserialises a JSON string to an instance of <typeparamref name="T"/>.
        /// </summary>
        /// <typeparam name="T">The target type.</typeparam>
        /// <param name="json">The JSON string to deserialise.</param>
        /// <returns>A populated instance of <typeparamref name="T"/>.</returns>
        T Deserialize<T>(string json);
    }
}
