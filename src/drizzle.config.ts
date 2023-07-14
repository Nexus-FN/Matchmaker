import type { Config } from "drizzle-kit";

export default {
    schema: "./src/database/schema.ts",
    out: "./drizzle",
} satisfies Config;