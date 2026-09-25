import type { TestDriveVehicleOption } from "../types";

/**
 * Keeps the scheduler's vehicle selection pointing at a vehicle that is really
 * in the inventory.
 *
 * The inventory is loaded asynchronously, so the scheduler's first render always
 * sees an empty list and seeds the selection with "". Returning the first
 * vehicle as soon as the list arrives is what stops the dropdown from rendering
 * blank and blocking the booking form. A customer's existing choice is preserved
 * for as long as that vehicle is still listed.
 */
export function resolveSelectedVehicleId(
  vehicles: TestDriveVehicleOption[],
  currentId: string,
): string {
  if (vehicles.length === 0) return currentId;

  const isStillListed = vehicles.some(
    (vehicle) => vehicle.id.toString() === currentId,
  );

  return isStillListed ? currentId : vehicles[0].id.toString();
}
