CREATE TABLE `medal_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_medal_generations_owner` ON `medal_generations` (`owner`);--> statement-breakpoint
CREATE TABLE `medal_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_medal_notifications_owner` ON `medal_notifications` (`owner`);--> statement-breakpoint
CREATE TABLE `medals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_medals_owner` ON `medals` (`owner`);