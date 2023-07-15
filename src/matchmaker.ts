import { setTimeout } from "timers";

import { AES256Encryption } from '@ryanbekhen/cryptkhen';
import { Message } from 'amqplib/callback_api'
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { z } from "zod";

import db from './database/connection.js';
import { servers, Server } from './database/schema.js';
import { ServerStatus } from './routes/server.js';
import { channel } from "./utilities/rabbitmq.js";

type Client = {
    accountId: string,
    playlist: string,
    region: string,
    socket: object
    joinTime: string,
    ticketId: string,
    matchId: string,
    sessionId: string,
    customkey: string,
    preventmessage: boolean,
}

const clientsMap = new Map();

class Matchmaker {

    // Create a map to store clients
    clients = clientsMap;

    public async server(ws: WebSocket, req) {

        const clients = this.clients;

        const auth = req.headers['authorization']

        // Handle unauthorized connection
        if (auth == undefined) {
            return ws.close();
        }

        // Destructure the authorization header
        const [, , , encrypted] = auth.split(" ");
        if (!encrypted) return ws.close(1008, 'invalid_payload');

        let decrypted: string;

        const currentTime = new Date().toISOString();

        const aes256 = new AES256Encryption("test");

        try {
            decrypted = aes256.decrypt(Buffer.from(encrypted, 'base64')).toString();
        } catch (err) {
            return ws.close(1008, 'invalid_payload');
        }

        const decryptedSchema = z.object({
            accountId: z.string(),
            playlist: z.string(),
            region: z.string(),
            customkey: z.string(),
            priority: z.boolean(),
            timestamp: z.string(),
        });

        const decryptedData = decryptedSchema.safeParse(JSON.parse(decrypted));
        if (!decryptedData.success) {
            console.error(decryptedData.error);
            return ws.close(1008, 'invalid_payload');
        }

        if (new Date(currentTime).getTime() - new Date(decryptedSchema.parse(JSON.parse(decrypted)).timestamp).getTime() > 5000) return ws.close(1008, 'timestamp_expired');

        if (this.clients.has(decryptedData.data.accountId)) return ws.close(1008, 'already_queued');

        const { playlist, accountId, region, customkey, priority } = decryptedData.data;

        const ticketId = uuidv4().toString().replace(/-/ig, "");
        const matchId = uuidv4().toString().replace(/-/ig, "");
        const sessionId = uuidv4().toString().replace(/-/ig, "");

        const tenMinutesAgo = new Date();
        tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);
        const tenMinutesAgoISO = tenMinutesAgo.toISOString();

        const clientInfo: Client = {
            accountId: accountId,
            playlist: playlist,
            region: region,
            socket: ws,
            joinTime: priority ? tenMinutesAgoISO : currentTime,
            ticketId: ticketId,
            matchId: matchId,
            sessionId: sessionId,
            customkey: customkey,
            preventmessage: false,
        }

        this.clients.set(accountId, clientInfo);

        queueNewClients(playlist, region, customkey);

        // Consume messages from RabbitMQ
        channel.consume("matchmaker", async (msg: Message | null) => {
            if (msg) {
                const message = JSON.parse(msg.content.toString())
                switch (message.action) {
                    case 'UPDATE': {

                        await Queued(message.data.playlist, message.data.region, message.data.customkey);

                        const serverquery = await db.select().from(servers).where(
                            and(
                                eq(servers.playlist, message.data.playlist),
                                eq(servers.region, message.data.region),
                                eq(servers.customkey, message.data.customkey),
                                eq(servers.status, ServerStatus.ONLINE)
                            )
                        );
                        if (serverquery.length == 0) return
                        const server = serverquery[0] as Server;

                        if (message.data.type == "CLOSE") return;

                        const sortedClients = Array.from(clients.values())
                            .filter(value =>
                                value.playlist === server.playlist
                                && value.region === server.region
                                && value.customkey === server.customkey
                                && value.preventmessage === false)
                            .sort((a, b) => a.joinTime - b.joinTime)
                            .slice(0, server.maxplayers!);

                        SessionAssignment(sortedClients, server);

                        setTimeout(async () => {
                            Join(sortedClients, server);
                        }, 200);

                        break;
                    }
                    case 'STATUS': {

                        try {
                            if (message.data.status !== 'online') {
                                return;
                            }

                            const data = message.data;

                            const sortedClients = Array.from(clients.values())
                                .filter(value =>
                                    value.playlist === data.playlist
                                    && value.region === data.region
                                    && value.customkey === data.customkey
                                    && value.preventmessage === false)
                                .sort((a, b) => a.joinTime - b.joinTime);

                            const serverquery = await db.select().from(servers).where(
                                and(
                                    eq(servers.playlist, message.data.playlist),
                                    eq(servers.region, message.data.region),
                                    eq(servers.customkey, message.data.customkey),
                                    eq(servers.status, ServerStatus.ONLINE)
                                )
                            )
                            if (serverquery.length == 0) return;
                            const server = serverquery[0] as Server;

                            setTimeout(async () => {
                                SessionAssignment(sortedClients, server);

                                setTimeout(async () => {
                                    Join(sortedClients, server);
                                }, 200);
                            }, 100);
                            break;
                        } catch (err) {
                            //console.log(err)
                        }
                    }
                        break;
                    default: {
                        //console.log("Unknown action")
                        break;
                    }
                }
                //console.log(message)
                channel.ack(msg)
            }
        })

