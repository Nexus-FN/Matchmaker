import { setTimeout } from "timers";
import { AES256Encryption } from "@ryanbekhen/cryptkhen";
import { Message } from "amqplib/callback_api";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { z } from "zod";
import { IncomingMessage } from "http";

import db from "./database/connection.js";
import { servers, Server } from "./database/schema.js";
import { ServerStatus } from "./routes/server.js";
import { channel } from "./utilities/rabbitmq.js";
import { RoleEnum } from "./types/matchmaking.js";
import { roleCheck } from "./utilities/roles.js";

type Client = {
	accountId: string;
	playlist: string;
	region: string;
	season: number;
	socket: WebSocket;
	joinTime: Date;
	ticketId: string;
	matchId: string;
	sessionId: string;
	customkey: string;
	preventmessage: boolean;
};

const decryptedSchema = z.object({
	playerId: z.string(),
	partyPlayerIds: z.array(z.string()),
	bucketId: z.string(),
	attributes: z.object({
		"player.role": z.enum([
			RoleEnum.Owner,
			RoleEnum.Dev,
			RoleEnum.Mod,
			RoleEnum.T3,
			RoleEnum.T2,
			RoleEnum.T1,
			RoleEnum.User,
			RoleEnum.Banned,
		]),
		"player.season": z.number(),
		"player.option.partyId": z.string(),
		"player.userAgent": z.string(),
		"player.platform": z.string(),
		"player.option.linkType": z.string(),
		"player.preferredSubregion": z.string(),
		"player.input": z.string(),
		"playlist.revision": z.number(),
		"player.option.customKey": z.string().optional(),
		"player.option.fillTeam": z.boolean(),
		"player.option.linkCode": z.string().optional(),
		"player.option.uiLanguage": z.string(),
		"player.privateMMS": z.boolean(),
		"player.option.spectator": z.boolean(),
		"player.inputTypes": z.any(),
		"player.option.groupBy": z.string(),
		"player.option.microphoneEnabled": z.boolean(),
	}),
	expireAt: z.string(),
	nonce: z.string(),
});

const aes256 = new AES256Encryption("apollobeta");
export const clients = new Map();

