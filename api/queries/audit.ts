import { auditLogs } from "@db/schema";
import { getDb } from "./connection";

/** One audit_logs row per mutation (SPEC §7). Never throws into the caller. */
export async function audit(
  actorUserId: number | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  detail?: unknown,
): Promise<void> {
  try {
    await getDb().insert(auditLogs).values({
      actorUserId,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      detail: (detail ?? null) as Record<string, unknown> | null,
    });
  } catch (error) {
    console.error("[audit] failed to write audit log:", action, error);
  }
}
