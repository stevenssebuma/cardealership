import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type AdminVehicle = {
  id: number;
  name: string;
  brand: string;
  type: string;
  year: number;
  price: number;
  condition: string;
  image: string;
  specs: {
    power: string;
    engine: string;
    drive: string;
  };
};

type AdminListingsTableProps = {
  vehicles: AdminVehicle[];
};

function formatUGX(amount: number) {
  if (amount >= 1_000_000_000) return `UGX ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `UGX ${(amount / 1_000_000).toFixed(0)}M`;
  return `UGX ${amount.toLocaleString()}`;
}

export function AdminListingsTable({ vehicles }: AdminListingsTableProps) {
  if (!vehicles.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h4 className="text-2xl font-bold mb-2">No Listings Available</h4>
        <p className="text-muted-foreground">
          There are currently no vehicle listings to manage.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Drive</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow key={vehicle.id}>
                <TableCell>
                  <div className="flex items-center gap-3 min-w-[220px]">
                    {vehicle.image}
                    <div>
                      <p className="font-semibold">{vehicle.name}</p>
                      <p className="text-xs text-muted-foreground">{vehicle.type}</p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>{vehicle.brand}</TableCell>
                <TableCell>{vehicle.year}</TableCell>
                <TableCell className="font-semibold text-primary">
                  {formatUGX(vehicle.price)}
                </TableCell>
                <TableCell>{vehicle.condition}</TableCell>
                <TableCell>{vehicle.specs.drive}</TableCell>

                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        console.log("Edit vehicle requested:", vehicle.id)
                      }
                    >
                      Edit
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() =>
                        window.alert(
                          "Delete confirmation modal will be added in the next phase."
                        )
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
