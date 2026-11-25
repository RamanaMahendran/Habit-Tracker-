CREATE TABLE `reminder_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`endpoint` text NOT NULL,
	`enabledAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminder_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminder_receipt_age` ON `reminder_receipts` (`created`);