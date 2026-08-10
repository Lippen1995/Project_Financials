-- FI-SIM F8: an activation audit that cannot be bypassed.
--
-- The pointer swap is the moment the product starts showing simulated figures to a room full of
-- investors. An audit log that the activation code is asked to remember to write is an audit log
-- that will one day be missing the row that matters, so the database writes it: the trigger below
-- fires on every pointer change and refuses the change outright when nobody has said who is doing
-- it and why.

CREATE TYPE "FinancialDatasetActivationAction" AS ENUM ('ACTIVATE', 'ROLLBACK', 'DEACTIVATE');

-- No foreign key to "SimulatedFinancialDataset" on purpose. An audit row records what happened;
-- it must not become unwritable, or later untrue, because of the state of another table.
CREATE TABLE "FinancialDatasetActivationAudit" (
  "id" BIGSERIAL NOT NULL,
  "action" "FinancialDatasetActivationAction" NOT NULL,
  "fromMode" "FinancialDatasetMode",
  "fromSimulatedDatasetId" TEXT,
  "fromActivationRevision" BIGINT,
  "toMode" "FinancialDatasetMode" NOT NULL,
  "toSimulatedDatasetId" TEXT,
  "toActivationRevision" BIGINT NOT NULL,
  "mappingRevision" BIGINT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "deploymentEnvironment" TEXT NOT NULL,
  "databaseUser" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialDatasetActivationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialDatasetActivationAudit_actor_check"
    CHECK (length(btrim("actorUserId")) > 0),
  CONSTRAINT "FinancialDatasetActivationAudit_reason_check"
    CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "FinancialDatasetActivationAudit_target_check"
    CHECK (("toMode" = 'SIMULATED') = ("toSimulatedDatasetId" IS NOT NULL))
);

CREATE INDEX "FinancialDatasetActivationAudit_createdAt_idx"
  ON "FinancialDatasetActivationAudit"("createdAt" DESC);
CREATE INDEX "FinancialDatasetActivationAudit_target_idx"
  ON "FinancialDatasetActivationAudit"("toSimulatedDatasetId", "id" DESC);

CREATE OR REPLACE FUNCTION "guard_financial_dataset_activation_audit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'The financial dataset activation audit is append-only';
END;
$$;

CREATE TRIGGER "guard_financial_dataset_activation_audit"
BEFORE UPDATE OR DELETE ON "FinancialDatasetActivationAudit"
FOR EACH ROW EXECUTE FUNCTION "guard_financial_dataset_activation_audit"();

CREATE OR REPLACE FUNCTION "record_financial_dataset_activation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor TEXT := NULLIF(btrim(COALESCE(current_setting('app.activation_actor', true), '')), '');
  activation_reason TEXT := NULLIF(btrim(COALESCE(current_setting('app.activation_reason', true), '')), '');
  declared_action TEXT := NULLIF(btrim(COALESCE(current_setting('app.activation_action', true), '')), '');
  environment TEXT := COALESCE(current_setting('app.deployment_environment', true), 'unclassified');
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Financial dataset activation requires a named actor';
  END IF;
  IF activation_reason IS NULL THEN
    RAISE EXCEPTION 'Financial dataset activation requires a recorded reason';
  END IF;
  IF declared_action IS NULL
    OR declared_action NOT IN ('ACTIVATE', 'ROLLBACK', 'DEACTIVATE') THEN
    RAISE EXCEPTION 'Financial dataset activation requires a declared action';
  END IF;
  -- A pointer that ends in REPORTED is a deactivation whatever the caller called it, and one that
  -- ends in SIMULATED cannot be. The log records what the database did, not what it was told.
  IF (NEW."mode" = 'REPORTED') <> (declared_action = 'DEACTIVATE') THEN
    RAISE EXCEPTION 'Declared activation action does not match the resulting dataset mode';
  END IF;

  INSERT INTO "FinancialDatasetActivationAudit" (
    "action",
    "fromMode",
    "fromSimulatedDatasetId",
    "fromActivationRevision",
    "toMode",
    "toSimulatedDatasetId",
    "toActivationRevision",
    "mappingRevision",
    "actorUserId",
    "reason",
    "deploymentEnvironment",
    "databaseUser"
  )
  VALUES (
    declared_action::"FinancialDatasetActivationAction",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."mode" ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."simulatedDatasetId" ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."activationRevision" ELSE NULL END,
    NEW."mode",
    CASE WHEN NEW."mode" = 'SIMULATED' THEN NEW."simulatedDatasetId" ELSE NULL END,
    NEW."activationRevision",
    NEW."mappingRevision",
    actor,
    activation_reason,
    environment,
    session_user
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER "record_financial_dataset_activation"
AFTER INSERT OR UPDATE ON "ActiveFinancialDataset"
FOR EACH ROW EXECUTE FUNCTION "record_financial_dataset_activation"();

COMMENT ON TABLE "FinancialDatasetActivationAudit" IS
  'Append-only record of every financial dataset pointer change, written by trigger so activation cannot happen unaudited.';

REVOKE ALL PRIVILEGES ON TABLE "FinancialDatasetActivationAudit" FROM fjord_financial_runtime;
GRANT INSERT, SELECT ON TABLE "FinancialDatasetActivationAudit"
  TO fjord_financial_simulation_admin;
GRANT USAGE, SELECT ON SEQUENCE "FinancialDatasetActivationAudit_id_seq"
  TO fjord_financial_simulation_admin;
