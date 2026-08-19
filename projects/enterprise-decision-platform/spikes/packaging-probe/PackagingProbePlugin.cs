using System;
using System.Reflection;
using Microsoft.Xrm.Sdk;

namespace Msst.Edp.PackagingProbe
{
    /// <summary>
    /// ADR-18 P0. A throwaway probe that answers two questions about the Dataverse plug-in
    /// PACKAGE model, both of which are currently reasoned from documentation rather than
    /// observed:
    ///
    ///   1. Does a package bind the dependency version it SHIPS, or does the sandbox's own
    ///      copy of that assembly win? Microsoft's guidance says "don't depend on
    ///      System.Text.Json ... the file in the sandbox runtime might not be the same version
    ///      you refer to in your project", and points at this capability as the remedy.
    ///   2. Does an UNSIGNED assembly load? The docs say signing is not required inside a
    ///      package. If true, the requirement W0-1 exists to satisfy simply goes away.
    ///
    /// It reads nothing, writes nothing, and touches no EDP object. Delete after use.
    /// </summary>
    public sealed class PackagingProbePlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            context.OutputParameters["ReportJson"] = BuildReport();
        }

        private static string BuildReport()
        {
            var probe = typeof(PackagingProbePlugin).Assembly;
            var serializer = typeof(System.Text.Json.JsonSerializer).Assembly;

            return "{"
                 + Pair("probeAssembly", probe.FullName) + ","
                 + Pair("probeIsSigned", HasStrongName(probe) ? "true" : "false") + ","
                 + Pair("systemTextJsonVersion", serializer.GetName().Version?.ToString()) + ","
                 + Pair("systemTextJsonFullName", serializer.FullName) + ","
                 + Pair("systemTextJsonLocation", SafeLocation(serializer)) + ","
                 + Pair("clrVersion", Environment.Version.ToString())
                 + "}";
        }

        /// <summary>An unsigned assembly has an empty public key token.</summary>
        private static bool HasStrongName(Assembly assembly)
        {
            var token = assembly.GetName().GetPublicKeyToken();
            return token != null && token.Length > 0;
        }

        /// <summary>Location throws for assemblies loaded from a byte array, which the sandbox may do.</summary>
        private static string SafeLocation(Assembly assembly)
        {
            try { return string.IsNullOrEmpty(assembly.Location) ? "(no location)" : assembly.Location; }
            catch (Exception ex) { return "(unavailable: " + ex.GetType().Name + ")"; }
        }

        private static string Pair(string name, string value)
            => "\"" + name + "\":\"" + (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
