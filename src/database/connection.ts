import dotenv from 'dotenv';
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
dotenv.config()

console.log("Connecting to database...");
const client = postgres(process.env.DB_URI, { max: 10 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: 'drizzle' });

db.execute(sql`SELECT 1`).then(() => {
    console.log("Database connected!");
}).catch((err) => {
    console.log("Database connection failed!");
    console.log(err);
    process.exit(1);
});

export default db;