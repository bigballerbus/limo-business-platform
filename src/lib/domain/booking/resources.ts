/**
 * Resource planning (spec §5.4, BC4 + BC5) — pure logic.
 *
 * Every confirmed booking locks a vehicle and a chauffeur for the service
 * window plus a turnaround buffer (cleaning, repositioning, contingency). The
 * buffered period is what the database EXCLUDE constraint (BC5) enforces
 * against overlaps, so it is computed here, once, and used verbatim.
 *
 * BC4 — weddings additionally lock a backup vehicle for the same window; this
 * function refuses to plan a wedding without one, mirroring the database CHECK
 * so the rule holds in the flow as well as at the data layer.
 */

/** Buffer added after the estimated end before the resource is free again. */
export const TURNAROUND_BUFFER_MINUTES = 60;

export class BackupVehicleRequiredError extends Error {
  constructor() {
    super('A wedding booking requires a backup vehicle (BC4)');
    this.name = 'BackupVehicleRequiredError';
  }
}

export interface ResourcePlanInput {
  serviceType: string;
  pickupAt: Date;
  estimatedEndAt: Date;
  vehicleId: string;
  chauffeurId: string;
  backupVehicleId?: string | null;
}

export interface PlannedResource {
  resourceType: 'vehicle' | 'chauffeur';
  vehicleId: string | null;
  staffId: string | null;
  from: Date;
  to: Date;
  isBackup: boolean;
}

export function planResources(input: ResourcePlanInput): PlannedResource[] {
  if (input.estimatedEndAt.getTime() <= input.pickupAt.getTime()) {
    throw new RangeError('estimatedEndAt must be after pickupAt');
  }
  const from = input.pickupAt;
  const to = new Date(input.estimatedEndAt.getTime() + TURNAROUND_BUFFER_MINUTES * 60_000);

  const plan: PlannedResource[] = [
    {
      resourceType: 'vehicle',
      vehicleId: input.vehicleId,
      staffId: null,
      from,
      to,
      isBackup: false,
    },
    {
      resourceType: 'chauffeur',
      vehicleId: null,
      staffId: input.chauffeurId,
      from,
      to,
      isBackup: false,
    },
  ];

  if (input.serviceType === 'wedding') {
    if (!input.backupVehicleId) throw new BackupVehicleRequiredError();
    plan.push({
      resourceType: 'vehicle',
      vehicleId: input.backupVehicleId,
      staffId: null,
      from,
      to,
      isBackup: true,
    });
  }

  return plan;
}
