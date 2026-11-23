import db from '../config/db.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { assertMutationTarget, verifyTarget, requireReady, runOperation, operationError } from './databaseOperations.js';

const marker = 'S17_SYNTHETIC_SEED_V1';
const email = 's17-seed-user@example.invalid';
await runOperation(async () => {
  const config = assertMutationTarget();
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  return db.withTransaction(async tx => {
    await verifyTarget(tx, config.database);
    await tx.query('SELECT pg_advisory_xact_lock(17022)');
    await requireReady(tx);
    const counts = { users: 0, cars: 0, car_specs: 0, bookings: 0 };
    const insertion = await tx.query(`INSERT INTO public.users (name,email,password,role)
      VALUES ($1,$2,$3,'user') ON CONFLICT (lower(email)) DO NOTHING RETURNING id`, [marker,email,passwordHash]);
    counts.users = insertion.rowCount;
    const { rows: [user] } = await tx.query('SELECT id,name,role FROM public.users WHERE lower(email)=$1', [email]);
    if (user?.name !== marker || user.role !== 'user') throw operationError('FIXTURE_USER_COLLISION');
    let firstCar;
    for (const [vin, model, price] of [['S17SEED0000000001','Synthetic Sedan',45000000],['S17SEED0000000002','Synthetic SUV',68000000]]) {
      const name = marker + ' ' + model;
      const insert = await tx.query(`INSERT INTO public.cars (name,make,brand,model,vin,price,year,status,description)
        VALUES ($1,'S17 Fixture','S17 Fixture',$2,$3,$4,2022,'available',$5)
        ON CONFLICT (vin) WHERE vin IS NOT NULL DO NOTHING RETURNING id`, [name,model,vin,price,marker]);
      counts.cars += insert.rowCount;
      const { rows: [car] } = await tx.query('SELECT id,name,description FROM public.cars WHERE vin=$1', [vin]);
      if (car?.name !== name || car.description !== marker) throw operationError('FIXTURE_CAR_COLLISION');
      if (insert.rowCount) {
        const spec = await tx.query("INSERT INTO public.car_specs (car_id,engine,drive) VALUES ($1,'Synthetic','Synthetic')", [car.id]);
        counts.car_specs += spec.rowCount;
      }
      firstCar ??= car.id;
    }
    const existing = await tx.query('SELECT id FROM public.bookings WHERE user_id=$1 AND car_id=$2 AND notes=$3', [user.id, firstCar, marker]);
    if (!existing.rowCount) {
      const booking = await tx.query(`INSERT INTO public.bookings (user_id,car_id,booking_date,time_slot,notes)
        VALUES ($1,$2,CURRENT_DATE + CASE WHEN EXTRACT(DOW FROM CURRENT_DATE)=0 THEN 8 ELSE 7 END,'09:00-10:00',$3)
        ON CONFLICT (car_id,booking_date,time_slot) WHERE status NOT IN ('cancelled','completed') DO NOTHING`, [user.id,firstCar,marker]);
      counts.bookings = booking.rowCount;
      if (!booking.rowCount) throw operationError('FIXTURE_BOOKING_COLLISION');
    }
    return { success: true, inserted: counts };
  });
}, db.close);
