CREATE TABLE IF NOT EXISTS "loopkeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"loopkey" varchar(256),
	"discordid" varchar(256),
	"ips" text,
	"modules" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"region" varchar(256),
	"playlist" varchar(256),
	"status" varchar(256),
	"maxplayers" integer,
	"players" integer,
	"customkey" varchar(256)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(256),
	"discordid" varchar(256),
	"shopkeys" text,
	"loopkeys" text,
	"maxloopkeys" integer,
	"matchmakerkeys" text,
	"password" varchar(256)
);
