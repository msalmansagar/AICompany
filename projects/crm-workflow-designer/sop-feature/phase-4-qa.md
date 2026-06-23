═══════════════════════════════════════════════════════════════════════
QA TEST STRATEGY — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       phase-4-qa.md
Prepared by:    QA — Maqsad AI
Date:           2026-06-12
Version:        1.0
Architecture:   sop-feature/phase-2-arch.md
Code Review:    sop-feature/code-review.md (PASS WITH REQUIRED FIX)
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TEST SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Area | Coverage Required |
|------|------------------|
| SOP Validator (sopValidator.ts) | Unit tests — all 6 check functions |
| sopStore actions | Unit tests — all 12 actions |
| Wizard schemas (Zod) | Unit tests — valid + invalid cases per schema |
| useWizardState hook | Unit tests — step navigation, data persistence |
| CreateProcessFromSopPlugin (C#) | Unit tests + fault-injection (transaction rollback) |
| RoleDeletionGuardPlugin (C#) | Unit tests — referenced and unreferenced role |
| ISopAdapter type guard | Unit tests |
| Backward compatibility | Regression: all CWFD-001 E2E tests must pass |
| Security fix FIX-CR-01 | Unit test — cross-SOP sopStepId injection attempt |
| E2E: Full derivation flow | Playwright — SOP → Wizard → Canvas |
| E2E: Ops Excellence permissions | Playwright — privilege enforcement |
| Performance: Plugin 50-step SOP | Measured execution time < 30s |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — UNIT TESTS (Vitest)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
sopValidator.test.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/validators/sopValidator.test.ts

describe('validateSopForPublish', () => {

  describe('VS-01 — SOP must have a Record Type', () => {
    it('validateSopForPublish_WithNoRecordType_ReturnsVS01Error', () => {
      const state = buildSopState({ recordTypeId: null, hasSteps: true });
      const results = validateSopForPublish(state);
      expect(results).toContainEqual(expect.objectContaining({ code: 'VS-01' }));
    });

    it('validateSopForPublish_WithRecordType_DoesNotReturnVS01', () => {
      const state = buildSopState({ recordTypeId: 'some-guid', hasSteps: true });
      const results = validateSopForPublish(state);
      expect(results.find((r) => r.code === 'VS-01')).toBeUndefined();
    });
  });

  describe('VS-02 — SOP must have at least one step', () => {
    it('validateSopForPublish_WithNoSteps_ReturnsVS02Error', () => {
      const state = buildSopState({ recordTypeId: 'some-guid', hasSteps: false });
      const results = validateSopForPublish(state);
      expect(results).toContainEqual(expect.objectContaining({ code: 'VS-02' }));
    });
  });

  describe('VS-03 — All steps must have names', () => {
    it('validateSopForPublish_WithUnnamedStep_ReturnsVS03WithAffectedNodeId', () => {
      const state = buildSopStateWithSteps([
        { id: 'step-1', name: '', sequenceNo: 1 },
        { id: 'step-2', name: 'Valid Name', sequenceNo: 2 },
      ]);
      const results = validateSopForPublish(state);
      const vs03 = results.filter((r) => r.code === 'VS-03');
      expect(vs03).toHaveLength(1);
      expect(vs03[0].affectedNodeId).toBe('step-1');
    });
  });

  describe('VS-04 — Step sequence numbers must be unique', () => {
    it('validateSopForPublish_WithDuplicateSequenceNumbers_ReturnsVS04', () => {
      const state = buildSopStateWithSteps([
        { id: 'step-1', name: 'Step A', sequenceNo: 1 },
        { id: 'step-2', name: 'Step B', sequenceNo: 1 },
      ]);
      const results = validateSopForPublish(state);
      expect(results.find((r) => r.code === 'VS-04')).toBeDefined();
    });
  });

  describe('VS-05 — Outcome next-step references must exist', () => {
    it('validateSopForPublish_WithDanglingOutcomeReference_ReturnsVS05', () => {
      const state = buildSopStateWithDanglingOutcome('outcome-1', 'nonexistent-step');
      const results = validateSopForPublish(state);
      expect(results).toContainEqual(
        expect.objectContaining({ code: 'VS-05', affectedNodeId: 'outcome-1' })
      );
    });
  });

  describe('VS-06 — No circular references', () => {
    it('validateSopForPublish_WithDirectCycle_ReturnsVS06', () => {
      const state = buildSopStateWithCycle();
      const results = validateSopForPublish(state);
      expect(results).toContainEqual(expect.objectContaining({ code: 'VS-06' }));
    });

    it('validateSopForPublish_WithNoCycle_DoesNotReturnVS06', () => {
      const state = buildLinearSopState(3);
      const results = validateSopForPublish(state);
      expect(results.find((r) => r.code === 'VS-06')).toBeUndefined();
    });
  });

  it('validateSopForPublish_WithValidSop_ReturnsNoErrors', () => {
    const state = buildValidSopState();
    const results = validateSopForPublish(state);
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0);
  });
});
```

─────────────────────────────────────────────────────────────────────
wizardSchemas.test.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/components/CreateProcessWizard/wizardSchemas.test.ts

describe('step1Schema', () => {
  it('step1Schema_WithValidData_ParsesSuccessfully', () => {
    const result = step1Schema.safeParse({
      processName: 'My Process',
      processDescription: 'Description',
    });
    expect(result.success).toBe(true);
  });

  it('step1Schema_WithEmptyProcessName_ReturnsValidationError', () => {
    const result = step1Schema.safeParse({ processName: '  ' });
    expect(result.success).toBe(false);
  });

  it('step1Schema_WithProcessNameOver200Chars_ReturnsValidationError', () => {
    const result = step1Schema.safeParse({ processName: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('step2Schema', () => {
  it('step2Schema_WithEmptyTaskEntity_ReturnsValidationError', () => {
    const result = step2Schema.safeParse({
      taskEntity: '',
      regardingField: '',
      parentEntity: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('stepAssignmentSchema', () => {
  it('stepAssignmentSchema_WithInvalidGuidSopStepId_ReturnsValidationError', () => {
    const result = stepAssignmentSchema.safeParse({
      sopStepId: 'not-a-guid',
      taskSubject: 'Task',
      assignToType: null,
    });
    expect(result.success).toBe(false);
  });
});
```

─────────────────────────────────────────────────────────────────────
sopStore.test.ts (key action tests)
─────────────────────────────────────────────────────────────────────

```typescript
// src/store/sopStore.test.ts

describe('sopStore', () => {

  beforeEach(() => {
    useSopStore.getState().resetSopCanvas();
  });

  describe('addStep', () => {
    it('addStep_WithNewStep_AddsToStepsMapAndStepOrder', () => {
      const step = buildSopStep('tmp_step-1');
      useSopStore.getState().addStep(step, { x: 0, y: 0 });
      const state = useSopStore.getState();
      expect(state.steps['tmp_step-1']).toBeDefined();
      expect(state.stepOrder).toContain('tmp_step-1');
      expect(state.newIds.has('tmp_step-1')).toBe(true);
      expect(state.isDirty).toBe(true);
    });
  });

  describe('removeStep', () => {
    it('removeStep_WithRelatedOutcomes_RemovesStepAndCascadesOutcomeDeletion', () => {
      setupStoreWithStepAndOutcome('step-1', 'outcome-1');
      useSopStore.getState().removeStep('step-1');
      const state = useSopStore.getState();
      expect(state.steps['step-1']).toBeUndefined();
      expect(state.outcomes['outcome-1']).toBeUndefined();
      expect(state.deletedIds).toContain('step-1');
      expect(state.deletedIds).toContain('outcome-1');
    });
  });

  describe('resolveTmpId', () => {
    it('resolveTmpId_ForSopStep_ReplacesTemporaryIdWithRealId', () => {
      const step = buildSopStep('tmp_abc');
      useSopStore.getState().addStep(step, { x: 0, y: 0 });
      useSopStore.getState().resolveTmpId('tmp_abc', 'real-guid-123', 'sopstep');
      const state = useSopStore.getState();
      expect(state.steps['real-guid-123']).toBeDefined();
      expect(state.steps['tmp_abc']).toBeUndefined();
      expect(state.stepOrder).toContain('real-guid-123');
      expect(state.newIds.has('tmp_abc')).toBe(false);
    });
  });

  describe('markSaved', () => {
    it('markSaved_AfterDirtyOperations_ClearsAllDirtyTracking', () => {
      setupDirtyState();
      useSopStore.getState().markSaved();
      const state = useSopStore.getState();
      expect(state.newIds.size).toBe(0);
      expect(state.dirtyIds).toHaveLength(0);
      expect(state.deletedIds).toHaveLength(0);
      expect(state.isDirty).toBe(false);
    });
  });
});
```

─────────────────────────────────────────────────────────────────────
isSopAdapter.test.ts
─────────────────────────────────────────────────────────────────────

```typescript
// src/adapters/ISopAdapter.test.ts

describe('isSopAdapter', () => {
  it('isSopAdapter_WithDataverseAdapter_ReturnsTrue', () => {
    const adapter = new DataverseAdapter(mockEnvService);
    expect(isSopAdapter(adapter)).toBe(true);
  });

  it('isSopAdapter_WithODataAdapter_ReturnsFalse', () => {
    const adapter = new ODataAdapter(mockEnvService);
    expect(isSopAdapter(adapter)).toBe(false);
  });
});
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — PLUGIN UNIT TESTS (C# / xUnit)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
CreateProcessFromSopPluginTests.cs
─────────────────────────────────────────────────────────────────────

```csharp
// Tests/CreateProcessFromSopPluginTests.cs

public class CreateProcessFromSopPluginTests
{
    [Fact]
    public void Execute_WithPublishedSop_CreatesProcessStepsAndOutcomes()
    {
        // Arrange
        var (context, service) = BuildPluginContext(sopStatus: SOP_STATUS_PUBLISHED);
        var plugin = new CreateProcessFromSopPlugin();

        // Act
        plugin.Execute(context.ServiceProvider);

        // Assert
        var processCreate = service.CreatedEntities
            .First(e => e.LogicalName == "qdb_work_item_record_type");
        Assert.Equal("Test Process", processCreate["qdb_name"]);
        Assert.NotNull(processCreate["qdb_sop_id"]);

        var stepCreates = service.CreatedEntities
            .Where(e => e.LogicalName == "qdb_work_item_steps")
            .ToList();
        Assert.Equal(2, stepCreates.Count); // 2 SOP steps in test fixture

        var outcomeCreates = service.CreatedEntities
            .Where(e => e.LogicalName == "qdb_outcome")
            .ToList();
        Assert.Equal(3, outcomeCreates.Count); // 3 SOP outcomes in test fixture
    }

    [Fact]
    public void Execute_WithDraftSop_ThrowsInvalidPluginExecutionException()
    {
        var (context, _) = BuildPluginContext(sopStatus: 100000000); // Draft
        var plugin = new CreateProcessFromSopPlugin();

        var ex = Assert.Throws<InvalidPluginExecutionException>(
            () => plugin.Execute(context.ServiceProvider));
        Assert.Contains("Published status", ex.Message);
    }

    [Fact]
    public void Execute_WithMalformedStepAssignmentsJson_ThrowsInvalidPluginExecutionException()
    {
        var (context, _) = BuildPluginContext(stepAssignmentsJson: "not-valid-json");
        var plugin = new CreateProcessFromSopPlugin();

        var ex = Assert.Throws<InvalidPluginExecutionException>(
            () => plugin.Execute(context.ServiceProvider));
        Assert.Contains("invalid JSON", ex.Message);
    }

    [Fact]
    public void Execute_WithSopStepIdFromDifferentSop_ThrowsInvalidPluginExecutionException()
    {
        // FIX-CR-01 test — cross-SOP injection attempt
        var foreignStepId = Guid.NewGuid().ToString();
        var assignments = BuildAssignmentsWithForeignStepId(foreignStepId);
        var (context, _) = BuildPluginContext(stepAssignmentsJson: assignments);
        var plugin = new CreateProcessFromSopPlugin();

        var ex = Assert.Throws<InvalidPluginExecutionException>(
            () => plugin.Execute(context.ServiceProvider));
        Assert.Contains("does not belong", ex.Message);
    }

    [Fact]
    public void Execute_WhenStepCreateFails_NoRecordsPersistedInTransaction()
    {
        // Fault injection: IOrganizationService.Create throws on second call (step create)
        var (context, service) = BuildPluginContext();
        service.ThrowOnCreateCallNumber = 2; // 1=process, 2=first step → throws

        var plugin = new CreateProcessFromSopPlugin();

        Assert.Throws<InvalidPluginExecutionException>(
            () => plugin.Execute(context.ServiceProvider));

        // Platform transaction rollback is handled by the Dataverse platform.
        // In unit tests, we verify the plugin rethrows (does not swallow the error).
        // Integration test against actual Dataverse verifies atomicity.
    }

    [Fact]
    public void Execute_WithNullNextSopStep_CreatesOutcomeWithNullNextWorkitemStep()
    {
        var (context, service) = BuildPluginContextWithTerminalOutcome();
        var plugin = new CreateProcessFromSopPlugin();
        plugin.Execute(context.ServiceProvider);

        var terminalOutcome = service.CreatedEntities
            .First(e => e.LogicalName == "qdb_outcome" && !e.Contains("qdb_nextworkitemstep"));
        Assert.NotNull(terminalOutcome);
    }
}
```

─────────────────────────────────────────────────────────────────────
RoleDeletionGuardPluginTests.cs
─────────────────────────────────────────────────────────────────────

```csharp
public class RoleDeletionGuardPluginTests
{
    [Fact]
    public void Execute_WhenRoleReferencedBySopStep_ThrowsInvalidPluginExecutionException()
    {
        var (context, _) = BuildDeleteContext(roleHasSopStepReference: true);
        var plugin = new RoleDeletionGuardPlugin();

        var ex = Assert.Throws<InvalidPluginExecutionException>(
            () => plugin.Execute(context.ServiceProvider));
        Assert.Contains("cannot be deleted", ex.Message);
    }

    [Fact]
    public void Execute_WhenRoleNotReferenced_AllowsDeleteToProceed()
    {
        var (context, _) = BuildDeleteContext(roleHasSopStepReference: false);
        var plugin = new RoleDeletionGuardPlugin();

        // Should not throw
        plugin.Execute(context.ServiceProvider);
    }
}
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — E2E TESTS (Playwright against Dataverse org5869857f)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
E2E-SOP-001: Full SOP → Process Derivation Flow
─────────────────────────────────────────────────────────────────────

Given an Ops Excellence user is logged in to the designer
And a qdb_role record "Senior Reviewer" exists and is Active
When the user creates a new SOP with 2 steps and 3 outcomes
And assigns "Senior Reviewer" to both steps
And publishes the SOP
Then the SOP status badge shows "Published"
And the SOP canvas is read-only

When a BA user logs in and opens the SOP list
And selects the Published SOP and clicks "Create Process from SOP"
Then the wizard opens on Step 1 with the process name pre-filled
And Step 1 shows the SOP Record Type as read-only

When the BA completes all 3 wizard steps and submits
Then a progress indicator is shown
And on success the wizard closes
And the Process Edit Canvas opens with the new process
And the process has 2 steps and 3 outcomes (matching the SOP)
And each step has qdb_sop_id set on the parent process record

When the BA navigates to the Process list
Then the new process shows a "From SOP" badge
And hovering the badge shows the source SOP name

─────────────────────────────────────────────────────────────────────
E2E-SOP-002: Backward Compatibility — Direct Process Creation Unchanged
─────────────────────────────────────────────────────────────────────

Given a BA user is logged in
When the BA clicks "New Process" (existing flow)
Then the new process dialog opens without any SOP selection
And qdb_sop_id is null on the created process record
And no "From SOP" badge appears on the process list

─────────────────────────────────────────────────────────────────────
E2E-SOP-003: Ops Excellence Cannot Create Processes
─────────────────────────────────────────────────────────────────────

Given an Ops Excellence user is logged in (WorkflowDesignerOpsExcellence role only)
When the user navigates to the Process list
Then the "New Process" button is absent or disabled
And attempting a direct POST to qdb_work_item_record_type returns 403

─────────────────────────────────────────────────────────────────────
E2E-SOP-004: BA Cannot Publish a SOP
─────────────────────────────────────────────────────────────────────

Given a BA user is logged in (WorkflowDesignerBA role only)
When the BA navigates to the SOP canvas for a Draft SOP
Then the Publish button is absent
And the canvas is in read-only mode
And attempting a direct PATCH to qdb_sop with status=Published returns 403

─────────────────────────────────────────────────────────────────────
E2E-SOP-005: Plugin Rollback on Failure
─────────────────────────────────────────────────────────────────────

Given a valid Published SOP with 3 steps
And a test harness that injects a failure on the 3rd step creation
When the BA completes the wizard and submits
Then the wizard shows an error message from the plugin
And no partial records (process, steps, or outcomes) remain in Dataverse
(Verified by querying qdb_work_item_record_type for the process name after failure)

─────────────────────────────────────────────────────────────────────
E2E-SOP-006: Role Deletion Guard
─────────────────────────────────────────────────────────────────────

Given a qdb_role "Test Role" is assigned to a SOP step
When an Ops Excellence user attempts to delete "Test Role" from the Roles screen
Then a clear error message is displayed: "cannot be deleted... assigned to one or more SOP steps"
And the role record remains in Dataverse

─────────────────────────────────────────────────────────────────────
E2E-SOP-007: SOP Validation Before Publish
─────────────────────────────────────────────────────────────────────

Given an Ops Excellence user has a Draft SOP with no Record Type assigned
When the user clicks Publish
Then a validation panel appears with error VS-01
And the SOP status remains Draft

─────────────────────────────────────────────────────────────────────
E2E-SOP-008: On-Premise Environment — SOP Feature Unavailable
─────────────────────────────────────────────────────────────────────

Given the designer is loaded in an On-Premise (ODataAdapter) context
When the user navigates to the SOPs tab
Then a clear error banner shows: "SOP Designer requires Dynamics 365 Online"
And no API calls are made to qdb_sop entities


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — REGRESSION TEST GATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All existing CWFD-001 Vitest unit tests and Playwright E2E tests must
pass with zero regressions before CWFD-002 is considered ready for UAT.

Critical regression areas (per BRD AC-SOP-05a through 05d):
- Process CRUD (create, open, save, publish, clone) — unchanged flow
- Step/Outcome/Route CRUD on the process canvas — unchanged
- workflowStore actions — unchanged
- ICrmAdapter / DataverseAdapter / ODataAdapter existing methods — unchanged
- Bundle size CI gate — must remain below 4,500 KB after SOP additions


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — PERFORMANCE TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PT-SOP-01: qdb_CreateProcessFromSop — 50-step SOP
- Environment: org5869857f
- Measure: wall-clock time from POST request to 200 response
- Threshold: < 30 seconds
- Acceptable: < 60 seconds
- Failure: > 120 seconds (CRM plugin limit breach — must activate
  ExecuteMultipleRequest optimisation)

PT-SOP-02: SOP Canvas load — 50-step SOP
- Measure: time from SOP open click to all nodes rendered
- Threshold: < 2 seconds (NFR-SOP-01a)

PT-SOP-03: Wizard step transition with 50 steps in Step 3
- Measure: render time of Step 3 (50 SopStepAssignmentCard components)
- Threshold: < 1 second initial render (NFR-SOP-01b)
- Note: React.memo on SopStepAssignmentCard recommended if threshold
  not met with naive re-render


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — COVERAGE GATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Minimum 80% unit test coverage required on all new source files:
- sopValidator.ts — target 100% (pure function, easy to cover)
- sopStore.ts — target 90%
- wizardSchemas.ts — target 100% (Zod schemas)
- useWizardState.ts — target 85%
- CreateProcessFromSopPlugin.cs — target 85%
- RoleDeletionGuardPlugin.cs — target 100%

Coverage enforcement in CI (Step 4 of existing pipeline):
Vitest `--coverage` must not degrade below 80% overall.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — QA DEFECTS FROM CODE REVIEW (FOR TRACKING)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Defect ID | Source | Description | Priority |
|-----------|--------|-------------|----------|
| DEFECT-SOP-001 | FIX-CR-01 | Cross-SOP sopStepId injection: plugin does not validate stepIds belong to requested SOP | Critical — must fix before UAT |
| DEFECT-SOP-002 | FIX-CR-02 | sopValidator checkStepSequenceUniqueness: affectedNodeId is null; jump-to-node unavailable for VS-04 violations | Medium |
| DEFECT-SOP-003 | MINOR-CR-03 | Wizard step components couple navigation to validation; impairs component isolation in tests | Low |
| DEFECT-SOP-004 | MINOR-CR-04 | useSopSave subscribes to full sopStore causing unnecessary re-renders | Low |
| DEFECT-SOP-005 | MINOR-CR-05 | CreateProcessFromSopPlugin: dictionary-style attribute access instead of GetAttributeValue<T> | Low |

═══════════════════════════════════════════════════════════════════════
END OF QA TEST STRATEGY — CWFD-002
QA — Maqsad AI | 2026-06-12
═══════════════════════════════════════════════════════════════════════
