import { WebSocketServer } from 'ws';
import Matchmaker from './matchmaker.js';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import serverRoutes from './routes/server.js';
const MMPORT = 8080;
const PORT = 3000;
export const app = new Hono({
    strict: false,
});
serverRoutes(app);
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
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        // Below options specified as default values.
        concurrencyLimit: 10,
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed if context takeover is disabled.
    }
});
let clients = new Map();
process.on('SIGINT', function () {
    console.log("Caught interrupt signal");
    for (let [id, ws] of clients) {
        ws.close(1008, 'Matchmaker shutting down');
    }
    process.exit();
});
//on websocket connection, return matchmaker
wss.on('connection', (ws, req) => {
    console.log(req);
    let id = Math.random().toString(36).substring(7);
    clients.set(id, ws);
    return Matchmaker.server(ws, req);
});
wss.on('listening', () => {
    console.log(`Matchmaker listening on port ${MMPORT}`);
});
console.log(`Server listening on port ${PORT}`);
serve({
    fetch: app.fetch,
    port: PORT,
});
//# sourceMappingURL=index.js.map