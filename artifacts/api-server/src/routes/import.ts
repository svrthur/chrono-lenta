import { Router, type IRouter } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import {
  db,
  campaignsTable,
  shoppingCentersTable,
  campaignPlacementsTable,
  importHistoryTable,
} from "@workspace/db";
import { RestoreImportParams } from "@workspace/api-zod";
import { broadcastDataUpdated } from "../lib/sse";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter(_req, file, cb) {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx and .xls files are allowed"));
    }
  },
});

interface ImportCampaignRow {
  name: string;
  startDate: string;
  endDate: string;
  client: string;
  status: string;
  duration: number;
  shoppingCenterNumbers: string[];
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

function parseExcelDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const y = String(date.y).padStart(4, "0");
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    // Try parse various formats
    const cleaned = value.trim();
    // DD.MM.YYYY
    const ddmm = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (ddmm) {
      return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`;
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeStatus(raw: unknown): string {
  if (!raw) return "Не платник";
  const s = String(raw).trim().toLowerCase();
  if (s.includes("платник") && !s.includes("не")) return "Платник";
  return "Не платник";
}

function parseDuration(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!isNaN(n) && n >= 0) return Math.round(n);
  return null;
}

router.post("/import", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      importedCampaigns: 0,
      importedPlacements: 0,
      errors: [{ row: 0, field: "file", message: "No file uploaded" }],
      historyId: null,
    });
    return;
  }

  const errors: ValidationError[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
  } catch (e) {
    res.status(400).json({
      success: false,
      importedCampaigns: 0,
      importedPlacements: 0,
      errors: [{ row: 0, field: "file", message: "Cannot parse Excel file" }],
      historyId: null,
    });
    return;
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = (XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown) as unknown[][];

  if (rows.length < 2) {
    res.status(400).json({
      success: false,
      importedCampaigns: 0,
      importedPlacements: 0,
      errors: [{ row: 0, field: "file", message: "File has no data rows" }],
      historyId: null,
    });
    return;
  }

  // Skip header row (row index 0)
  const dataRows = rows.slice(1);
  const campaignRows: ImportCampaignRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2; // 1-based, skipping header

    const name = row[0] != null ? String(row[0]).trim() : "";
    const startDateRaw = row[1];
    const endDateRaw = row[2];
    const client = row[3] != null ? String(row[3]).trim() : "";
    const statusRaw = row[4];
    const durationRaw = row[5];

    // Collect TC numbers from columns G onward (index 6+)
    const scNumbers: string[] = [];
    for (let col = 6; col < row.length; col++) {
      const val = row[col];
      if (val != null && String(val).trim() !== "") {
        scNumbers.push(String(val).trim());
      }
    }

    // Skip completely empty rows
    if (!name && !client && scNumbers.length === 0) continue;

    // Validate required fields
    if (!name) {
      errors.push({ row: rowNum, field: "A", message: "Название кампании не указано" });
      continue;
    }
    if (!client) {
      errors.push({ row: rowNum, field: "D", message: "Заказчик не указан" });
    }

    const startDate = parseExcelDate(startDateRaw);
    if (!startDate) {
      errors.push({ row: rowNum, field: "B", message: "Дата начала не распознана" });
    }

    const endDate = parseExcelDate(endDateRaw);
    if (!endDate) {
      errors.push({ row: rowNum, field: "C", message: "Дата окончания не распознана" });
    }

    const duration = parseDuration(durationRaw);
    if (duration === null) {
      errors.push({ row: rowNum, field: "F", message: "Длительность ролика не указана или некорректна" });
    }

    if (duration !== null && duration < 0) {
      errors.push({ row: rowNum, field: "F", message: "Отрицательный хронометраж" });
    }

    if (startDate && endDate && startDate > endDate) {
      errors.push({ row: rowNum, field: "B-C", message: "Дата начала позже даты окончания" });
    }

    if (scNumbers.length === 0) {
      errors.push({ row: rowNum, field: "G+", message: "Не указан ни один ТК" });
    }

    if (errors.some((e) => e.row === rowNum && ["A", "F", "B", "C"].includes(e.field))) {
      continue; // Skip rows with critical errors
    }

    campaignRows.push({
      name,
      startDate: startDate!,
      endDate: endDate!,
      client,
      status: normalizeStatus(statusRaw),
      duration: duration!,
      shoppingCenterNumbers: scNumbers,
    });
  }

  // Check for duplicate campaign names in import
  const nameCount = new Map<string, number>();
  for (const c of campaignRows) {
    nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCount) {
    if (count > 1) {
      errors.push({ row: 0, field: "A", message: `Дублирующееся название кампании: "${name}"` });
    }
  }

  if (errors.length > 0 && campaignRows.length === 0) {
    res.status(400).json({
      success: false,
      importedCampaigns: 0,
      importedPlacements: 0,
      errors,
      historyId: null,
    });
    return;
  }

  // Build snapshot of current state BEFORE making any changes
  const existingCampaigns = await db.select().from(campaignsTable);
  const existingSCs = await db.select().from(shoppingCentersTable);
  const existingPlacements = await db.select().from(campaignPlacementsTable);
  const scMapForSnapshot = new Map(existingSCs.map((s) => [s.id, s]));

  const snapshot = {
    campaigns: existingCampaigns.map((c) => {
      const scNumbers = existingPlacements
        .filter((p) => p.campaignId === c.id)
        .map((p) => scMapForSnapshot.get(p.shoppingCenterId)?.number ?? "");
      return { ...c, shoppingCenterNumbers: scNumbers };
    }),
    shoppingCenters: existingSCs.map((sc) => ({
      number: sc.number,
      address: sc.address,
      city: sc.city,
      format: sc.format,
    })),
  };

  // Collect all unique SC numbers needed
  const allScNumbers = new Set<string>();
  for (const c of campaignRows) {
    for (const num of c.shoppingCenterNumbers) allScNumbers.add(num);
  }

  // Resolve existing SC IDs by number
  const scByNumber = new Map<string, number>(existingSCs.map((sc) => [sc.number, sc.id]));

  // Determine unknown SC numbers to create as placeholders
  const unknownNumbers = [...allScNumbers].filter((n) => !scByNumber.has(n));

  // Execute all destructive writes atomically
  let importedCampaigns = 0;
  let importedPlacements = 0;
  let historyEntryId: number;

  await db.transaction(async (tx) => {
    // Create placeholder SCs for unknown numbers (outside campaign data)
    if (unknownNumbers.length > 0) {
      logger.warn({ unknownNumbers }, "Unknown SC numbers in import, creating placeholders");
      const inserted = await tx
        .insert(shoppingCentersTable)
        .values(
          unknownNumbers.map((n) => ({
            number: n,
            city: "Неизвестный",
            format: "ГМ",
            address: null,
          })),
        )
        .onConflictDoNothing()
        .returning();
      for (const sc of inserted) scByNumber.set(sc.number, sc.id);
    }

    // Clear existing campaigns and placements (SCs are preserved)
    await tx.delete(campaignPlacementsTable);
    await tx.delete(campaignsTable);

    // Insert new campaigns and placements
    for (const c of campaignRows) {
      const [inserted] = await tx
        .insert(campaignsTable)
        .values({
          name: c.name,
          client: c.client,
          duration: c.duration,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
        })
        .returning();

      importedCampaigns++;

      const placements = c.shoppingCenterNumbers
        .filter((n) => scByNumber.has(n))
        .map((n) => ({
          campaignId: inserted.id,
          shoppingCenterId: scByNumber.get(n)!,
        }));

      if (placements.length > 0) {
        await tx
          .insert(campaignPlacementsTable)
          .values(placements)
          .onConflictDoNothing();
        importedPlacements += placements.length;
      }
    }

    // Save history entry
    const [historyEntry] = await tx
      .insert(importHistoryTable)
      .values({
        campaignCount: importedCampaigns,
        placementCount: importedPlacements,
        filename: req.file!.originalname,
        snapshot,
      })
      .returning();

    historyEntryId = historyEntry.id;

    // Trim history to last 50 within the same transaction
    const allHistory = await tx.select({ id: importHistoryTable.id, importedAt: importHistoryTable.importedAt }).from(importHistoryTable);
    if (allHistory.length > 50) {
      const toDelete = allHistory
        .sort((a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime())
        .slice(0, allHistory.length - 50);
      for (const h of toDelete) {
        await tx.delete(importHistoryTable).where(eq(importHistoryTable.id, h.id));
      }
    }
  });

  // Notify all SSE clients after successful commit
  broadcastDataUpdated();

  res.json({
    success: true,
    importedCampaigns,
    importedPlacements,
    errors,
    historyId: historyEntryId!,
  });
});

router.get("/import-history", async (_req, res): Promise<void> => {
  const history = await db
    .select({
      id: importHistoryTable.id,
      importedAt: importHistoryTable.importedAt,
      campaignCount: importHistoryTable.campaignCount,
      placementCount: importHistoryTable.placementCount,
      filename: importHistoryTable.filename,
    })
    .from(importHistoryTable);

  const sorted = history.sort(
    (a, b) =>
      new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
  );

  res.json(sorted);
});

router.post("/import-history/:id/restore", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RestoreImportParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [historyEntry] = await db
    .select()
    .from(importHistoryTable)
    .where(eq(importHistoryTable.id, params.data.id));

  if (!historyEntry) {
    res.status(404).json({ error: "Import history entry not found" });
    return;
  }

  const { snapshot } = historyEntry;

  // Read current state BEFORE any writes (for the pre-restore snapshot)
  const currentCampaigns = await db.select().from(campaignsTable);
  const currentSCs = await db.select().from(shoppingCentersTable);
  const currentPlacements = await db.select().from(campaignPlacementsTable);
  const scMapCurrent = new Map(currentSCs.map((s) => [s.id, s]));

  const currentSnapshot = {
    campaigns: currentCampaigns.map((c) => {
      const scNumbers = currentPlacements
        .filter((p) => p.campaignId === c.id)
        .map((p) => scMapCurrent.get(p.shoppingCenterId)?.number ?? "");
      return { ...c, shoppingCenterNumbers: scNumbers };
    }),
    shoppingCenters: currentSCs.map((sc) => ({
      number: sc.number,
      address: sc.address,
      city: sc.city,
      format: sc.format,
    })),
  };

  const existingSCNumsSet = new Set(currentSCs.map((s) => s.number));
  const scByNumber = new Map(currentSCs.map((s) => [s.number, s.id]));

  let restoredCampaigns = 0;
  let restoredPlacements = 0;

  await db.transaction(async (tx) => {
    // Save pre-restore snapshot as a new history entry
    await tx.insert(importHistoryTable).values({
      campaignCount: currentCampaigns.length,
      placementCount: currentPlacements.length,
      filename: `pre-restore-${new Date().toISOString()}`,
      snapshot: currentSnapshot,
    });

    // Restore shopping centers that don't exist yet
    for (const sc of snapshot.shoppingCenters) {
      if (!existingSCNumsSet.has(sc.number)) {
        const [inserted] = await tx
          .insert(shoppingCentersTable)
          .values(sc)
          .onConflictDoNothing()
          .returning();
        if (inserted) scByNumber.set(inserted.number, inserted.id);
        existingSCNumsSet.add(sc.number);
      }
    }

    // Clear and rebuild campaigns/placements atomically
    await tx.delete(campaignPlacementsTable);
    await tx.delete(campaignsTable);

    for (const c of snapshot.campaigns) {
      const [inserted] = await tx
        .insert(campaignsTable)
        .values({
          name: c.name,
          client: c.client,
          duration: c.duration,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
        })
        .returning();

      restoredCampaigns++;

      const placements = c.shoppingCenterNumbers
        .filter((n): n is string => Boolean(n) && scByNumber.has(n))
        .map((n) => ({
          campaignId: inserted.id,
          shoppingCenterId: scByNumber.get(n)!,
        }));

      if (placements.length > 0) {
        await tx
          .insert(campaignPlacementsTable)
          .values(placements)
          .onConflictDoNothing();
        restoredPlacements += placements.length;
      }
    }
  });

  broadcastDataUpdated();

  res.json({
    success: true,
    restoredCampaigns,
    restoredPlacements,
  });
});

export default router;
