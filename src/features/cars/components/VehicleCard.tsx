import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatUGX } from "../utils/formatUGX";
import type { Vehicle } from "../types";

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <Card className="bg-card border-border overflow-hidden group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-lg w-full">
      
      {/* Image */}
      <div className="relative h-52 sm:h-60 md:h-64 overflow-hidden">
        <img
          src={vehicle.image}
          alt={vehicle.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            target.src =
              "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80";
          }}
        />

        {/* Brand */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-black/70 backdrop-blur-sm text-white px-2.5 py-1 sm:px-3 text-[10px] sm:text-xs font-bold tracking-wide rounded-sm">
          {vehicle.brand}
        </div>

        {/* Year + Condition */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col items-end gap-2">
          <div className="bg-primary text-primary-foreground px-2.5 py-1 sm:px-3 text-[10px] sm:text-xs font-bold rounded-sm">
            {vehicle.year}
          </div>

          <div
            className={`px-2.5 py-1 sm:px-3 text-[10px] sm:text-xs font-bold rounded-sm ${
              vehicle.condition === "Used"
                ? "bg-orange-500 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {vehicle.condition}
          </div>
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-4 sm:p-5 md:p-6">
        
        {/* Vehicle information */}
        <div className="mb-4">
          <p className="text-primary text-xs sm:text-sm font-semibold mb-1 tracking-wide">
            {vehicle.type}
          </p>

          <h4 className="text-xl sm:text-2xl font-bold mb-2 leading-tight">
            {vehicle.name}
          </h4>

          <p className="text-2xl sm:text-3xl font-bold text-primary break-words">
            {formatUGX(vehicle.price)}
          </p>
        </div>

        {/* Specifications */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 border-t border-border">
          
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
              POWER
            </p>
            <p className="text-xs sm:text-sm font-semibold truncate">
              {vehicle.specs.power}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
              ENGINE
            </p>
            <p className="text-xs sm:text-sm font-semibold truncate">
              {vehicle.specs.engine}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
              DRIVE
            </p>
            <p className="text-xs sm:text-sm font-semibold truncate">
              {vehicle.specs.drive}
            </p>
          </div>

        </div>

        {/* View details button */}
        <Button
          className="w-full mt-5 sm:mt-6 bg-primary hover:bg-primary/90 text-white font-semibold text-sm sm:text-base h-11 sm:h-12"
        >
          VIEW DETAILS
          <ChevronRight className="ml-2" size={18} />
        </Button>

      </CardContent>
    </Card>
  );
}
