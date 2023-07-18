import { InferModel } from "drizzle-orm";
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

export type User = InferModel<typeof users, "select">;
export type NewUser = InferModel<typeof users, "insert">;

export const loopkeys = pgTable('loopkeys', {
    id: serial('id').primaryKey(),
    loopkey: varchar('loopkey', { length: 256 }),
    discordid: varchar('discordid', { length: 256 }),
    ips: text('ips'),
    modules: text('modules'),
});

export type Loopkey = InferModel<typeof loopkeys, "select">;
export type NewLoopkey = InferModel<typeof loopkeys, "insert">;

export const servers = pgTable('servers', {
    id: serial('id').primaryKey(),
    region: varchar('region', { length: 256 }),
    playlist: varchar('playlist', { length: 256 }),
    status: varchar('status', { length: 256 }),
    maxplayers: integer('maxplayers'),
    players: integer('players'),
    customkey: varchar('customkey', { length: 256 }),
    ip: varchar('ip', { length: 256 }),
    port: integer('port'),
});

export type Server = InferModel<typeof servers, "select">;
export type NewServer = InferModel<typeof servers, "insert">;
