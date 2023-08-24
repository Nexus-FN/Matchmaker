CREATE TABLE `apikeys` (
	`id` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`apikey` varchar(256)
);
--> statement-breakpoint
CREATE TABLE `servers` (
	`id` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`region` varchar(256),
	`playlist` varchar(256),
	`status` varchar(256),
	`maxplayers` int,
	`players` int,
	`seasonint` int,
	`customkey` varchar(256),
	`ip` varchar(256),
	`port` int,
	CONSTRAINT `servers_id_unique` UNIQUE(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apikey_idx` ON `apikeys` (`apikey`);--> statement-breakpoint
CREATE INDEX `playlist_idx` ON `servers` (`playlist`);--> statement-breakpoint
CREATE INDEX `region_idx` ON `servers` (`region`);--> statement-breakpoint
CREATE INDEX `customkey_idx` ON `servers` (`customkey`);--> statement-breakpoint
CREATE INDEX `ip_idx` ON `servers` (`ip`);--> statement-breakpoint
CREATE INDEX `port_idx` ON `servers` (`port`);