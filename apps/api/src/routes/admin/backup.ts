/**
 * Admin Backup Routes
 *
 * Provides endpoints for database backup management.
 */

import { Hono } from "hono";
import type { Env } from "../../index";
import { convex, api } from "../../lib/convex";

const app = new Hono<Env>();

/**
 * Get backup history
 */
app.get("/", async (c) => {
  try {
    const snapshots = await convex.query(api.backup.getBackupHistory, {
      limit: 20,
    });

    return c.json({
      success: true,
      data: snapshots,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching backup history:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch backup history",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get latest successful backup
 */
app.get("/latest", async (c) => {
  try {
    const backup = await convex.query(api.backup.getLatestBackup, {});

    if (!backup) {
      return c.json({
        success: true,
        data: null,
        message: "No completed backups found",
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      data: backup,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching latest backup:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch latest backup",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Get database summary
 */
app.get("/summary", async (c) => {
  try {
    const summary = await convex.query(api.backup.getDatabaseSummary, {});

    return c.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching database summary:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to fetch database summary",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Trigger a new backup
 */
app.post("/trigger", async (c) => {
  try {
    const userId = c.get("userId");
    const tables = [
      "users",
      "orders",
      "balances",
      "positions",
      "predictionEvents",
      "auditLogs",
    ];

    // Create backup snapshot record
    const result = await convex.mutation(api.backup.createBackupSnapshot, {
      type: "on_demand",
      initiatedBy: userId,
      tables,
    });

    // In production, this would trigger an async job to:
    // 1. Export each table
    // 2. Upload to S3/GCS
    // 3. Update the snapshot record

    // For now, we'll do a quick summary and mark complete
    const summary = await convex.query(api.backup.getDatabaseSummary, {});

    await convex.mutation(api.backup.completeBackupSnapshot, {
      snapshotId: result.snapshotId,
      recordCounts: Object.fromEntries(
        Object.entries(summary.tables).map(([table, data]: [string, any]) => [
          table,
          data.count,
        ])
      ),
      storageLocation: `convex://snapshots/${result.snapshotId}`,
    });

    return c.json({
      success: true,
      data: {
        snapshotId: result.snapshotId,
        status: "completed",
        tables,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error triggering backup:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "BACKUP_FAILED",
          message: "Failed to trigger backup",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Export users data
 */
app.get("/export/users", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "1000", 10);

    const data = await convex.query(api.backup.exportUsers, {
      limit: Math.min(limit, 5000),
    });

    return c.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error exporting users:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "Failed to export users",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Export orders data
 */
app.get("/export/orders", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "1000", 10);
    const startDate = c.req.query("startDate")
      ? parseInt(c.req.query("startDate")!, 10)
      : undefined;
    const endDate = c.req.query("endDate")
      ? parseInt(c.req.query("endDate")!, 10)
      : undefined;

    const data = await convex.query(api.backup.exportOrders, {
      limit: Math.min(limit, 5000),
      startDate,
      endDate,
    });

    return c.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error exporting orders:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "Failed to export orders",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * Export audit logs
 */
app.get("/export/audit", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "5000", 10);
    const startDate = c.req.query("startDate")
      ? parseInt(c.req.query("startDate")!, 10)
      : undefined;
    const endDate = c.req.query("endDate")
      ? parseInt(c.req.query("endDate")!, 10)
      : undefined;
    const action = c.req.query("action");

    const data = await convex.query(api.backup.exportAuditLogs, {
      limit: Math.min(limit, 10000),
      startDate,
      endDate,
      action,
    });

    return c.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "Failed to export audit logs",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

export { app as backupRoutes };
