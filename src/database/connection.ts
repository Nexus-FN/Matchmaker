import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
dotenv.config();

console.log("Connecting to database...");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

await migrate(db, { migrationsFolder: "drizzle" });

db.execute(sql`SELECT 1`)
	.then(() => {
		console.log("Database connected!");
	})
	.catch((err) => {
		console.log("Database connection failed!");
		console.log(err);
		process.exit(1);
	});

export default db;
