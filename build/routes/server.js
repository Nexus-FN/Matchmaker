import { channel } from "../utilities/rabbitmq.js";
import verifyApiKey from "../utilities/verifyapi.js";
export var ServerStatus;
(function (ServerStatus) {
    ServerStatus["ONLINE"] = "online";
    ServerStatus["OFFLINE"] = "offline";
    ServerStatus["GAMESTARTED"] = "gamestarted";
})(ServerStatus || (ServerStatus = {}));
export var ServerRegion;
(function (ServerRegion) {
    ServerRegion["NAE"] = "NAE";
    ServerRegion["EU"] = "EU";
    ServerRegion["OCE"] = "OCE";
})(ServerRegion || (ServerRegion = {}));
export const serverArray = [
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
];
function serverRoutes(app) {
    app.use('/api/v1/server/*', async (c, next) => {
        const apiKey = c.req.header("x-api-key");
        if (!apiKey)
            return c.json({
                error: "api key missing"
            }, 400);
        if (!verifyApiKey(apiKey))
            return c.json({
                error: "invalid api key"
            }, 401);
        await next();
    });
    app.post("/api/v1/server/status/:serverId/:status", async (c) => {
        let customkey = c.req.query("customkey");
        if (!customkey)
            customkey = "none";
        const serverId = c.req.param("serverId");
        const status = c.req.param("status");
        if (status !== "online" && status !== "offline" && status !== "gamestarted")
            return c.json({
                error: "status missing"
            }, 400);
        const server = serverArray.find(server => server.serverId === serverId);
        if (!server)
            return c.json({
                error: "server not found"
            }, 404);
        const statusString = status;
        const statusEnum = ServerStatus[statusString.toUpperCase()];
        server.status = statusEnum;
        server.players = 0;
        serverArray[serverArray.findIndex(server => server.serverId === serverId)] = server;
        const msg = {
            action: "STATUS",
            data: {
                playlist: server.playlist,
                region: server.region,
                status: status,
                customkey: customkey,
                serverid: serverId
            }
        };
        console.log(msg);
        channel.sendToQueue("matchmaker", Buffer.from(JSON.stringify(msg)));
        return c.json({
            message: `set server ${serverId} status to ${statusEnum}`
        }, 200);
    });
    app.post("/api/v1/server/playlist/:serverId/:playlist", async (c) => {
        const serverId = c.req.param("serverId");
        const playlist = c.req.param("playlist");
        let server = serverArray.find(server => server.serverId === serverId);
        if (!server)
            return c.json({
                error: "server not found"
            }, 404);
        server.playlist = playlist;
        serverArray[serverArray.findIndex(server => server.serverId === serverId)] = server;
        return c.json({
            message: "success",
        }, 200);
    });
}
export default serverRoutes;
//# sourceMappingURL=server.js.map