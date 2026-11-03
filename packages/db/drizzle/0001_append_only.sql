CREATE FUNCTION "refuse_append_only_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "claim_attempts_append_only" BEFORE UPDATE OR DELETE ON "claim_attempts" FOR EACH ROW EXECUTE FUNCTION "refuse_append_only_change"();
--> statement-breakpoint
CREATE TRIGGER "verification_checks_append_only" BEFORE UPDATE OR DELETE ON "verification_checks" FOR EACH ROW EXECUTE FUNCTION "refuse_append_only_change"();
