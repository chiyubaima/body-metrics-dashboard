CREATE TABLE `medal_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`medal_id` text NOT NULL,
	`version` integer NOT NULL,
	`stage` integer NOT NULL,
	`threshold` integer NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `medal_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`metric` text NOT NULL,
	`source_id` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_medal_fact_source` ON `medal_facts` (`owner`,`metric`,`source_id`);