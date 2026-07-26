// Enables C# 9 `init`-only setters (and records) on netstandard2.0, which lacks this type.
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}
