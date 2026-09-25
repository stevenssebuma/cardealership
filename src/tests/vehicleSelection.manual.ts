import assert from "node:assert/strict";
import { resolveSelectedVehicleId } from "../features/test-drive/utils/vehicleSelection";
import type { TestDriveVehicleOption } from "../features/test-drive/types";

const vehicles: TestDriveVehicleOption[] = [
  { id: 1, name: "Toyota Land Cruiser ZX", brand: "Toyota", year: 2023 },
  { id: 2, name: "BMW X5", brand: "BMW", year: 2022 },
];

// The scheduler mounts before the inventory request resolves, so the first
// render always sees an empty list and must not invent a selection.
assert.equal(resolveSelectedVehicleId([], ""), "");
assert.equal(resolveSelectedVehicleId([], "1"), "1");

// Once the inventory arrives the first vehicle is selected automatically, which
// is what unblocks the dropdown, the availability request and the submit button.
assert.equal(resolveSelectedVehicleId(vehicles, ""), "1");

// A customer's choice survives inventory reloads while the vehicle is listed.
assert.equal(resolveSelectedVehicleId(vehicles, "2"), "2");

// A vehicle that disappears from the inventory falls back to the first entry.
assert.equal(resolveSelectedVehicleId(vehicles, "99"), "1");
assert.equal(resolveSelectedVehicleId(vehicles, "0"), "1");

console.log(JSON.stringify({
  suite: "vehicleSelection",
  passed: 6,
  failed: 0,
}, null, 2));
