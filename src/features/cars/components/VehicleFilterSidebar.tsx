import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { formatUGX, MAX_PRICE_RANGE } from "../utils/formatUGX";

interface VehicleFilterSidebarProps {
  searchBrand: string;
  setSearchBrand: (value: string) => void;
  searchYear: string;
  setSearchYear: (value: string) => void;
  priceRange: number;
  setPriceRange: (value: number) => void;
  resetFilters: () => void;
  isLoading?: boolean;
}

export function VehicleFilterSidebar({
  searchBrand,
  setSearchBrand,
  searchYear,
  setSearchYear,
  priceRange,
  setPriceRange,
  resetFilters,
  isLoading = false,
}: VehicleFilterSidebarProps) {
  const activeFilterCount = [
    searchBrand.trim().length > 0,
    searchYear.trim().length > 0,
    priceRange < MAX_PRICE_RANGE,
  ].filter(Boolean).length;

  return (
    <aside
      aria-labelledby="vehicle-filters-title"
      className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 lg:sticky lg:top-24"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Refine
            </span>
          </div>
          <h2 id="vehicle-filters-title" className="text-xl font-semibold">
            Find your fit
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          disabled={isLoading || activeFilterCount === 0}
          className="text-muted-foreground"
        >
          <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
          Reset
        </Button>
      </div>

      <div className="space-y-6">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Make or model
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="e.g. Toyota or Land Cruiser"
              value={searchBrand}
              onChange={(event) => setSearchBrand(event.target.value)}
              disabled={isLoading}
              className="h-11 bg-background pl-9"
            />
          </span>
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Model year
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min="1900"
            max={new Date().getFullYear() + 1}
            placeholder="Any year"
            value={searchYear}
            onChange={(event) => setSearchYear(event.target.value)}
            disabled={isLoading}
            className="h-11 bg-background"
          />
        </label>

        <div className="space-y-4 border-t border-border pt-5">
          <label
            htmlFor="cars-maximum-price"
            className="flex items-center justify-between gap-2"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Maximum budget
            </span>
            <span className="text-sm font-semibold text-foreground">
              {priceRange === MAX_PRICE_RANGE ? "Any" : formatUGX(priceRange)}
            </span>
          </label>
          <input
            id="cars-maximum-price"
            type="range"
            min="0"
            max={MAX_PRICE_RANGE}
            step="10000000"
            value={priceRange}
            onChange={(event) => setPriceRange(Number(event.target.value))}
            disabled={isLoading}
            aria-valuetext={
              priceRange === MAX_PRICE_RANGE ? "Any budget" : formatUGX(priceRange)
            }
            className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>UGX 0</span>
            <span>UGX 500M+</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[200000000, 300000000, 400000000, MAX_PRICE_RANGE].map((price) => (
              <button
                key={price}
                type="button"
                aria-pressed={priceRange === price}
                disabled={isLoading}
                onClick={() => setPriceRange(price)}
                className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  priceRange === price
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground"
                }`}
              >
                {price === MAX_PRICE_RANGE ? "Any" : `${price / 1000000}M`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        Prices are shown in Ugandan shillings.
      </p>
    </aside>
  );
}
