from __future__ import annotations

from sqlalchemy import inspect, text


def migrate_merge_jobs_into_runs(connection) -> None:
    """One-time migration: copy job config onto runs and drop the jobs table."""
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    if "jobs" not in tables:
        return

    run_columns = {col["name"] for col in inspector.get_columns("runs")}
    additions = [
        ("name", "VARCHAR(255)"),
        ("repo_url", "VARCHAR(2048)"),
        ("persona_environments", "JSONB"),
        ("journey_id", "UUID"),
        ("model", "VARCHAR(255)"),
        ("config", "JSONB"),
        ("updated_at", "TIMESTAMP WITH TIME ZONE DEFAULT NOW()"),
    ]
    for column_name, column_type in additions:
        if column_name not in run_columns:
            connection.execute(
                text(f"ALTER TABLE runs ADD COLUMN {column_name} {column_type}")
            )

    connection.execute(
        text(
            """
            UPDATE runs AS r
            SET
                name = j.name,
                repo_url = j.repo_url,
                persona_environments = j.persona_environments,
                journey_id = j.journey_id,
                model = j.model,
                config = j.config,
                updated_at = COALESCE(r.updated_at, j.updated_at, j.created_at, NOW())
            FROM jobs AS j
            WHERE r.job_id = j.id
            """
        )
    )

    if "job_id" in run_columns:
        for fk in inspector.get_foreign_keys("runs"):
            if "job_id" in fk.get("constrained_columns", []):
                connection.execute(
                    text(
                        f'ALTER TABLE runs DROP CONSTRAINT "{fk["name"]}"'
                    )
                )
        connection.execute(text("ALTER TABLE runs DROP COLUMN job_id"))

    connection.execute(text("DROP TABLE jobs"))


def migrate_severity_levels(connection) -> None:
    """Migrate five-level severity enum to critical / needs_attention / nits."""
    inspector = inspect(connection)
    if "findings" not in inspector.get_table_names():
        return

    has_legacy = connection.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'severity' AND e.enumlabel = 'high'
            )
            """
        )
    ).scalar()
    if not has_legacy:
        return

    connection.execute(
        text("CREATE TYPE severity_new AS ENUM ('critical', 'needs_attention', 'nits')")
    )
    for table in ("findings", "global_findings"):
        connection.execute(
            text(
                f"""
                ALTER TABLE {table}
                ALTER COLUMN severity TYPE severity_new
                USING (
                    CASE severity::text
                        WHEN 'critical' THEN 'critical'::severity_new
                        WHEN 'high' THEN 'needs_attention'::severity_new
                        WHEN 'medium' THEN 'needs_attention'::severity_new
                        WHEN 'low' THEN 'nits'::severity_new
                        WHEN 'info' THEN 'nits'::severity_new
                        ELSE 'nits'::severity_new
                    END
                )
                """
            )
        )
    connection.execute(text("DROP TYPE severity"))
    connection.execute(text("ALTER TYPE severity_new RENAME TO severity"))

def migrate_drop_finding_verified(connection) -> None:
    """Drop the findings.verified column (evidence verification removed)."""
    inspector = inspect(connection)
    if "findings" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("findings")}
    if "verified" not in columns:
        return

    connection.execute(text("ALTER TABLE findings DROP COLUMN verified"))
