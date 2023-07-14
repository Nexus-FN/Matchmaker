import { Hono } from "hono";
import verifyApiKey from "../utilities/verifyapi.js";
import { v4 as uuidv4 } from 'uuid';

function apiKeysRoutes(app: Hono) {

    app.delete('/api/v1/apikeys/delete/:apikey', async (c, next) => {

        const apiKey = c.req.param("apikey")

        if (!apiKey) return c.json({
            error: "Api key missing"
        }, 400)
        if (!verifyApiKey(apiKey)) return c.json({
            error: "Invalid api key"
        }, 401)

        //apiKeys.splice(apiKeys.indexOf(apiKey), 1)

        c.json({
            success: true
        }, 200)

    });

}

export default apiKeysRoutes