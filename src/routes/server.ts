import { sql } from "drizzle-orm";
import { Context, Hono } from "hono";

import db from "../database/connection.js";
import { NewServer, servers } from "../database/schema.js";
import { channel } from "../utilities/rabbitmq.js";

export enum ServerStatus {
	ONLINE = "online",
	OFFLINE = "offline",
	GAMESTARTED = "gamestarted",
	GAMEENDED = "gamenended",
}

export enum ServerRegion {
	NAE = "NAE",
	EU = "EU",
	OCE = "OCE",
}

/*function determinePicture(serverStatus: ServerStatus): string {

    switch (serverStatus) {
        case ServerStatus.ONLINE:
            return "https://greencade.com/wp-content/uploads/2023/06/V01gNfN-removebg-preview.png"
        case ServerStatus.OFFLINE:
            return "https://static.tvtropes.org/pmwiki/pub/images/384px_ray.png"
        case ServerStatus.GAMESTARTED:
            return "https://static.wikia.nocookie.net/fortnite/images/d/d7/Battle_Bus_-_Vehicle_-_Fortnite.png/revision/latest?cb=20210927140325"
        case ServerStatus.GAMEENDED:
            return "https://static.wikia.nocookie.net/fortnite/images/1/1e/VictoryRoyaleSlate.png/revision/latest?cb=20220329154427"
    }

}*/

/* function determineTitle(serverStatus: ServerStatus, serverId: string): string {

    switch (serverStatus) {
        case ServerStatus.ONLINE:
            return `Server ${serverId} is now online`
        case ServerStatus.OFFLINE:
            return `Server ${serverId} is now offline`
        case ServerStatus.GAMESTARTED:
            return `Server ${serverId}'s round has been started. You can no longer join this server.`
        case ServerStatus.GAMEENDED:
            return `Server ${serverId}'s round has ended. GG!`
    }

} */

function serverRoutes(app: Hono) {
	app.post("/api/v1/server/status/:serverId/:status", async (c: Context) => {
		let customkey = c.req.query("customkey");
		if (!customkey) customkey = "none";

		const serverId = c.req.param("serverId");
		const status = c.req.param("status");

		if (status !== "online" && status !== "offline" && status !== "gamestarted" && status !== "gameended")
			return c.json(
				{
					error: "Status missing",
				},
				400,
			);

		const serverquery = await db.select().from(servers).where(sql`${servers.id} = ${serverId}`);
		if (serverquery.length === 0)
			return c.json(
				{
					error: "Server not found",
				},
				404,
			);
		const server = serverquery[0];

		const statusString = status as string;
		const statusEnum = ServerStatus[statusString.toUpperCase()];

		server.status = statusEnum;
		server.players = 0;

		await db.update(servers).set(server).where(sql`${servers.id} = ${serverId}`);

		const msg = {
			action: "STATUS",
			data: {
				playlist: server.playlist,
				region: server.region,
				status: status === "gamestarted" ? "offline" : status,
				customkey: customkey,
				serverid: serverId,
				season: server.season,
			},
		};

		console.log(msg);

		channel.sendToQueue("matchmaker", Buffer.from(JSON.stringify(msg)));

		/*const formattedPlaylist = server.playlist!.toLowerCase().replace("playlist_default", "").replace("_", " ").toUpperCase()

        const webhook = await fetch("https://discord.com/api/webhooks/1129469545959137402/rWoZxcdihnfr-AnyYiq0s5IRPxzYx4cYE143okLf7_MugFr3N0QrNbbkS1zPUW9D5I9p", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "content": null,
                "embeds": [
                    {
                        "title": "Server status",
                        "description": `${determineTitle(statusEnum, serverId)}`,
                        "color": 2829617,
                        "fields": [
                            {
                                "name": "Region",
                                "value": server.region
                            },
                            {
                                "name": "Playlist",
                                "value": formattedPlaylist
                            }
                        ],
                        "footer": {
                            "text": "Eon",
                            "icon_url": "https://cdn.discordapp.com/icons/1050468815319859291/98ed16d6b118e46a7983e1ee7ac04070.webp?size=96"
                        },
                        "timestamp": new Date().toISOString(),
                        "thumbnail": {
                            "url": determinePicture(statusEnum)
                        }
                    }
                ],
                "attachments": []
            })
        })
        if (webhook.status !== 204) return c.json({
            error: "Webhook failed"
        }, 500)*/

		return c.json(
			{
				message: `Set server ${serverId} status to ${statusEnum}`,
			},
			200,
		);
	});

	app.post("/api/v1/server/playlist/:serverId/:playlist", async (c: Context) => {
		const serverId = c.req.param("serverId");
		const playlist = c.req.param("playlist");

		const serverquery = await db.select().from(servers).where(sql`${servers.id} = ${serverId}`);
		if (serverquery.length === 0)
			return c.json(
				{
					error: "Server not found",
				},
				404,
			);
		const server = serverquery[0];

		server.playlist = playlist;

		await db.update(servers).set(server).where(sql`${servers.id} = ${serverId}`);

		return c.json(
			{
				message: "success",
			},
			200,
		);
	});

	app.put("/api/v1/server/create", async (c: Context) => {
		const body = await c.req.json();

		const parameters = ["serverId", "region", "playlist", "status", "maxPlayers", "players", "ip", "port"];

		for (const parameter of parameters) {
			if (!body[parameter])
				return c.json(
					{
						error: `${parameter} missing`,
					},
					400,
				);
		}

		const { region, playlist, maxPlayers, ip, port, season } = body;

		const customkey = body.customkey || "none";
		const regionString = typeof region === "string" ? region : "";
		const regionEnum = ServerRegion[regionString.toUpperCase()];

		const server: NewServer = {
			region: regionEnum,
			playlist: playlist,
			status: ServerStatus.OFFLINE,
			maxplayers: maxPlayers,
			players: 0,
			customkey: customkey,
			ip: ip,
			season: season,
			port: port,
		};

		await db.insert(servers).values(server);

		return c.json(
			{
				message: "Successfully added server to server array",
				server: server,
			},
			200,
		);
	});

	app.delete("/api/v1/server/delete/:serverId", async (c: Context) => {
		const serverId = c.req.param("serverId");

		const deleteServer = await db.delete(servers).where(sql`${servers.id} = ${serverId}`);

		return c.json(
			{
				message: `Successfully deleted server ${serverId}`,
			},
			200,
		);
	});
}

export default serverRoutes;
