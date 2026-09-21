import { useEffect, useState } from "react";

import { Footer } from "../../app/components/Footer/Footer";
import { Navbar } from "../../app/components/Navbar/Navbar";

import { HeroSection } from "./components/HeroSection";
import { ServicesSection } from "./components/ServicesSection";
import { AboutSection } from "./components/AboutSection";
import { ContactSection } from "./components/ContactSection";

import { VehicleSearchSection } from "../../features/cars/components/VehicleSearchSection";
import { VehicleInventorySection } from "../../features/cars/components/VehicleInventorySection";
import { TestDriveScheduler } from "../../features/test-drive/components/TestDriveScheduler";
import { useVehicleFilters } from "../../features/cars/hooks";
import { getCars } from "../../features/cars/services";

import type { Vehicle } from "../../features/cars/types/car.types";

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const filters = useVehicleFilters(vehicles);

  useEffect(() => {
    let cancelled = false;

    async function loadVehicles() {
      try {
        setLoading(true);
        setError("");

        const data = await getCars();

        if (!cancelled) {
          setVehicles(data);
        }
      } catch (error) {
        console.error("Failed to load vehicle inventory:", error);

        if (!cancelled) {
          setError("Unable to load vehicle inventory");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadVehicles();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Navbar />

      <main>
        <HeroSection />

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
        />

        {error && <div className="text-center text-red-500 py-10">{error}</div>}

        <VehicleInventorySection
          loading={loading}
          vehicles={filters.filteredVehicles}
          filterByTab={filters.filterByTab}
          resetFilters={filters.resetFilters}
        />

        <TestDriveScheduler vehicles={vehicles} />

        <ServicesSection />

        <AboutSection />

        <ContactSection />
      </main>

      <Footer />
    </>
  );
}
