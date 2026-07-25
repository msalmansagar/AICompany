// Polyfill so C# 9 records (init-only setters) compile on .NET Framework 4.7.1,
// which lacks System.Runtime.CompilerServices.IsExternalInit in its BCL.
// Required by the shared contract (FieldMetadata / OptionMetadata records).
namespace System.Runtime.CompilerServices
{
    using System.ComponentModel;

    [EditorBrowsable(EditorBrowsableState.Never)]
    internal static class IsExternalInit { }
}
