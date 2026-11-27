import { MAX_PRICE_RANGE } from "./formatUGX";

export type VehicleSortOrder =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "year-desc";

export type VehicleFilterQuery = {
  brand: string;
  year: string;
  maxPrice: number;
  sort: VehicleSortOrder;
  page: number;
};

export function parseVehicleFilterQuery(search: string): VehicleFilterQuery {
  const params = new URLSearchParams(search);
  const priceParameter = params.get("maxPrice");
  const rawPrice = priceParameter === null ? MAX_PRICE_RANGE : Number(priceParameter);
  const rawPage = Number(params.get("page"));
  const sortParameter = params.get("sort");
  const sort: VehicleSortOrder =
    sortParameter === "price-asc" ||
    sortParameter === "price-desc" ||
    sortParameter === "year-desc"
      ? sortParameter
      : "relevance";

  return {
    brand: params.get("brand")?.trim() ?? "",
    year: params.get("year")?.trim() ?? "",
    maxPrice: Number.isFinite(rawPrice) && rawPrice >= 0 && rawPrice <= MAX_PRICE_RANGE
      ? rawPrice
      : MAX_PRICE_RANGE,
    sort,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function buildVehicleFilterQuery(filters: VehicleFilterQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.brand.trim()) params.set("brand", filters.brand.trim());
  if (filters.year.trim()) params.set("year", filters.year.trim());
  if (filters.maxPrice < MAX_PRICE_RANGE) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function updateVehicleFilterQuery(
  current: VehicleFilterQuery,
  changes: Partial<VehicleFilterQuery>,
): VehicleFilterQuery {
  const changesFilters = Object.keys(changes).some((key) => key !== "page");
  return {
    ...current,
    ...changes,
    page: changesFilters ? 1 : (changes.page ?? current.page),
  };
}