class Matchmaker {
	public static async server(ws: WebSocket, req: IncomingMessage) {
		if (!req.headers) {
			return ws.close(1008, "missing_payload");
		}
		const auth = req.headers.authorization;

		if (auth === undefined || auth === null) {
			return ws.close(1008, "invalid_payload");
		}

		const [, , encrypted] = auth.split(" ");
		if (!encrypted) {
			return ws.close(1008, "invalid_payload");
		}

		let decrypted: string;

		const currentTime = new Date();

		try {
			decrypted = aes256.decrypt(Buffer.from(encrypted, "base64")).toString();
		} catch (err) {
			return ws.close(1008, "invalid_payload");
		}

		const decryptedData = decryptedSchema.safeParse(JSON.parse(decrypted));
		if (!decryptedData.success) {
			return ws.close(1008, "invalid_payload");
		}

		if (
			new Date(currentTime).getTime() -
			new Date(
				decryptedSchema.parse(JSON.parse(decrypted)).expireAt,
			).getTime() >
			30000
		)
			return ws.close(1008, "timestamp_expired");

		if (clients.has(decryptedData.data.playerId))
			return ws.close(1008, "already_queued");

		const payload: z.infer<typeof decryptedSchema> = decryptedData.data;

		const customKey = payload.attributes["player.option.customKey"] ?? "none";
		const season = payload.attributes["player.season"];

		const ticketId = uuidv4().toString().replace(/-/gi, "");
		const matchId = uuidv4().toString().replace(/-/gi, "");
		const sessionId = uuidv4().toString().replace(/-/gi, "");

		const tenMinutesAgo = new Date();
		tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

		const region = payload.bucketId.split(":")[2];
		const playlist = payload.bucketId.split(":")[3];

		const clientInfo: Client = {
			accountId: payload.playerId,
			playlist: playlist,
			region: region,
			season: payload.attributes["player.season"],
			socket: ws,
			joinTime: roleCheck(payload.attributes["player.role"], RoleEnum.T1)
				? tenMinutesAgo
				: currentTime,
			ticketId: ticketId,
			matchId: matchId,
			sessionId: sessionId,
			customkey: customKey,
			preventmessage: false,
		};

		clients.set(payload.playerId, clientInfo);

		this.queueNewClients(playlist, region, customKey, season, ws);

		// Consume messages from RabbitMQ
		channel.consume(
			"matchmaker",
			async (msg: Message | null) => {
				if (msg) {
					const message = JSON.parse(msg.content.toString());
					switch (message.action) {
						case "UPDATE": {
							await this.queued(
								message.data.playlist,
								message.data.region,
								message.data.customkey,
								season,
							);

							const serverquery = await db
								.select()
								.from(servers)
								.where(
									and(
										eq(servers.playlist, message.data.playlist),
										eq(servers.region, message.data.region),
										eq(servers.customkey, message.data.customkey),
										eq(servers.season, season),
										eq(servers.status, ServerStatus.ONLINE),
									),
								);
							if (serverquery.length === 0) return;
							const server = serverquery[0] as Server;

							if (message.data.type === "CLOSE") return;

							const sortedClients = Array.from(clients.values())
								.filter(
									(value) =>
										value.playlist === server.playlist &&
										value.region === server.region &&
										value.customkey === server.customkey &&
										value.season === server.season &&
										value.preventmessage === false,
								)
								.sort(
									(a: Client, b: Client) =>
										a.joinTime.getTime() - b.joinTime.getTime(),
								)
								.slice(0, server.maxplayers as number);

							this.sessionAssignment(sortedClients, server);

							setTimeout(async () => {
								this.join(sortedClients, server);
							}, 200);

							break;
						}
						case "STATUS": {
							try {
								if (message.data.status !== "online") return;

								const data = message.data;

								const sortedClients = Array.from(clients.values())
									.filter(
										(value) =>
											value.playlist === data.playlist &&
											value.region === data.region &&
											value.customkey === data.customkey &&
											value.season === data.season &&
											value.preventmessage === false,
									)
									.sort(
										(a: Client, b: Client) =>
											a.joinTime.getTime() - b.joinTime.getTime(),
									);

								const serverquery = await db
									.select()
									.from(servers)
									.where(
										and(
											eq(servers.playlist, message.data.playlist),
											eq(servers.region, message.data.region),
											eq(servers.customkey, message.data.customkey),
											eq(servers.season, season),
											eq(servers.status, ServerStatus.ONLINE),
										),
									);
								if (serverquery.length === 0) return;
								const server = serverquery[0] as Server;

								setTimeout(async () => {
									this.sessionAssignment(sortedClients, server);

									setTimeout(async () => {
										this.join(sortedClients, server);
									}, 200);
								}, 100);
								break;
							} catch (err) { }
						}
							break;
						default: {
							break;
						}
					}
					channel.ack(msg);
				}
			},
			{ noAck: false },
		);

		ws.on("close", () => {
			const deleted = clients.delete(payload.playerId);
			if (!deleted) return;
			const msg = {
				action: "UPDATE",
				data: {
					clientAmount: clients.size,
					region: region,
					playlist: playlist,
					customkey: customKey,
					type: "CLOSE",
				},
			};
			channel.sendToQueue("matchmaker", Buffer.from(JSON.stringify(msg)));
		});
	}

	private static async queueNewClients(
		playlistarg: string,
		regionarg: string,
		customkeyarg: string,
		seasonarg: number,
		websocket: WebSocket,
	) {
		const sortedClients = Array.from(clients.values()).filter(
			(value) =>
				value.playlist === playlistarg &&
				value.region === regionarg &&
				value.customkey === customkeyarg,
		);

		const msg = {
			action: "UPDATE",
			data: {
				clientAmount: sortedClients.length,
				region: regionarg,
				playlist: playlistarg,
				customkey: customkeyarg,
				season: seasonarg,
				type: "NEW",
			},
		};

		this.connecting(websocket);

		this.waiting(
			clients.size,
			playlistarg,
			regionarg,
			customkeyarg,
			seasonarg,
			websocket,
		);

		channel.sendToQueue("matchmaker", Buffer.from(JSON.stringify(msg)));
	}

