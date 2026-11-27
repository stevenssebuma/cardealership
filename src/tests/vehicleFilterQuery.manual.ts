import assert from "node:assert/strict";
import {
  buildVehicleFilterQuery,
  parseVehicleFilterQuery,
  updateVehicleFilterQuery,
} from "../features/cars/utils/filterQuery";
import { MAX_PRICE_RANGE } from "../features/cars/utils/formatUGX";

assert.deepEqual(parseVehicleFilterQuery("brand=Toyota&year=2023&maxPrice=300000000&sort=price-asc&page=2"), {
  brand: "Toyota",
  year: "2023",
  maxPrice: 300000000,
  sort: "price-asc",
  page: 2,
});
assert.deepEqual(parseVehicleFilterQuery(""), {
  brand: "",
  year: "",
  maxPrice: MAX_PRICE_RANGE,
  sort: "relevance",
  page: 1,
});
assert.equal(parseVehicleFilterQuery("maxPrice=invalid").maxPrice, MAX_PRICE_RANGE);
assert.equal(parseVehicleFilterQuery("maxPrice=900000000").maxPrice, MAX_PRICE_RANGE);
assert.equal(parseVehicleFilterQuery("sort=unknown&page=0").sort, "relevance");
assert.equal(parseVehicleFilterQuery("sort=unknown&page=0").page, 1);
assert.equal(
  buildVehicleFilterQuery({
    brand: " BMW ",
    year: "2022",
    maxPrice: 250000000,
    sort: "price-desc",
    page: 3,
  }).toString(),
  "brand=BMW&year=2022&maxPrice=250000000&sort=price-desc&page=3",
);
assert.equal(
  buildVehicleFilterQuery({
    brand: "",
    year: "",
    maxPrice: MAX_PRICE_RANGE,
    sort: "relevance",
    page: 1,
  }).toString(),
  "",
);

const current = parseVehicleFilterQuery("brand=Toyota&page=4&sort=price-asc");
assert.equal(updateVehicleFilterQuery(current, { brand: "BMW" }).page, 1);
assert.equal(updateVehicleFilterQuery(current, { sort: "year-desc" }).page, 1);
assert.equal(updateVehicleFilterQuery(current, { page: 2 }).page, 2);
assert.deepEqual(updateVehicleFilterQuery(current, { page: 2 }), {
  ...current,
  page: 2,
});

console.log(JSON.stringify({ suite: "vehicleFilterQuery", passed: 12, failed: 0, deepLinkRestored: true, defaultsApplied: true, invalidValuesRejected: true, filterChangesResetPage: true, paginationPreservesFilters: true }, null, 2));
