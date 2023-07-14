import { Channel, Connection, connect } from "amqplib"

const connection: Connection = await connect(
    'amqp://zetax:zetaxiscool@141.144.236.205/testing'
)

export const channel: Channel = await connection.createChannel()

await channel.assertQueue('matchmaker')
await channel.purgeQueue('matchmaker')