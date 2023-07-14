import { pgTable, serial, text, varchar, integer } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 256 }),
    discordid: varchar('discordid', { length: 256 }),
    shopkeys: text('shopkeys'),
    loopkeys: text('loopkeys'),
    maxloopkeys: integer('maxloopkeys'),
    matchmakerkeys: text('matchmakerkeys'),
    password: varchar('password', { length: 256 }),
});

export const loopkeys = pgTable('loopkeys', {
    id: serial('id').primaryKey(),
    loopkey: varchar('loopkey', { length: 256 }),
    discordid: varchar('discordid', { length: 256 }),
    ips: text('ips'),
    modules: text('modules'),
});