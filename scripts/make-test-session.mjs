import 'dotenv/config';
import mysql from 'mysql2/promise';
import * as jose from 'jose';

const role = process.argv[2] || 'owner'; // viewer | staff | manager | owner
const unionId = `test-${role}`;
const email = `test-${role}@safi-sport.test`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.query(
  `INSERT INTO users (unionId, email, name, role, createdAt, lastSignInAt)
   VALUES (?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE role = VALUES(role), lastSignInAt = NOW()`,
  [unionId, email, `Test ${role}`, role],
);
await conn.end();

const secret = new TextEncoder().encode(process.env.APP_SECRET);
const token = await new jose.SignJWT({ unionId, clientId: 'test-client' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d') // matches production session policy
  .sign(secret);

console.log(token);
