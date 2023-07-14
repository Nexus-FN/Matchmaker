import { channel } from "../utilities/rabbitmq.js";
import verifyApiKey from "../utilities/verifyapi.js";
import { Context, Hono, Next } from "hono";

export enum ServerStatus {
    ONLINE = "online",
    OFFLINE = "offline",
    GAMESTARTED = "gamestarted"
}

export enum ServerRegion {
    NAE = "NAE",
    EU = "EU",
    OCE = "OCE",
}

interface Server {
    serverId: string
    region: string
    playlist: string
    status: ServerStatus
    maxPlayers: number
    players: number
    customkey?: string
}

export const serverArray: Server[] = [
    {
        serverId: "1",
        region: "NAE",
        playlist: "playlist_defaultsolo",
        status: ServerStatus.OFFLINE,
        maxPlayers: 100,
        players: 0,
        customkey: "none"
    },
    {
        serverId: "2",
        region: "EU",
        playlist: "playlist_defaultsolo",
        status: ServerStatus.OFFLINE,
        maxPlayers: 100,
        players: 0,
        customkey: "none"
    },
]

function serverRoutes(app: Hono) {

    app.use('/api/v1/server/*', async (c: Context, next) => {

        const apiKey = c.req.header("x-api-key")
        if (!apiKey) return c.json({
            error: "api key missing"
        }, 400)
        if (!verifyApiKey(apiKey)) return c.json({
            error: "invalid api key"
        }, 401)

        await next()

    });

    app.post("/api/v1/server/status/:serverId/:status", async (c: Context) => {

        let customkey = c.req.query("customkey")
        if (!customkey) customkey = "none"

        const serverId = c.req.param("serverId")
        const status = c.req.param("status")

        if (status !== "online" && status !== "offline" && status !== "gamestarted") return c.json({
            error: "status missing"
        }, 400)

        const server = serverArray.find(server => server.serverId === serverId)
        if (!server) return c.json({
            error: "server not found"
        }, 404)

        const statusString = status as string;
        const statusEnum = ServerStatus[statusString.toUpperCase()];

        server.status = statusEnum
        server.players = 0

        serverArray[serverArray.findIndex(server => server.serverId === serverId)] = server

        const msg = {
            action: "STATUS",
            data: {
                playlist: server.playlist,
                region: server.region,
                status: status,
                customkey: customkey,
                serverid: serverId
            }
        }

        console.log(msg)

        channel.sendToQueue("matchmaker", Buffer.from(JSON.stringify(msg)))

        return c.json({
            message: `set server ${serverId} status to ${statusEnum}`
        }, 200)

    });

    app.post("/api/v1/server/playlist/:serverId/:playlist", async (c: Context) => {

        const serverId = c.req.param("serverId")
        const playlist = c.req.param("playlist")

        let server = serverArray.find(server => server.serverId === serverId)

        if (!server) return c.json({
            error: "server not found"
        }, 404)

        server.playlist = playlist

        serverArray[serverArray.findIndex(server => server.serverId === serverId)] = server

        return c.json({
            message: "success",
        }, 200)

    });

}

export default serverRoutes