	private static async connecting(ws: WebSocket) {
		ws.send(
			JSON.stringify({
				payload: {
					state: "Connecting",
				},
				name: "StatusUpdate",
			}),
		);
	}

	private static async waiting(
		players: number,
		playlist: string,
		regionarg: string,
		customkeyarg: string,
		seasonarg: number,
		ws: WebSocket,
	) {
		const sortedClients = Array.from(clients.values()).filter(
			(value) =>
				value.playlist === playlist &&
				value.region === regionarg &&
				value.customkey === customkeyarg &&
				value.season === seasonarg,
		);

		ws.send(
			JSON.stringify({
				payload: {
					totalPlayers: players,
					connectedPlayers: sortedClients.length,
					state: "Waiting",
				},
				name: "StatusUpdate",
			}),
		);
	}

	private static async queued(
		playlistarg: string,
		regionarg: string,
		customkeyarg: string,
		seasonarg: number,
	) {
		const sortedClients = Array.from(clients.values())
			.filter(
				(client: Client) =>
					client.playlist === playlistarg &&
					client.region === regionarg &&
					client.customkey === customkeyarg &&
					client.season === seasonarg &&
					!client.preventmessage,
			)
			.sort(
				(a: Client, b: Client) => a.joinTime.getTime() - b.joinTime.getTime(),
			);

		for (const client of sortedClients) {
			const queuedPlayers = sortedClients.length;
			const estimatedWaitSec = queuedPlayers * 2;
			const status = queuedPlayers === 0 ? 2 : 3;

			(client.socket as WebSocket).send(
				JSON.stringify({
					payload: {
						ticketId: client.ticketId,
						queuedPlayers,
						estimatedWaitSec,
						status,
						state: "Queued",
					},
					name: "StatusUpdate",
				}),
			);
		}
	}

	private static async sessionAssignment(
		sortedClients: Client[],
		serverArg: Server,
	) {
		if (
			!serverArg ||
			serverArg.maxplayers === undefined ||
			serverArg.players === undefined ||
			serverArg.players === null ||
			serverArg.maxplayers === null
		)
			return;
		if (serverArg.players >= serverArg.maxplayers) return;

		let playerCount = 0;

		for (const [index, client] of sortedClients.entries()) {
			if (index >= serverArg.maxplayers) break;

			if (playerCount >= serverArg.maxplayers) break;

			(client.socket as WebSocket).send(
				JSON.stringify({
					payload: {
						matchId: client.matchId,
						state: "SessionAssignment",
					},
					name: "StatusUpdate",
				}),
			);

			playerCount++;
		}
	}

	private static async join(sortedClients: Client[], serverArg: Server) {
		if (
			!serverArg ||
			serverArg.maxplayers === undefined ||
			serverArg.players === undefined ||
			serverArg.players === null ||
			serverArg.maxplayers === null
		)
			return;
		if (serverArg.players >= serverArg.maxplayers) return;

		const maxPlayers = Math.min(serverArg.maxplayers, sortedClients.length);
		const clientsToJoin = sortedClients.slice(0, maxPlayers);

		for (const [index, client] of clientsToJoin.entries()) {
			if (index >= maxPlayers) break;

			if (serverArg.players >= serverArg.maxplayers) break;
			client.preventmessage = true;

			(client.socket as WebSocket).send(
				JSON.stringify({
					payload: {
						matchId: client.matchId,
						sessionId: client.sessionId,
						joinDelaySec: 1,
					},
					name: "Play",
				}),
			);
			serverArg.players++;
		}

		await db
			.update(servers)
			.set({
				players: serverArg.players,
			})
			.where(eq(servers.id, serverArg.id));
	}
}

//Curly brace hell :(

export default Matchmaker;
