CREATE TABLE "assessment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"question_id" text NOT NULL,
	"section" text NOT NULL,
	"section_title" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"submitted_value" jsonb,
	"submitted_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stage" varchar(8) NOT NULL,
	"question_bank_version" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"student_label" text NOT NULL,
	"sections" jsonb NOT NULL,
	"pdf_filename" text NOT NULL,
	"pdf_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_answers_assessment_idx" ON "assessment_answers" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessments_user_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_user_stage_started_uniq" ON "assessments" USING btree ("user_id","stage","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_assessment_uniq" ON "reports" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "reports_user_idx" ON "reports" USING btree ("user_id");