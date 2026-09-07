// The engine's shared logic is written in modern C# and compiled for net8.0 in the middle tier.
// The plugin sandbox is net462, where the compiler still emits references to these attributes for
// records, `init` accessors and `required` members but the framework does not define them.
// Declaring them here lets one set of source files serve both runtimes unchanged, which is the whole
// point of source-linking rather than maintaining a second implementation.
//
// Every type here is a compiler contract only — nothing reads them at run time.

#if NET462
using System.ComponentModel;

namespace System.Runtime.CompilerServices
{
    /// <summary>Enables <c>init</c> accessors and positional records.</summary>
    [EditorBrowsable(EditorBrowsableState.Never)]
    internal static class IsExternalInit
    {
    }

    /// <summary>Marks a member the compiler requires an object initialiser to set.</summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct | AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false, Inherited = false)]
    [EditorBrowsable(EditorBrowsableState.Never)]
    internal sealed class RequiredMemberAttribute : Attribute
    {
    }

    /// <summary>Guards against older compilers silently ignoring a feature they do not understand.</summary>
    [AttributeUsage(AttributeTargets.All, AllowMultiple = true, Inherited = false)]
    [EditorBrowsable(EditorBrowsableState.Never)]
    internal sealed class CompilerFeatureRequiredAttribute : Attribute
    {
        public CompilerFeatureRequiredAttribute(string featureName) => FeatureName = featureName;

        public string FeatureName { get; }
    }
}

namespace System.Diagnostics.CodeAnalysis
{
    /// <summary>Tells the compiler a constructor sets all required members itself.</summary>
    [AttributeUsage(AttributeTargets.Constructor, AllowMultiple = false, Inherited = false)]
    [EditorBrowsable(EditorBrowsableState.Never)]
    internal sealed class SetsRequiredMembersAttribute : Attribute
    {
    }

    /// <summary>Consumed by nullable analysis on the shared sources.</summary>
    [AttributeUsage(AttributeTargets.Parameter, AllowMultiple = false, Inherited = false)]
    [EditorBrowsable(EditorBrowsableState.Never)]
    internal sealed class NotNullWhenAttribute : Attribute
    {
        public NotNullWhenAttribute(bool returnValue) => ReturnValue = returnValue;

        public bool ReturnValue { get; }
    }
}
#endif
