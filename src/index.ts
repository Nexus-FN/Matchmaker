import fastify, { FastifyInstance } from 'fastify'
import WebSocket, { WebSocketServer } from 'ws';
import Matchmaker from './matchmaker.js';
import { serve } from '@hono/node-server'
import { Context, Hono } from 'hono'
import serverRoutes from './routes/server.js';
import verifyApiKey from './utilities/verifyapi.js';
import apiKeysRoutes from './routes/keys.js';
import db from './database/connection.js';
import { users } from './database/schema.js';

const allUsers = await db.select().from(users);

const MMPORT = 8080
const PORT = 3000

export const app = new Hono({
    strict: false,
})

app.use('/api/v1/*', async (c: Context, next) => {

    const apiKey = c.req.header("x-api-key")
    if (!apiKey) return c.json({
        error: "Api key missing"
    }, 400)
    if (!verifyApiKey(apiKey)) return c.json({
        error: "Invalid api key"
    }, 401)

    await next()

});

serverRoutes(app)
apiKeysRoutes(app)

const wss = new WebSocketServer({
    port: MMPORT,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed if context takeover is disabled.
    }
});

let clients = new Map<string, WebSocket>()

process.on('SIGINT', function () {
    console.log("Caught interrupt signal");

    for (let [id, ws] of clients) {
        ws.close(1008, 'Matchmaker shutting down')
    }
    process.exit();
})

//on websocket connection, return matchmaker
wss.on('connection', (ws: WebSocket, req) => {

    console.log(req)

    let id = Math.random().toString(36).substring(7)
    clients.set(id, ws)

    return Matchmaker.server(ws, req)

})

wss.on('listening', () => {
    console.log(`Matchmaker listening on port ${MMPORT}`)
});

console.log(`Server listening on port ${PORT}`)
serve({
    fetch: app.fetch,
    port: PORT,
})