#!/usr/bin/env bash
# Publish the CRM plugin project and IL-merge it into a single strong-named assembly
# for the Dataverse sandbox. Excludes the SDK assemblies the sandbox already provides.
set -euo pipefail
cd "$(dirname "$0")"

# Git Bash (MSYS) otherwise rewrites bare "/union"-style flags into Windows paths.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ILREPACK="$HOME/.nuget/packages/ilrepack/2.0.27/tools/ILRepack.exe"
FRAMEWORK_DIR="C:/Windows/Microsoft.NET/Framework64/v4.0.30319"
OUT="pack/EDP.RuleRuntime.Crm.Signed.dll"
PRIMARY="pack/publish/EDP.RuleRuntime.Crm.dll"

echo "== publish =="
dotnet publish src/EDP.RuleRuntime.Crm -c Release -f net462 -o pack/publish >/dev/null

# Merge everything except the two SDK assemblies the sandbox supplies.
OTHERS=$(ls pack/publish/*.dll | grep -vE "/(EDP\.RuleRuntime\.Crm|Microsoft\.Xrm\.Sdk|Microsoft\.Crm\.Sdk\.Proxy)\.dll$")

echo "== ilrepack =="
"$ILREPACK" /out:"$OUT" /keyfile:pack/edp.snk /union \
  /targetplatform:"v4,$FRAMEWORK_DIR" /lib:pack/publish \
  "$PRIMARY" $OTHERS

echo "== done: $OUT =="
