import { setTimeout } from "timers";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { AES256Encryption } from '@ryanbekhen/cryptkhen';
import { channel } from "./utilities/rabbitmq.js";
import { ServerStatus, serverArray } from './routes/server.js';
const clientsMap = new Map();
class Matchmaker {
    // Create a map to store clients
    clients = clientsMap;
    async server(ws, req) {
        let clients = this.clients;
        const auth = req.headers['authorization'];
        // Handle unauthorized connection
        if (auth == undefined) {
            return ws.close();
        }
        // Destructure the authorization header
        let [_, __, ___, encrypted] = auth.split(" ");
        if (!encrypted)
            return ws.close(1008, 'invalid_payload');
        let decrypted;
        const currentTime = new Date().toISOString();
        const aes256 = new AES256Encryption("test");
        try {
            decrypted = aes256.decrypt(Buffer.from(encrypted, 'base64')).toString();
        }
        catch (err) {
            decrypted = `{"accountId":"1234","playlist":"playlist_defaultsolo","region":"NAE","timestamp":"${currentTime}","customkey":"none"}`;
        }
        const decryptedSchema = z.object({
            accountId: z.string(),
            playlist: z.string(),
            region: z.string(),
            customkey: z.string(),
            timestamp: z.string(),
        });
        const decryptedData = decryptedSchema.safeParse(JSON.parse(decrypted));
        if (!decryptedData.success) {
            console.error(decryptedData.error);
            return ws.close(1008, 'invalid_payload');
        }
        if (new Date(currentTime).getTime() - new Date(decryptedSchema.parse(JSON.parse(decrypted)).timestamp).getTime() > 5000)
            return ws.close(1008, 'timestamp_expired');
        if (this.clients.has(decryptedData.data.accountId))
            return ws.close(1008, 'already_queued');
        const { playlist, accountId, region, customkey } = decryptedData.data;
        const ticketId = uuidv4().toString().replace(/-/ig, "");
        const matchId = uuidv4().toString().replace(/-/ig, "");
        const sessionId = uuidv4().toString().replace(/-/ig, "");
        const clientInfo = {
            accountId: accountId,
            playlist: playlist,
            region: region,
            socket: ws,
            joinTime: currentTime,
            ticketId: ticketId,
            matchId: matchId,
            sessionId: sessionId,
            customkey: customkey,
            preventmessage: false,
        };
        this.clients.set(accountId, clientInfo);
        queueNewClients(playlist, region, customkey);
        // Consume messages from RabbitMQ
        channel.consume("matchmaker", async (msg) => {
            if (msg) {
                const message = JSON.parse(msg.content.toString());
                switch (message.action) {
                    case 'UPDATE':
                        console.log(`${message.data.clientAmount} clients in queue for ${message.data.playlist} in ${message.data.region} with custom key ${message.data.customkey}`);
                        await Queued(message.data.clientAmount, message.data.playlist, message.data.region, message.data.customkey);
                        const server = serverArray.find(server => server.region === message.data.region && server.playlist === message.data.playlist && (server.customkey === message.data.customkey || server.customkey === "none") && server.status === ServerStatus.ONLINE);
                        const customkey = server ? message.data.customkey : "none";
                        if (!server)
                            return console.log("No servers available");
                        console.log(`Found server ${server.serverId} for ${message.data.playlist} in ${message.data.region} with custom key ${customkey}`);
                        const msg = {
                            action: 'STATUS',
                            data: {
                                status: 'online',
                                playlist: message.data.playlist,
                                region: message.data.region,
                                customkey: customkey,
                                serverid: server.serverId,
                            },
                        };
                        channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)));
                        break;
                    case 'STATUS':
                        console.log("Received status update");
                        try {
                            if (message.data.status !== 'online')
                                return;
                            const data = message.data;
                            setTimeout(async () => {
                                SessionAssignment(data.playlist, data.region, data.customkey);
                                setTimeout(async () => {
                                    Join(data.playlist, data.region, data.customkey, data.serverid);
                                }, 200);
                            }, 100);
                            break;
                        }
                        catch (err) {
                            //console.log(err)
                        }
                    default:
                        //console.log("Unknown action")
                        break;
                }
                //console.log(message)
                channel.ack(msg);
            }
        });
        ws.on('close', () => {
            const deleted = this.clients.delete(accountId);
            if (!deleted)
                return console.log("Client was not deleted as it was not found in the map");
            const msg = {
                action: 'UPDATE',
                data: {
                    clientAmount: this.clients.size,
                    region: region,
                    playlist: playlist,
                    customkey: customkey,
                },
            };
            channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)));
        });
        async function queueNewClients(playlistarg, regionarg, customkeyarg) {
            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist && value.region === regionarg && value.customkey === customkeyarg);
            const msg = {
                action: 'UPDATE',
                data: {
                    clientAmount: sortedClients.length,
                    region: regionarg,
                    playlist: playlist,
                    customkey: customkeyarg,
                },
            };
            Connecting();
            Waiting(clients.size, playlist, region, customkey);
            channel.sendToQueue('matchmaker', Buffer.from(JSON.stringify(msg)));
        }
        async function Connecting() {
            //console.log(`Connecting. TicketId: ${ticketId}`);
            // Send a "Connecting" status update to the client
            ws.send(JSON.stringify({
                payload: {
                    state: "Connecting",
                },
                name: "StatusUpdate",
            }));
        }
        async function Waiting(players, playlist, regionarg, customkeyarg) {
            //console.log(`Waiting.`);
            // Send a "Waiting" status update to the client with the total number of players
            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist
                && value.region === regionarg
                && value.customkey === customkeyarg);
            ws.send(JSON.stringify({
                payload: {
                    totalPlayers: players,
                    connectedPlayers: players,
                    state: "Waiting",
                },
                name: "StatusUpdate",
            }));
        }
        async function Queued(players, playlistarg, regionarg, customkeyarg) {
            //console.log(`Queued. Players: ${players}. Typeof players: ${typeof players}`);
            if (typeof players !== "number") {
                players = 0;
            }
            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlistarg
                && value.region === regionarg
                && value.customkey === customkeyarg
                && value.preventmessage === false)
                .sort((a, b) => a.joinTime - b.joinTime);
            for (const client of sortedClients) {
                client.socket.send(JSON.stringify({
                    payload: {
                        ticketId: client.ticketId,
                        queuedPlayers: sortedClients.length,
                        estimatedWaitSec: sortedClients.length * 2,
                        status: sortedClients.length == 0 ? 2 : 3,
                        state: "Queued",
                    },
                    name: "StatusUpdate",
                }));
            }
        }
        async function SessionAssignment(playlist, regionarg, customkeyarg) {
            const maxPlayers = 100;
            // Sort clients by join time
            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist
                && value.region === regionarg
                && value.customkey === customkeyarg)
                .sort((a, b) => a.joinTime - b.joinTime)
                .slice(0, maxPlayers);
            for (const [index, client] of sortedClients.entries()) {
                console.log(`Sending join to ${client.accountId} because their position is ${index}`);
                client.socket.send(JSON.stringify({
                    payload: {
                        matchId: client.matchId,
                        state: "SessionAssignment",
                    },
                    name: "StatusUpdate",
                }));
            }
        }
        async function Join(playlist, regionarg, customkeyarg, serveridarg) {
            const maxPlayers = 100;
            // Sort clients by join time
            const sortedClients = Array.from(clients.values())
                .filter(value => value.playlist === playlist
                && value.region === regionarg
                && value.customkey === customkeyarg)
                .sort((a, b) => a.joinTime - b.joinTime)
                .slice(0, maxPlayers);
            for (const [index, client] of sortedClients.entries()) {
                console.log(client);
                console.log(`Assigning session to ${client.accountId} because their position is ${index}`);
                client.socket.send(JSON.stringify({
                    payload: {
                        matchId: client.matchId,
                        sessionId: client.sessionId,
                        joinDelaySec: 1,
                    },
                    name: "Play",
                }));
                sortedClients.splice(index, 1);
                let server = serverArray.find(server => server.serverId === serveridarg);
                if (server) {
                    server.players = server.players + 1;
                }
            }
        }
    }
}
//Curly brace  hell :(
export default new Matchmaker();
//# sourceMappingURL=matchmaker.js.map