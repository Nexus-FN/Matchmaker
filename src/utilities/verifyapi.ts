import db from "../database/connection.js";
import { eq } from "drizzle-orm";
import { loopkeys } from "../database/schema.js";

async function verifyApiKey(loopkey: string): Promise<boolean> {
    console.log("Verifying api key: " + loopkey);
    const loopkeyquery = await db.select().from(loopkeys).where(eq(loopkeys.loopkey, loopkey));
    console.log(loopkeyquery);
    if (loopkeyquery.length == 0) {
        return false;
    }
    console.log("Verified api key");
    return true;
}

export default verifyApiKey;