CREATE TABLE "plants" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"capacity_mw" real DEFAULT 10 NOT NULL,
	"timezone_offset_hours" real DEFAULT 5.5 NOT NULL,
	"tracker_type" text DEFAULT 'fixed_tilt' NOT NULL,
	"commissioned_year" integer DEFAULT 2024 NOT NULL,
	"inverter_count" integer DEFAULT 4 NOT NULL,
	"inverter_rating_kw" integer DEFAULT 1500 NOT NULL,
	"strings_per_inverter" integer DEFAULT 12 NOT NULL,
	"weather_station_count" integer DEFAULT 1 NOT NULL,
	"cloudiness_seed" real DEFAULT 0.2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plants_org_id_idx" ON "plants" USING btree ("org_id");