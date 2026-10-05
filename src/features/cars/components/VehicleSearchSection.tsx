import { ChevronDown, RotateCcw, Search } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { formatUGX, MAX_PRICE_RANGE } from "../utils/formatUGX";

interface VehicleSearchSectionProps {
  searchBrand: string;
  setSearchBrand: (value: string) => void;
  searchYear: string;
  setSearchYear: (value: string) => void;
  priceRange: number;
  setPriceRange: (value: number) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  filteredCount: number;
  resetFilters: () => void;
}

export function VehicleSearchSection({
  searchBrand,
  setSearchBrand,
  searchYear,
  setSearchYear,
  priceRange,
  setPriceRange,
  showAdvanced,
  setShowAdvanced,
  filteredCount,
  resetFilters,
}: VehicleSearchSectionProps) {
  return (
    <section className="border-y border-border bg-card px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Banda showroom
            </p>
            <h2 className="text-2xl font-bold sm:text-3xl">Find your next vehicle</h2>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground">{filteredCount}</span> vehicles
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.7fr)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search by make or model</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              type="search"
              placeholder="Make or model"
              value={searchBrand}
              onChange={(event) => setSearchBrand(event.target.value)}
              className="h-12 pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Model year</span>
            <Input
              type="number"
              inputMode="numeric"
              min="1900"
              max={new Date().getFullYear() + 1}
              placeholder="Any year"
              value={searchYear}
              onChange={(event) => setSearchYear(event.target.value)}
              className="h-12"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            aria-expanded={showAdvanced}
            aria-controls="price-filter"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-12 justify-between gap-4"
          >
            <span>{priceRange === MAX_PRICE_RANGE ? "Any budget" : `Up to ${formatUGX(priceRange)}`}</span>
            <ChevronDown className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} size={18} />
          </Button>
          <Button type="button" variant="ghost" onClick={resetFilters} className="h-12">
            <RotateCcw className="mr-2" size={16} />
            Clear filters
          </Button>
        </div>

        {showAdvanced && <div id="price-filter" className="mt-4 border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setShowAdvanced(false)}
            className="sr-only"
          >
            Hide price filter
          </button>
          <label htmlFor="maximum-price" className="mb-3 block text-sm font-semibold">
            Maximum budget <span className="font-normal text-muted-foreground">({priceRange === MAX_PRICE_RANGE ? "No limit" : formatUGX(priceRange)})</span>
          </label>
          <input
            id="maximum-price"
            type="range"
            min="0"
            max={MAX_PRICE_RANGE}
            step="10000000"
            value={priceRange}
            onChange={(event) => setPriceRange(Number(event.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>UGX 0</span>
            <span>UGX 250M</span>
            <span>UGX 500M+</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[50000000, 100000000, 200000000, 300000000, 400000000, MAX_PRICE_RANGE].map((price) => (
              <button
                key={price}
                type="button"
                aria-pressed={priceRange === price}
                onClick={() => setPriceRange(price)}
                className={`rounded-sm border px-3 py-2 text-xs transition-colors ${
                  priceRange === price
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary"
                }`}
              >
                {price === MAX_PRICE_RANGE ? "No limit" : formatUGX(price)}
              </button>
            ))}
          </div>
        </div>
        }
      </div>
    </section>
  );
}
