import { ArrowDown, CarFront, MapPin, RefreshCw } from "lucide-react";
import { useCars, useVehicleFilters } from "@/features/cars/hooks";
import {
  VehicleInventorySection,
  VehicleInventorySkeleton,
  VehicleFilterSidebar,
} from "@/features/cars/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function CarsPage() {
  const { vehicles, loading, error, retry } = useCars();
  const filters = useVehicleFilters(vehicles);
  const makeCount = new Set(vehicles.map((vehicle) => vehicle.make)).size;

  return (
    <main className="mt-20">
      <section className="relative isolate overflow-hidden border-b border-border bg-card/30">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
        />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <MapPin className="size-3.5" aria-hidden="true" />
              Panda Motors · Kampala, Uganda
            </p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Find a car worth
              <span className="block text-primary">every mile.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Explore our showroom collection, compare the details, and find
              the right vehicle for your next journey.
            </p>
            <a
              href="#inventory"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Explore the collection
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:max-w-sm lg:w-[340px]">
            <div className="rounded-xl border border-border bg-background/75 p-4 backdrop-blur sm:p-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vehicles listed
              </dt>
              <dd className="mt-2 text-3xl font-bold tabular-nums">
                {loading ? "—" : vehicles.length.toString().padStart(2, "0")}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background/75 p-4 backdrop-blur sm:p-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Makes represented
              </dt>
              <dd className="mt-2 text-3xl font-bold tabular-nums">
                {loading ? "—" : makeCount.toString().padStart(2, "0")}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {error ? (
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div
            role="alert"
            className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center sm:px-10"
          >
            <span className="mb-5 grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
              <CarFront className="size-7" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-semibold">Inventory is temporarily unavailable</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              We couldn’t reach the showroom inventory. Please try again in a
              moment.
            </p>
            <Button type="button" onClick={retry} className="mt-6">
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </section>
      ) : (
        <section id="inventory" className="scroll-mt-24 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
            <VehicleFilterSidebar
              searchBrand={filters.searchBrand}
              setSearchBrand={filters.setSearchBrand}
              searchYear={filters.searchYear}
              setSearchYear={filters.setSearchYear}
              priceRange={filters.priceRange}
              setPriceRange={filters.setPriceRange}
              resetFilters={filters.resetFilters}
              isLoading={loading}
            />

            <div className="min-w-0">
              <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Showroom
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Explore the collection</h2>
                  <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                    {loading
                      ? "Loading stock…"
                      : `${filters.filteredVehicles.length} ${
                          filters.filteredVehicles.length === 1 ? "vehicle" : "vehicles"
                        } match your filters`}
                  </p>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <span className="shrink-0 font-medium">Sort by</span>
                  <Select
                    value={filters.sort}
                    onValueChange={(value) => {
                      if (
                        value === "relevance" ||
                        value === "price-asc" ||
                        value === "price-desc" ||
                        value === "year-desc"
                      ) {
                        filters.setSort(value);
                      }
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger
                      aria-label="Sort vehicles"
                      className="w-full bg-background sm:w-52"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Recommended</SelectItem>
                      <SelectItem value="price-asc">Price: low to high</SelectItem>
                      <SelectItem value="price-desc">Price: high to low</SelectItem>
                      <SelectItem value="year-desc">Newest year</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {loading ? (
                <div aria-busy="true" aria-live="polite" className="rounded-xl border border-border bg-card p-4 sm:p-6">
                  <span className="sr-only">Loading vehicle inventory…</span>
                  <VehicleInventorySkeleton />
                </div>
              ) : (
                <VehicleInventorySection
                  sectionId="inventory-results"
                  vehicles={filters.filteredVehicles}
                  filterByTab={filters.filterByTab}
                  resetFilters={filters.resetFilters}
                  showHeader={false}
                  page={filters.page}
                  pageSize={9}
                  onPageChange={filters.setPage}
                  onTabChange={() => filters.setPage(1)}
                />
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
