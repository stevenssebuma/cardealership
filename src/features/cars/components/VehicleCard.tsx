import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { formatUGX } from "../utils/formatUGX";
import type { Vehicle } from "../types";

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <Card className="group flex h-full w-full flex-col overflow-hidden rounded-xl border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-black/20">
      <div className="relative h-52 overflow-hidden bg-muted sm:h-60">
        <img
          src={vehicle.image}
          alt={vehicle.name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(event) => {
            const image = event.currentTarget;
            image.onerror = null;
            image.src =
              "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80";
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20"
        />
        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur sm:left-4 sm:top-4">
          {vehicle.make}
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-2 sm:right-4 sm:top-4">
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
            {vehicle.year}
          </span>
          <span className="rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {vehicle.condition}
          </span>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {vehicle.type}
          </p>
          <h3 className="mb-2 text-xl font-semibold leading-tight sm:text-2xl">
            <Link
              to={`/cars/${vehicle.id}`}
              className="rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              {vehicle.name}
            </Link>
          </h3>
          <p className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            {formatUGX(vehicle.price)}
          </p>
        </div>

        <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-border pt-4 sm:gap-4">
          <div className="min-w-0">
            <dt className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Power
            </dt>
            <dd className="truncate text-xs font-semibold sm:text-sm">
              {vehicle.specs.power}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Engine
            </dt>
            <dd className="truncate text-xs font-semibold sm:text-sm">
              {vehicle.specs.engine}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Drive
            </dt>
            <dd className="truncate text-xs font-semibold sm:text-sm">
              {vehicle.specs.drive}
            </dd>
          </div>
        </dl>

        <Button
          asChild
          className="mt-6 h-11 w-full font-semibold"
        >
          <Link to={`/?vehicle=${vehicle.id}#test-drive`}>
            Schedule a test drive
            <ChevronRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