        ws.on('close', () => {
            const deleted = this.clients.delete(accountId)
            if (!deleted) return;
            const msg = {
                action: 'UPDATE',
                data: {
                    clientAmount: this.clients.size,
                    region: region,
                    playlist: playlist,
                    customkey: customkey,
                    type: 'CLOSE'
                },
            }
            channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)))
        });

        async function queueNewClients(playlistarg: string, regionarg: string, customkeyarg: string) {

            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist && value.region === regionarg && value.customkey === customkeyarg)

            const msg = {
                action: 'UPDATE',
                data: {
                    clientAmount: sortedClients.length,
                    region: regionarg,
                    playlist: playlist,
                    customkey: customkeyarg,
                    type: 'NEW'
                },
            };

            Connecting();

            Waiting(clients.size, playlist, region, customkey);

            channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)))
        }

        async function Connecting() {
            //console.log(`Connecting. TicketId: ${ticketId}`);
            // Send a "Connecting" status update to the client
            ws.send(
                JSON.stringify({
                    payload: {
                        state: "Connecting",
                    },
                    name: "StatusUpdate",
                }),
            );
        }

        async function Waiting(players: number, playlist: string, regionarg: string, customkeyarg: string) {
            //console.log(`Waiting.`);
            // Send a "Waiting" status update to the client with the total number of players

            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist
                    && value.region === regionarg
                    && value.customkey === customkeyarg)

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

        async function Queued(playlistarg: string, regionarg: string, customkeyarg: string) {

            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlistarg
                    && value.region === regionarg
                    && value.customkey === customkeyarg
                    && value.preventmessage === false)
                .sort((a, b) => a.joinTime - b.joinTime);

            for (const client of sortedClients) {
                if (client.preventmessage === true) continue;
                (client.socket as WebSocket).send(
                    JSON.stringify({
                        payload: {
                            ticketId: client.ticketId,
                            queuedPlayers: sortedClients.length,
                            estimatedWaitSec: sortedClients.length * 2,
                            status: sortedClients.length == 0 ? 2 : 3,
                            state: "Queued",
                        },
                        name: "StatusUpdate",
                    }),
                );
            }
        }

        async function SessionAssignment(sortedClients: Client[], serverarg: Server) {
            for (const [index, client] of sortedClients.entries()) {

                if (!serverarg) return;
                if (serverarg.maxplayers == undefined || serverarg.players == undefined) return;

                if (serverarg.players >= serverarg.maxplayers) return;

                if (index >= serverarg.maxplayers) return;

                (client.socket as WebSocket).send(
                    JSON.stringify({
                        payload: {
                            matchId: client.matchId,
                            state: "SessionAssignment",
                        },
                        name: "StatusUpdate",
                    }),
                );
            }
        }

        async function Join(sortedClients: Client[], serverarg: Server) {
            if (!serverarg) return;
            if (serverarg.maxplayers == undefined || serverarg.players == undefined) return;

            if (serverarg.players >= serverarg.maxplayers) return;

            if (serverarg.maxplayers === null) return;
            if (serverarg.players >= serverarg.maxplayers) return;
            const maxPlayers = Math.min(serverarg.maxplayers, sortedClients.length);
            const clientsToJoin = sortedClients.slice(0, maxPlayers);

            for (const [index, client] of clientsToJoin.entries()) {
                if (!index) continue;
                if (serverarg.players >= serverarg.maxplayers) break;
                client.preventmessage = true;

                (client.socket as WebSocket).send(
                    JSON.stringify({
                        payload: {
                            matchId: client.matchId,
                            sessionId: client.sessionId,
                            joinDelaySec: 1,
                        },
                        name: "Play",
                    })
                );

                serverarg.players++;
            }
        }
    }
}

//Curly brace  hell :(

export default new Matchmaker();