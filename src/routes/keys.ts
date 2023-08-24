import { Hono } from "hono";
import verifyApiKey from "../utilities/verifyapi.js";
import db from "../database/connection.js";
import { apikeys } from "../database/schema.js";
import { randomUUID } from "crypto";

function apiKeysRoutes(app: Hono) {
	app.delete("/api/v1/apikeys/delete/:apikey", async (c) => {
		const apiKey = c.req.param("apikey");

		if (!apiKey)
			return c.json(
				{
					error: "Api key missing",
				},
				400,
			);
		if (!verifyApiKey(apiKey))
			return c.json(
				{
					error: "Invalid api key",
				},
				401,
			);

		c.json({ success: true }, 200);
	});

	app.put("/api/v1/apikeys/create", async (c) => {
		const apiKey = randomUUID();

		await db.insert(apikeys).values({ apikey: apiKey });

		return c.json(
			{
				message: "Successfully added api key to api key array",
				apikey: apiKey,
			},
			200,
		);
	});
}

export default apiKeysRoutes;
