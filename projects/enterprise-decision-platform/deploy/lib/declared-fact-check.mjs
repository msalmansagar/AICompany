// FR-B1-10 / R-3: from 1.1.0 a declared fact is never read from the target record. Before 1.1.0 an
// unbound input WAS read from a same-named column. This answers which published or draft rules
// would change behaviour: an unbound input whose name is also a real column on the rule's target.

/** A declared fact is an input with no binding, relationship or aggregate. */
export const isDeclaredFact = (input) => !input.binding && !input.via && !input.aggregate;

/** Answer [{ ruleVersionId, targetEntity, input }] for every coincidence; empty means no change. */
export function findCoincidences(versions, columnsByEntity) {
  return versions.flatMap((version) => {
    const pcrm = JSON.parse(version.pcrm);
    const columns = columnsByEntity.get(pcrm.targetEntity) ?? new Set();
    return (pcrm.inputs ?? []).filter(isDeclaredFact)
      .filter((input) => columns.has(input.name) || columns.has(input.name.toLowerCase()))
      .map((input) => ({ ruleVersionId: version.ruleVersionId, targetEntity: pcrm.targetEntity, input: input.name }));
  });
}

/** The target entities whose columns must be read to answer findCoincidences. */
export function targetsWithDeclaredFacts(versions) {
  const targets = versions.map((v) => JSON.parse(v.pcrm))
    .filter((p) => p.targetEntity && (p.inputs ?? []).some(isDeclaredFact))
    .map((p) => p.targetEntity);
  return [...new Set(targets)];
}
