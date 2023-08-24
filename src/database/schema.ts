import { InferModel } from "drizzle-orm";
import { mysqlTable, serial, varchar, int, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const servers = mysqlTable(
	"servers",
	{
		id: serial("id").primaryKey().unique(),
		region: varchar("region", { length: 256 }),
		playlist: varchar("playlist", { length: 256 }),
		status: varchar("status", { length: 256 }),
		maxplayers: int("maxplayers"),
		players: int("players"),
		season: int("seasonint"),
		customkey: varchar("customkey", { length: 256 }),
		ip: varchar("ip", { length: 256 }),
		port: int("port"),
	},
	(table) => {
		return {
			playlistIdx: index("playlist_idx").on(table.playlist),
			regionIdx: index("region_idx").on(table.region),
			customkeyIdx: index("customkey_idx").on(table.customkey),
			ipIdx: index("ip_idx").on(table.ip),
			portIdx: index("port_idx").on(table.port),
		};
	},
);

export type Server = InferModel<typeof servers, "select">;
export type NewServer = InferModel<typeof servers, "insert">;

export const apikeys = mysqlTable(
	"apikeys",
	{
		id: serial("id").primaryKey(),
		apikey: varchar("apikey", { length: 256 }),
	},
	(table) => {
		return {
			apikeyIdx: uniqueIndex("apikey_idx").on(table.apikey),
		};
	},
);
