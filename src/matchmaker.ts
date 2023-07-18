import { setTimeout } from "timers";
import { AES256Encryption } from '@ryanbekhen/cryptkhen';
import { Message } from 'amqplib/callback_api';
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
    joinTime: Date,
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

        const auth = req.headers['authorization']

        // Handle unauthorized connection
        if (auth == undefined) {
            return ws.close();
        }

        // Destructure the authorization header
        const [, , , encrypted] = auth.split(" ");
        if (!encrypted) return ws.close(1008, 'invalid_payload');

        let decrypted: string;

        const currentTime = new Date();

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

        console.log(`New client: ${accountId} - ${playlist} - ${region} - ${customkey} - ${priority}`)

        const clientInfo: Client = {
            accountId: accountId,
            playlist: playlist,
            region: region,
            socket: ws,
            joinTime: priority ? tenMinutesAgo : currentTime,
            ticketId: ticketId,
            matchId: matchId,
            sessionId: sessionId,
            customkey: customkey,
            preventmessage: false,
        }

        this.clients.set(accountId, clientInfo);

        this.queueNewClients(playlist, region, customkey, ws);

        // Consume messages from RabbitMQ
        channel.consume("matchmaker", async (msg: Message | null) => {
            if (msg) {
                const message = JSON.parse(msg.content.toString())
                switch (message.action) {
                    case 'UPDATE': {

                        await this.Queued(message.data.playlist, message.data.region, message.data.customkey);

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

                        const sortedClients = Array.from(this.clients.values())
                            .filter(value =>
                                value.playlist === server.playlist
                                && value.region === server.region
                                && value.customkey === server.customkey
                                && value.preventmessage === false)
                            .sort((a: Client, b: Client) => a.joinTime.getTime() - b.joinTime.getTime())
                            .slice(0, server.maxplayers!);

                        this.SessionAssignment(sortedClients, server);

                        setTimeout(async () => {
                            this.Join(sortedClients, server);
                        }, 200);

                        break;
                    }
                    case 'STATUS': {

                        try {
                            if (message.data.status !== 'online') return;

                            const data = message.data;

                            const sortedClients = Array.from(this.clients.values())
                                .filter(value =>
                                    value.playlist === data.playlist
                                    && value.region === data.region
                                    && value.customkey === data.customkey
                                    && value.preventmessage === false)
                                .sort((a: Client, b: Client) => a.joinTime.getTime() - b.joinTime.getTime())

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
                                this.SessionAssignment(sortedClients, server);

                                setTimeout(async () => {
                                    this.Join(sortedClients, server);
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
        }, { noAck: false });

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

    }

    private async queueNewClients(playlistarg: string, regionarg: string, customkeyarg: string, websocket: WebSocket) {

        const sortedClients = Array.from(this.clients.values())
            .filter(value => value.playlist === playlistarg && value.region === regionarg && value.customkey === customkeyarg)

        const msg = {
            action: 'UPDATE',
            data: {
                clientAmount: sortedClients.length,
                region: regionarg,
                playlist: playlistarg,
                customkey: customkeyarg,
                type: 'NEW'
            },
        };

        this.Connecting(websocket);

        this.Waiting(this.clients.size, playlistarg, regionarg, customkeyarg, websocket);

        channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)))
    }

    private async Connecting(ws: WebSocket) {
        ws.send(
            JSON.stringify({
                payload: {
                    state: "Connecting",
                },
                name: "StatusUpdate",
            }),
        );
    }

    private async Waiting(players: number, playlist: string, regionarg: string, customkeyarg: string, ws: WebSocket) {

        const sortedClients = Array.from(this.clients.values())
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

    private async Queued(playlistarg: string, regionarg: string, customkeyarg: string) {
        const sortedClients = Array.from(this.clients.values())
            .filter(client => client.playlist === playlistarg
                && client.region === regionarg
                && client.customkey === customkeyarg
                && !client.preventmessage)
            .sort((a: Client, b: Client) => a.joinTime.getTime() - b.joinTime.getTime())

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

    private async SessionAssignment(sortedClients: Client[], serverArg: Server) {
        if (!serverArg || serverArg.maxplayers == undefined || serverArg.players == undefined) return;
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

    private async Join(sortedClients: Client[], serverArg: Server) {

        if (!serverArg || serverArg.maxplayers == undefined || serverArg.players == undefined) return;

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
                })
            );
            serverArg.players++;
        }

        await db.update(servers).set({
            players: serverArg.players
        }).where(eq(servers.id, serverArg.id));
    }
}

//Curly brace  hell :(

export default new Matchmaker();