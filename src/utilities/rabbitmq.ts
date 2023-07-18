import { Channel, Connection, connect } from "amqplib"

import dotenv from 'dotenv';
dotenv.config()

if(!process.env.RABBITMQ_URI) throw new Error("RABBITMQ_URI not set in enviroment")

const connection: Connection = await connect(
    process.env.RABBITMQ_URI
)

export const channel: Channel = await connection.createChannel()

await channel.purgeQueue('matchmaker')