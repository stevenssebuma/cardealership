import { apiRequest } from "../.././../api/client";
import type { Vehicle, VehicleDrive } from "../types";

type ApiCarImage = {
  id: number;
  url: string;
  type: string;
};

type ApiCar = {
  id: number;
  name: string;
  brand: string;
  type: string | null;
  category: string | null;
  year: number;
  price: number | string;
  condition: "New" | "Used";
  is_available: boolean;
  power: string | null;
  engine: string | null;
  drive: VehicleDrive | null;
  primary_image: string | null;
  images: ApiCarImage[];
};

type GetCarsResponse = {
  success: boolean;
  count: number;
  cars: ApiCar[];
};

function mapApiCarToVehicle(car: ApiCar): Vehicle {
  const image =
    car.primary_image ||
    car.images.find((item) => item.type === "primary")?.url ||
    car.images[0]?.url ||
    "";

  const category = car.category === "sport" ? "sport" : "luxury";

  const drive: VehicleDrive =
    car.drive === "AWD" || car.drive === "RWD" || car.drive === "4WD"
      ? car.drive
      : "4WD";

  return {
    id: car.id,
    name: car.name,
    brand: car.brand,
    type: car.type ?? "",
    year: car.year,
    price: Number(car.price),
    image,
    specs: {
      power: car.power ?? "",
      engine: car.engine ?? "",
      drive,
    },
    category,
    condition: car.condition,
    status: car.is_available ? "Available" : "Sold",
  };
}

export async function getCars(): Promise<Vehicle[]> {
  const response = await apiRequest("/api/cars");

  if (!response.ok) {
    throw new Error(`Failed to load vehicles: ${response.status}`);
  }

  const data = (await response.json()) as GetCarsResponse;

  if (!data.success || !Array.isArray(data.cars)) {
    throw new Error("Invalid vehicle inventory response.");
  }

  return data.cars.map(mapApiCarToVehicle);
}

export async function getCarById(id: number): Promise<Vehicle | undefined> {
  const vehicles = await getCars();

  return vehicles.find((vehicle) => vehicle.id === id);
}
