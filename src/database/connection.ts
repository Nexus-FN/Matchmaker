import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(process.env.DB_URI, { max: 10 });
const db = drizzle(client);

//Disabling migrations for now

export default db;