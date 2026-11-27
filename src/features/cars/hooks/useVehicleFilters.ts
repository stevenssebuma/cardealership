import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  buildVehicleFilterQuery,
  parseVehicleFilterQuery,
  updateVehicleFilterQuery,
} from "../utils/filterQuery";
import type { VehicleSortOrder } from "../utils/filterQuery";
import type { InventoryTab, Vehicle } from "../types";

export function useVehicleFilters(vehicles: Vehicle[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFilters = useMemo(
    () => parseVehicleFilterQuery(searchParams.toString()),
    [searchParams],
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilters = (changes: Partial<typeof queryFilters>) => {
    const nextFilters = updateVehicleFilterQuery(queryFilters, changes);
    setSearchParams(buildVehicleFilterQuery(nextFilters), { replace: true });
  };

  const filteredVehicles = useMemo(() => {
    const matchesFilters = vehicles.filter((vehicle) => {
      const matchesBrand = queryFilters.brand
        ? `${vehicle.make} ${vehicle.name}`
            .toLowerCase()
            .includes(queryFilters.brand.toLowerCase())
        : true;
      const matchesYear = queryFilters.year
        ? vehicle.year.toString().includes(queryFilters.year)
        : true;
      return matchesBrand && matchesYear && vehicle.price <= queryFilters.maxPrice;
    });

    return matchesFilters.sort((left, right) => {
      if (queryFilters.sort === "price-asc") return left.price - right.price;
      if (queryFilters.sort === "price-desc") return right.price - left.price;
      if (queryFilters.sort === "year-desc") return right.year - left.year;
      return 0;
    });
  }, [vehicles, queryFilters]);

  const resetFilters = () => setSearchParams({}, { replace: true });
  const filterByTab = (tab: InventoryTab, list: Vehicle[] = filteredVehicles) => {
    if (tab === "all") return list;
    if (tab === "4x4") {
      return list.filter(
        (vehicle) => vehicle.specs.drive === "4WD" || vehicle.specs.drive === "AWD",
      );
    }
    return list.filter((vehicle) => vehicle.category === tab);
  };

  return {
    showAdvanced,
    setShowAdvanced,
    priceRange: queryFilters.maxPrice,
    setPriceRange: (value: number) => updateFilters({ maxPrice: value }),
    searchBrand: queryFilters.brand,
    setSearchBrand: (value: string) => updateFilters({ brand: value }),
    searchYear: queryFilters.year,
    setSearchYear: (value: string) => updateFilters({ year: value }),
    sort: queryFilters.sort,
    setSort: (value: VehicleSortOrder) => updateFilters({ sort: value }),
    page: queryFilters.page,
    setPage: (value: number) => updateFilters({ page: value }),
    filteredVehicles,
    resetFilters,
    filterByTab,
  };
}
