import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

const email = 'test@example.com';
const password = 'testPassword123';
const name = 'Test User';

try {
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user
  const result = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name',
    [name, email, hashedPassword, 'user']
  );

  console.log('✅ Test user created:');
  console.log('ID:', result.rows[0].id);
  console.log('Name:', result.rows[0].name);
  console.log('Email:', result.rows[0].email);
  console.log('\n📧 Email: test@example.com');
  console.log('🔑 Password: testPassword123');
  console.log('\n✅ Ready to test login!');

  await pool.end();
} catch (error) {
  if (error.code === '23505') {
    console.log('⚠️ User already exists with that email');
  } else {
    console.error('Error:', error.message);
  }
  await pool.end();
  process.exit(1);
}
