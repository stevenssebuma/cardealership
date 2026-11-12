import { useCars, useVehicleFilters } from "@/features/cars/hooks";
import {
  VehicleInventorySection,
  VehicleInventorySkeleton,
  VehicleSearchSection,
} from "@/features/cars/components";

export function CarsPage() {
  const { vehicles, loading, error } = useCars();
  const filters = useVehicleFilters(vehicles);

  return (
    <div className="mt-20">
      <section className="py-10 sm:py-14 md:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4">VEHICLE INVENTORY</h1>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg">
            Browse our full showroom stock with advanced filters.
          </p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex min-h-[40vh] items-center justify-center px-6 text-center">
          <p className="text-muted-foreground">{error}</p>
        </div>
      ) : (
        <>
          <VehicleSearchSection
            searchBrand={filters.searchBrand}
            setSearchBrand={filters.setSearchBrand}
            searchYear={filters.searchYear}
            setSearchYear={filters.setSearchYear}
            priceRange={filters.priceRange}
            setPriceRange={filters.setPriceRange}
            showAdvanced={filters.showAdvanced}
            setShowAdvanced={filters.setShowAdvanced}
            filteredCount={filters.filteredVehicles.length}
            resetFilters={filters.resetFilters}
            isLoading={loading}
          />

          {loading ? (
            <section className="px-6 py-16 lg:px-8" aria-busy="true" aria-live="polite">
              <div className="mx-auto max-w-7xl">
                <span className="sr-only">Loading vehicle inventory…</span>
                <VehicleInventorySkeleton />
              </div>
            </section>
          ) : (
            <VehicleInventorySection
              vehicles={filters.filteredVehicles}
              filterByTab={filters.filterByTab}
              resetFilters={filters.resetFilters}
              showHeader={false}
            />
          )}
        </>
      )}
    </div>
  );
}
