import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres("postgresql://asteria:mrU63-_sd8gN.nYPxo6ma-_cRT@15.204.174.103/asteria", { max: 10 });
const db = drizzle(client);

//Disabling migrations for now

export default db;