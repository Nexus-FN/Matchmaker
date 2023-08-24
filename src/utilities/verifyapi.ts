import db from "../database/connection.js";
import { eq } from "drizzle-orm";
import { apikeys } from "../database/schema.js";

async function verifyApiKey(apikey: string): Promise<boolean> {
	console.log(`Verifying api key: ${apikey}`);
	const apikeyquery = await db.select().from(apikeys).where(eq(apikeys.apikey, apikey));
	console.log(apikey);
	if (apikeyquery.length === 0) {
		return false;
	}
	console.log("Verified api key");
	return true;
}

export default verifyApiKey;
