-- TSK-022 P2: executable schema contract checks. Run only on a fresh,
-- disposable PostgreSQL database initialized by scripts/schema.sql.
-- Every test row is synthetic and rolled back at the end.
BEGIN;

DO $$
DECLARE
  v_user INTEGER;
  v_car INTEGER;
  v_other_car INTEGER;
  v_booking INTEGER;
  v_future_date DATE := DATE '2030-01-02';
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN ('users', 'cars', 'car_specs', 'car_images',
      'bookings', 'financing_leads', 'exchange_rate_snapshots', 'vehicle_spotlights');
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'Expected eight canonical tables, got %', v_count;
  END IF;

  INSERT INTO public.users (name, email, password)
  VALUES ('S17 synthetic user', 's17-schema@example.invalid', 'synthetic-test-only')
  RETURNING id INTO v_user;
  BEGIN
    INSERT INTO public.users (name, email, password)
    VALUES ('Duplicate synthetic user', 'S17-SCHEMA@example.invalid', 'synthetic-test-only');
    RAISE EXCEPTION 'P2 case-insensitive email uniqueness failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.cars (name, brand, make, model, vin, year, price, mileage)
  VALUES ('S17 fixture vehicle', 'Fixture', 'Fixture', 'Test', '1HGCM82633A004352', 2020, 1000000, 100)
  RETURNING id INTO v_car;
  IF NOT (SELECT is_available FROM public.cars WHERE id = v_car) THEN
    RAISE EXCEPTION 'P2 availability default failed';
  END IF;
  UPDATE public.cars SET status = 'sold' WHERE id = v_car;
  IF (SELECT is_available FROM public.cars WHERE id = v_car) THEN
    RAISE EXCEPTION 'P2 derived availability failed';
  END IF;
  UPDATE public.cars SET status = 'available' WHERE id = v_car;

  INSERT INTO public.vehicle_spotlights (car_id, score, tier, reason)
  VALUES (v_car, 65, 'Gold', 'Synthetic spotlight');
  BEGIN
    INSERT INTO public.vehicle_spotlights (car_id, score, tier, reason)
    VALUES (v_car, 65, 'Gold', 'Duplicate synthetic spotlight');
    RAISE EXCEPTION 'P4B2 spotlight uniqueness failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.cars (name, vin) VALUES ('Duplicate VIN', '1HGCM82633A004352');
    RAISE EXCEPTION 'P2 VIN uniqueness failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.cars (name, vin) VALUES ('Invalid VIN', 'invalid');
    RAISE EXCEPTION 'P2 VIN validity failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.car_specs (car_id, engine, drive)
  VALUES (v_car, 'Fixture engine', 'FWD');
  BEGIN
    INSERT INTO public.car_specs (car_id, engine) VALUES (v_car, 'Duplicate specs');
    RAISE EXCEPTION 'P2 one-to-one specifications failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.car_images (car_id, image_url)
    VALUES (-1, 'https://example.invalid/image');
    RAISE EXCEPTION 'P2 image foreign key failed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO public.car_images (car_id, image_url, image_type)
  VALUES (v_car, 'https://example.invalid/fixture-image', 'primary');

  INSERT INTO public.bookings (user_id, car_id, booking_date, time_slot)
  VALUES (v_user, v_car, v_future_date, '09:00-10:00')
  RETURNING id INTO v_booking;
  BEGIN
    INSERT INTO public.bookings (user_id, car_id, booking_date, time_slot)
    VALUES (v_user, v_car, v_future_date, '09:00-10:00');
    RAISE EXCEPTION 'P2 active booking uniqueness failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking;
  INSERT INTO public.bookings (user_id, car_id, booking_date, time_slot)
  VALUES (v_user, v_car, v_future_date, '09:00-10:00');

  INSERT INTO public.financing_leads (
    reference_code, idempotency_key, car_id, user_id, customer_name,
    customer_phone, vehicle_price_snapshot, down_payment, loan_amount,
    annual_interest_rate, loan_term_months, monthly_payment,
    total_payment, total_interest, contact_consent
  ) VALUES (
    'S17-SYNTHETIC', 's17-schema-test', v_car, v_user, 'Synthetic customer',
    '0000000000', 1000000, 100000, 900000, 8, 12, 80000, 960000, 60000, TRUE
  );
  BEGIN
    INSERT INTO public.financing_leads (
      reference_code, idempotency_key, car_id, customer_name, customer_phone,
      vehicle_price_snapshot, down_payment, loan_amount, annual_interest_rate,
      loan_term_months, monthly_payment, total_payment, total_interest, contact_consent
    ) VALUES (
      'S17-DUP', 's17-schema-test', v_car, 'Synthetic customer', '0000000000',
      1000000, 100000, 900000, 8, 12, 80000, 960000, 60000, TRUE
    );
    RAISE EXCEPTION 'P2 financing idempotency failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.cars WHERE id = v_car;
    RAISE EXCEPTION 'P2 financing retention restriction failed';
  EXCEPTION WHEN SQLSTATE '23001' OR foreign_key_violation THEN NULL;
  END;

  INSERT INTO public.exchange_rate_snapshots (
    base_currency, rates, provider, retrieved_at, observed_at, expires_at
  ) VALUES (
    'USD', '{"UGX":3500}'::jsonb, 'synthetic-test',
    TIMESTAMPTZ '2030-01-02 00:00:00+00', TIMESTAMPTZ '2030-01-01 00:00:00+00',
    TIMESTAMPTZ '2030-01-03 00:00:00+00'
  );
  IF NOT EXISTS (SELECT 1 FROM public.exchange_rate_snapshots
    WHERE provider = 'synthetic-test' AND rates->>'UGX' = '3500') THEN
    RAISE EXCEPTION 'P2 JSONB exchange-rate round trip failed';
  END IF;
  BEGIN
    INSERT INTO public.exchange_rate_snapshots (
      base_currency, rates, provider, retrieved_at, expires_at
    ) VALUES ('USD', '{}', 'bad-expiry', now(), now() - interval '1 hour');
    RAISE EXCEPTION 'P2 exchange-rate expiry constraint failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.cars (name) VALUES ('S17 cascade fixture') RETURNING id INTO v_other_car;
  INSERT INTO public.car_specs (car_id) VALUES (v_other_car);
  INSERT INTO public.car_images (car_id, image_url)
  VALUES (v_other_car, 'https://example.invalid/cascade');
  DELETE FROM public.cars WHERE id = v_other_car;
  IF EXISTS (SELECT 1 FROM public.car_specs WHERE car_id = v_other_car)
     OR EXISTS (SELECT 1 FROM public.car_images WHERE car_id = v_other_car) THEN
    RAISE EXCEPTION 'P2 car child cascading failed';
  END IF;

  RAISE NOTICE 'P2 schema assertions passed: tables, identities, uniqueness, foreign keys, booking reuse, financing, JSONB, expiry, cascade';
END;
$$;

ROLLBACK;
