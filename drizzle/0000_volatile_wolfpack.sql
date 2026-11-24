CREATE TABLE `habit_journal` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`uid` text NOT NULL,
	`habit` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_request` ON `habit_journal` (`owner`,`uid`);--> statement-breakpoint
CREATE INDEX `journal_history` ON `habit_journal` (`owner`,`seq`);--> statement-breakpoint
CREATE INDEX `journal_habit` ON `habit_journal` (`owner`,`habit`,`seq`);