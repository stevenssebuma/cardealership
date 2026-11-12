// backend/seedInventory.js
//
// Seeds a small, realistic showroom inventory into PostgreSQL when the cars
// table is empty. Safe to run repeatedly: it never duplicates vehicles.
//
// Usage: cd backend && npm run seed:inventory

import pool, { initializeDatabase } from "./config/db.js";

const INVENTORY = [
  {
    vin: "JTMHV05J204123456",
    make: "Toyota",
    model: "Land Cruiser V8",
    name: "Land Cruiser V8",
    type: "Luxury SUV",
    category: "luxury",
    year: 2023,
    price: 285000000,
    mileage: 0,
    color: "Pearl White",
    condition: "New",
    status: "Available",
    description: "Full-size 4.5L V8 station wagon, Japan-imported, URA duty paid.",
    specs: { power: "309 HP", engine: "4.5L V8", drive: "4WD" },
    images: ["https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&q=80"],
  },
  {
    vin: "WDD2221781A123456",
    make: "Mercedes-Benz",
    model: "S 500",
    name: "S-Class S500",
    type: "Luxury Sedan",
    category: "luxury",
    year: 2023,
    price: 360000000,
    mileage: 0,
    color: "Obsidian Black",
    condition: "New",
    status: "Available",
    description: "Executive saloon with rear executive seating and Burmester audio.",
    specs: { power: "429 HP", engine: "3.0L V6 Turbo", drive: "RWD" },
    images: ["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80"],
  },
  {
    vin: "SALWR2SU5JA123456",
    make: "Land Rover",
    model: "Range Rover Sport",
    name: "Range Rover Sport",
    type: "Sport Luxury SUV",
    category: "sport",
    year: 2023,
    price: 420000000,
    mileage: 0,
    color: "Santorini Black",
    condition: "New",
    status: "Available",
    description: "UK-imported Sport with air suspension and terrain response.",
    specs: { power: "395 HP", engine: "3.0L I6 Turbo", drive: "AWD" },
    images: ["https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80"],
  },
  {
    vin: "5UXCR6C0XL9C12345",
    make: "BMW",
    model: "X5 xDrive40i",
    name: "X5 xDrive40i",
    type: "Sports SUV",
    category: "sport",
    year: 2023,
    price: 195000000,
    mileage: 0,
    color: "Phytonic Blue",
    condition: "New",
    status: "Available",
    description: "All-wheel drive sports activity vehicle with panoramic roof.",
    specs: { power: "335 HP", engine: "3.0L I6 Turbo", drive: "AWD" },
    images: ["https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80"],
  },
  {
    vin: "JTEBH9FJ0KK123456",
    make: "Toyota",
    model: "Land Cruiser Prado TX",
    name: "Land Cruiser Prado TZ",
    type: "Premium SUV",
    category: "luxury",
    year: 2022,
    price: 168000000,
    mileage: 45000,
    color: "Silver",
    condition: "Used",
    status: "Available",
    description: "Locally registered Prado TX, 2.8L diesel, full service history.",
    specs: { power: "177 HP", engine: "2.8L Diesel", drive: "4WD" },
    images: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"],
  },
  {
    vin: "JTJHY7AX5K4123456",
    make: "Lexus",
    model: "LX 570",
    name: "LX 570",
    type: "Ultra Luxury SUV",
    category: "luxury",
    year: 2023,
    price: 390000000,
    mileage: 0,
    color: "Manganese Luster",
    condition: "New",
    status: "Available",
    description: "Body-on-frame flagship SUV with 5.7L V8 and crawl control.",
    specs: { power: "383 HP", engine: "5.7L V8", drive: "4WD" },
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80"],
  },
];

async function seedInventory() {
  await initializeDatabase();

  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM cars");

  if (existing.rows[0].count > 0) {
    console.log(`Inventory already contains ${existing.rows[0].count} vehicles. Nothing to seed.`);
    return;
  }

  // A dedicated client keeps BEGIN/COMMIT and the inserts on one connection.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const car of INVENTORY) {
      const inserted = await client.query(
        `
          INSERT INTO cars (
            vin, make, model, name, type, category, year, price,
            mileage, color, condition, status, description
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id;
        `,
        [
          car.vin,
          car.make,
          car.model,
          car.name,
          car.type,
          car.category,
          car.year,
          car.price,
          car.mileage,
          car.color,
          car.condition,
          car.status,
          car.description,
        ],
      );

      const carId = inserted.rows[0].id;

      await client.query(
        `
          INSERT INTO car_specs (car_id, power, engine, drive)
          VALUES ($1, $2, $3, $4);
        `,
        [carId, car.specs.power, car.specs.engine, car.specs.drive],
      );

      for (const [index, imageUrl] of car.images.entries()) {
        await client.query(
          `
            INSERT INTO car_images (car_id, image_url, image_type)
            VALUES ($1, $2, $3);
          `,
          [carId, imageUrl, index === 0 ? "primary" : "general"],
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${INVENTORY.length} vehicles into the inventory.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seedInventory()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Inventory seed failed:", error.message);
    await pool.end();
    process.exitCode = 1;
  });
