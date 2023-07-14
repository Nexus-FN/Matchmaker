import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const migrationClient = postgres("postgresql://asteria:mrU63-_sd8gN.nYPxo6ma-_cRT@15.204.174.103/asteria", { max: 1 });

const client = postgres("postgresql://asteria:mrU63-_sd8gN.nYPxo6ma-_cRT@15.204.174.103/asteria");
const db = drizzle(client);

await migrate(db, { migrationsFolder: './drizzle' });

export default db;