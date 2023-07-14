import { connect } from "amqplib";
const connection = await connect('amqp://zetax:zetaxiscool@141.144.236.205/');
export const channel = await connection.createChannel();
await channel.assertQueue('matchmaker');
await channel.purgeQueue('matchmaker');
//# sourceMappingURL=rabbitmq.js.map