import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { getVehicleListings } from "../../lib/api";

export function AdminListingsTable() {
  const listings = getVehicleListings();

  function handleEdit(vehicleId: string) {
    console.log("Edit vehicle:", vehicleId);
  }

  function handleDelete(vehicleId: string) {
    console.log("Delete vehicle requested:", vehicleId);
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
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
          {listings.map((listing) => (
            <TableRow key={listing.id}>
              <TableCell className="font-medium">
                {listing.vehicle}
              </TableCell>
              <TableCell>{listing.brand}</TableCell>
              <TableCell>{listing.year}</TableCell>
              <TableCell>{listing.price}</TableCell>
              <TableCell>{listing.condition}</TableCell>
              <TableCell>{listing.drive}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(listing.id)}
                  >
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(listing.id)}
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
  );
}
