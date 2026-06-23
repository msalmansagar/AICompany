// src/components/CreateProcessWizard/wizardSchemas.ts
import { z } from 'zod';

export const step1Schema = z.object({
  processName: z.string().trim().min(1, 'Process name is required').max(200),
  processDescription: z.string().max(2000).optional().default(''),
});

export const step2Schema = z.object({
  taskEntity: z.string().trim().min(1, 'Task entity is required'),
  regardingField: z.string().optional().default(''),
  parentEntity: z.string().optional().default(''),
});

export const stepAssignmentSchema = z.object({
  sopStepId: z.string().min(1),
  taskSubject: z.string().trim().min(1, 'Task subject is required').max(200),
  assignToType: z.number().nullable(),
  assignedUserId: z.string().optional(),
  teamId: z.string().optional(),
  enableRoundRobin: z.boolean().optional().default(false),
  roundRobinTeamId: z.string().optional(),
});

export const step3Schema = z.object({
  stepAssignments: z.array(stepAssignmentSchema),
});

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;
export type Step3Values = z.infer<typeof step3Schema>;
