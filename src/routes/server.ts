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

export interface Server {
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

    app.post("/api/v1/server/status/:serverId/:status", async (c: Context) => {

        let customkey = c.req.query("customkey")
        if (!customkey) customkey = "none"

        const serverId = c.req.param("serverId")
        const status = c.req.param("status")

        if (status !== "online" && status !== "offline" && status !== "gamestarted") return c.json({
            error: "Status missing"
        }, 400)

        const server = serverArray.find(server => server.serverId === serverId)
        if (!server) return c.json({
            error: "Server not found"
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
            message: `Set server ${serverId} status to ${statusEnum}`
        }, 200)

    });

    app.post("/api/v1/server/playlist/:serverId/:playlist", async (c: Context) => {

        const serverId = c.req.param("serverId")
        const playlist = c.req.param("playlist")

        let server = serverArray.find(server => server.serverId === serverId)

        if (!server) return c.json({
            error: "Server not found"
        }, 404)

        server.playlist = playlist

        serverArray[serverArray.findIndex(server => server.serverId === serverId)] = server

        return c.json({
            message: "success",
        }, 200)

    });

    app.put("/api/v1/server/create", async (c: Context) => {

        const body = await c.req.json()

        const parameters = [
            "serverId",
            "region",
            "playlist",
            "status",
            "maxPlayers",
            "players",
        ]

        for (const parameter of parameters) {
            if (!body[parameter]) return c.json({
                error: `${parameter} missing`
            }, 400)
        }

        const serverId = body.serverId
        const region = body.region
        const playlist = body.playlist
        const status = body.status
        const maxPlayers = body.maxPlayers
        const customkey = body.customkey || "none"

        if (status !== "online" && status !== "offline" && status !== "gamestarted") return c.json({
            error: "Wrong format for status, must be online, offline or gamestarted"
        }, 400)

        const statusString = status as string;
        const statusEnum = ServerStatus[statusString.toUpperCase()];
        const regionString = region as string;
        const regionEnum = ServerRegion[regionString.toUpperCase()];

        const server: Server = {
            serverId: serverId,
            region: regionEnum,
            playlist: playlist,
            status: statusEnum,
            maxPlayers: maxPlayers,
            players: 0,
            customkey: customkey
        }

        serverArray.push(server)

        return c.json({
            message: "Successfully added server to server array",
        }, 200)

    });

    app.delete("/api/v1/server/delete/:serverId", async (c: Context) => {

        const serverId = c.req.param("serverId")

        const server = serverArray.find(server => server.serverId === serverId)
        if (!server) return c.json({
            error: "Server not found"
        }, 404)

        serverArray.splice(serverArray.findIndex(server => server.serverId === serverId), 1)

        return c.json({
            message: `Successfully deleted server ${serverId}`,
        }, 200)

    });

}

export default serverRoutes