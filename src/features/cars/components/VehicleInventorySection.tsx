import { useEffect, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";

import { VehicleCard } from "./VehicleCard";
import { VehicleInventorySkeleton } from "./VehicleInventorySkeleton";

import type {
  InventoryTab,
  Vehicle,
} from "../types";

import { Button } from "../../../components/ui/button";

import { SearchX } from "lucide-react";

interface VehicleInventorySectionProps {
  vehicles: Vehicle[];

  filterByTab: (
    tab: InventoryTab,
    list?: Vehicle[]
  ) => Vehicle[];

  loading?: boolean;

  sectionId?: string;

  showHeader?: boolean;

  resetFilters?: () => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onTabChange?: (tab: InventoryTab) => void;
}

export function VehicleInventorySection({
  vehicles,
  filterByTab,
  loading = false,
  sectionId = "inventory",
  showHeader = true,
  resetFilters,
  page = 1,
  pageSize = 9,
  onPageChange,
  onTabChange,
}: VehicleInventorySectionProps) {
  const [currentTab, setCurrentTab] =
    useState<InventoryTab>("all");
  const currentVehicles = filterByTab(currentTab);
  const totalPages = Math.max(1, Math.ceil(currentVehicles.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const firstVehicle = currentVehicles.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastVehicle = Math.min(currentPage * pageSize, currentVehicles.length);

  useEffect(() => {
    if (onPageChange && page !== currentPage) {
      onPageChange(currentPage);
    }
  }, [currentPage, onPageChange, page]);

  function getPageVehicles(tab: InventoryTab) {
    const tabVehicles = filterByTab(tab);
    if (!onPageChange) return tabVehicles;

    const tabPage = Math.min(page, Math.max(1, Math.ceil(tabVehicles.length / pageSize)));
    const start = (tabPage - 1) * pageSize;
    return tabVehicles.slice(start, start + pageSize);
  }

  function EmptyInventoryState() {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
        <div className="mb-5 rounded-full bg-primary/10 p-4 text-primary">
          <SearchX size={32} aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-xl font-semibold">
          No vehicles match these filters
        </h3>
        <p className="mb-6 max-w-md text-sm leading-6 text-muted-foreground">
          Try adjusting your search criteria or resetting your filters.
        </p>

        {resetFilters && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetFilters();
              setCurrentTab("all");
            }}
          >
            Reset Filters
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <section
        id={sectionId}
        className={showHeader ? "px-4 py-20 sm:px-6 lg:px-8" : "p-0"}
      >
        <div className="mx-auto max-w-7xl">
          {showHeader && (
            <div className="text-center mb-16">
              <h3
                className="
                  text-5xl
                  md:text-6xl
                  font-bold
                  mb-4
                "
              >
                CURRENT STOCK
              </h3>

              <p className="text-muted-foreground text-lg">
                Loading available vehicles...
              </p>
            </div>
          )}

          <VehicleInventorySkeleton />
        </div>
      </section>
    );
  }

  return (
    <section
      id={sectionId}
      className={showHeader ? "px-4 py-20 sm:px-6 lg:px-8" : "p-0"}
    >
      <div className="mx-auto max-w-7xl">
        {showHeader && (
          <div className="text-center mb-16">
            <h3
              className="
                text-5xl
                md:text-6xl
                font-bold
                mb-4
              "
            >
              CURRENT STOCK
            </h3>

            <p className="text-muted-foreground text-lg">
              All vehicles are Japan- and UK-imported,
              URA duty paid, and ready for immediate
              registration with UNRA.
            </p>
          </div>
        )}

        <Tabs
          value={currentTab}
          onValueChange={(value) => {
            const tab = value as InventoryTab;
            setCurrentTab(tab);
            onTabChange?.(tab);
          }}
          className="w-full"
        >
          <TabsList className="mb-6 grid h-11 w-full max-w-lg grid-cols-4 rounded-lg border border-border bg-card p-1">
            <TabsTrigger
              value="all"
              className="rounded-md text-xs font-semibold tracking-wide data-[state=active]:bg-primary/15 data-[state=active]:text-primary sm:text-sm"
            >
              ALL
            </TabsTrigger>

            <TabsTrigger
              value="luxury"
              className="rounded-md text-xs font-semibold tracking-wide data-[state=active]:bg-primary/15 data-[state=active]:text-primary sm:text-sm"
            >
              LUXURY
            </TabsTrigger>

            <TabsTrigger
              value="sport"
              className="rounded-md text-xs font-semibold tracking-wide data-[state=active]:bg-primary/15 data-[state=active]:text-primary sm:text-sm"
            >
              SPORT
            </TabsTrigger>

            <TabsTrigger
              value="4x4"
              className="rounded-md text-xs font-semibold tracking-wide data-[state=active]:bg-primary/15 data-[state=active]:text-primary sm:text-sm"
            >
              4X4
            </TabsTrigger>
          </TabsList>

          {(
            [
              "all",
              "luxury",
              "sport",
              "4x4",
            ] as InventoryTab[]
          ).map((tab) => (
            <TabsContent
              key={tab}
              value={tab}
            >
              {filterByTab(tab).length === 0 ? (
                <EmptyInventoryState />
              ) : (
                <div
                  className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6"
                >
                  {getPageVehicles(tab).map((vehicle) => (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        {onPageChange && currentVehicles.length > 0 && (
          <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Showing {firstVehicle}–{lastVehicle} of {currentVehicles.length}
            </p>
            {totalPages > 1 && (
              <nav
                className="flex items-center gap-3"
                aria-label="Vehicle inventory pages"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => onPageChange(currentPage - 1)}
                >
                  Previous
                </Button>
                <span className="min-w-20 text-center text-sm" aria-current="page">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => onPageChange(currentPage + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </section>
  );
}