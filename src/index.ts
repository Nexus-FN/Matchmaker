import { serve } from '@hono/node-server'
import dotenv from 'dotenv';
import { Hono } from 'hono'
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
dotenv.config()

global.bindMomentum = false;

const envSchema = z.object({
    DB_URI: z.string(),
    RABBITMQ_URI: z.string(),
    MOMENTUM_INSTANCE_URL: z.string().url()
})
const envparse = envSchema.safeParse(process.env)
if (!envparse.success) throw new Error(envparse.error.message)

//import db from './database/connection.js';
import Matchmaker from './matchmaker.js';
import apiKeysRoutes from './routes/keys.js';
import serverRoutes from './routes/server.js';
import verifyApiKey from './utilities/verifyapi.js';

//Do you want to migrate the database? Uncomment this line, be careful though.
//await migrate(db, { migrationsFolder: 'drizzle' });

const MMPORT = process.env.MM_PORT;
const PORT = process.env.HTTP_PORT;

export const app = new Hono({
    strict: false,
})

//Middleware for auth

app.use('/api/v1/*', async (c, next) => {

    const apiKey = c.req.header("x-api-key")
    if (!apiKey) return c.json({
        error: "Api key missing"
    }, 400)
    if (await verifyApiKey(apiKey) == false) return c.json({
        error: "Invalid api key"
    }, 401)

    await next()

});

serverRoutes(app)
apiKeysRoutes(app)

//Websocket Server

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

const clients = new Map<string, WebSocket>()

process.on('SIGINT', function () {
    for (const [id, ws] of clients) {
        if (!id) continue;
        ws.close(1008, 'Matchmaker shutting down')
    }
    process.exit();
})

wss.on('connection', (ws: WebSocket, req) => {
    const id = Math.random().toString(36).substring(7)
    clients.set(id, ws)
    return Matchmaker.server(ws, req)
})

wss.on('listening', () => {
    console.log(`Matchmaker listening on port ${MMPORT}`)
});

//HTTP Server

console.log(`Server listening on port ${PORT}`)
serve({
    fetch: app.fetch,
    port: PORT,
})