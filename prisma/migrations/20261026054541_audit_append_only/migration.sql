-- Database-level enforcement of the append-only audit log.
-- (PostgreSQL deployments should use an equivalent trigger or REVOKE UPDATE/DELETE.)
CREATE TRIGGER audit_event_no_update
BEFORE UPDATE ON "AuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent is append-only');
END;

CREATE TRIGGER audit_event_no_delete
BEFORE DELETE ON "AuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent is append-only');
END;
