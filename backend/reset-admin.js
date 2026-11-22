import db from './config/db.js';
import bcrypt from 'bcryptjs';
import { assertMutationTarget, verifyTarget, requireReady, runOperation, operationError } from './scripts/databaseOperations.js';

await runOperation(async () => {
  const config = assertMutationTarget();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Staging Administrator';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72 || name.length > 160) {
    throw operationError('ADMIN_CREDENTIALS_INVALID');
  }
  const hash = await bcrypt.hash(password, 12);
  return db.withTransaction(async tx => {
    await verifyTarget(tx, config.database);
    await tx.query('SELECT pg_advisory_xact_lock(17022)');
    await requireReady(tx);
    const { rows: [user] } = await tx.query('SELECT id,role FROM public.users WHERE lower(email)=$1 FOR UPDATE', [email]);
    if (user && user.role !== 'admin') throw operationError('NON_ADMIN_ACCOUNT_COLLISION');
    if (user) await tx.query('UPDATE public.users SET password=$1 WHERE id=$2', [hash,user.id]);
    else await tx.query("INSERT INTO public.users (name,email,password,role) VALUES ($1,$2,$3,'admin')", [name,email,hash]);
    return { success: true, status: user ? 'ROTATED' : 'CREATED' };
  });
}, db.close);
