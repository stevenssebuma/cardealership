// Keep PostgreSQL NUMERIC values and historical vehicle aliases compatible
// with the existing API without changing native types across the whole pool.
export function mapCarRow(row) {
  if (!row) return row;
  const output = { ...row };
  if (Object.hasOwn(output, "price") && output.price != null) {
    output.price = Number(output.price);
  }
  if (Object.hasOwn(output, "brand") && Object.hasOwn(output, "make")) {
    output.make = output.make ?? output.brand;
    output.brand = output.brand ?? output.make;
  }
  if (Object.hasOwn(output, "fuel_type")) output.fuelType = output.fuel_type;
  return output;
}
