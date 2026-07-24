import { describe, expect, it } from 'vitest';
import {
  BackupVehicleRequiredError,
  TURNAROUND_BUFFER_MINUTES,
  planResources,
} from '@/lib/domain/booking/resources';

const pickupAt = new Date('2030-06-01T10:00:00Z');
const estimatedEndAt = new Date('2030-06-01T14:00:00Z');
const bufferedEnd = new Date(estimatedEndAt.getTime() + TURNAROUND_BUFFER_MINUTES * 60_000);

describe('planResources', () => {
  it('locks a vehicle and a chauffeur for the buffered window', () => {
    const plan = planResources({
      serviceType: 'airport_transfer',
      pickupAt,
      estimatedEndAt,
      vehicleId: 'veh-1',
      chauffeurId: 'staff-1',
    });
    expect(plan).toHaveLength(2);
    expect(plan.every((r) => r.from.getTime() === pickupAt.getTime())).toBe(true);
    expect(plan.every((r) => r.to.getTime() === bufferedEnd.getTime())).toBe(true);
    expect(plan.find((r) => r.resourceType === 'vehicle')?.vehicleId).toBe('veh-1');
    expect(plan.find((r) => r.resourceType === 'chauffeur')?.staffId).toBe('staff-1');
    expect(plan.some((r) => r.isBackup)).toBe(false);
  });

  it('requires a backup vehicle for weddings (BC4)', () => {
    expect(() =>
      planResources({
        serviceType: 'wedding',
        pickupAt,
        estimatedEndAt,
        vehicleId: 'veh-1',
        chauffeurId: 'staff-1',
      }),
    ).toThrow(BackupVehicleRequiredError);
  });

  it('adds the backup vehicle as a backup resource for weddings', () => {
    const plan = planResources({
      serviceType: 'wedding',
      pickupAt,
      estimatedEndAt,
      vehicleId: 'veh-1',
      chauffeurId: 'staff-1',
      backupVehicleId: 'veh-backup',
    });
    expect(plan).toHaveLength(3);
    const backup = plan.find((r) => r.isBackup);
    expect(backup?.vehicleId).toBe('veh-backup');
    expect(backup?.resourceType).toBe('vehicle');
  });

  it('rejects an end that is not after the pickup', () => {
    expect(() =>
      planResources({
        serviceType: 'corporate',
        pickupAt,
        estimatedEndAt: pickupAt,
        vehicleId: 'veh-1',
        chauffeurId: 'staff-1',
      }),
    ).toThrow(RangeError);
  });
});
