import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, campaignsTable, shoppingCentersTable, campaignPlacementsTable } from "@workspace/db";
import {
  ListCampaignsQueryParams,
  GetCampaignParams,
  DeleteCampaignParams,
  BulkDeleteCampaignsBody,
  CreateCampaignBody,
} from "@workspace/api-zod";
import { broadcastDataUpdated } from "../lib/sse";

const router: IRouter = Router();

const ALLOWED_FORMATS = ["ГМ", "СМ", "част.ГМ", "част.СМ", "ГМ+СМ"];

let schemaEnsured = false;
async function ensureCampaignColumns() {
  if (schemaEnsured) return;
  try {
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tk_type text`);
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS note text`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bookings (
        id serial PRIMARY KEY,
        surname text NOT NULL,
        start_date text NOT NULL,
        end_date text NOT NULL,
        format text NOT NULL,
        payer_type text NOT NULL,
        duration integer NOT NULL,
        tk_numbers text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    schemaEnsured = true;
  } catch (err) {
    console.error("Schema check error:", err);
  }
}

function normalizePayerStatus(raw: unknown): "Платник" | "Не платник" {
  if (!raw) return "Не платник";
  const s = String(raw).trim().toLowerCase();
  if (s === "платный" || s === "платник" || s === "платная") return "Платник";
  return "Не платник";
}

function extractRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as any).rows)) {
    return (result as any).rows;
  }
  return [];
}

// ==================== МАРШРУТЫ БРОНИРОВАНИЯ ====================

router.get("/bookings", async (_req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();
    const rawRes = await db.execute(
      sql`SELECT id, surname, start_date, end_date, format, payer_type, duration, tk_numbers, created_at FROM bookings ORDER BY created_at ASC, id ASC`
    );
    const rows = extractRows(rawRes);
    const formatted = rows.map((r) => ({
      id: Number(r.id),
      surname: String(r.surname || ""),
      startDate: String(r.start_date || ""),
      endDate: String(r.end_date || ""),
      format: String(r.format || "ГМ"),
      payerType: String(r.payer_type || "платная"),
      duration: Number(r.duration || 5),
      shoppingCenterNumbers: String(r.tk_numbers || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      tkNumbersRaw: String(r.tk_numbers || ""),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
    res.json(formatted);
  } catch (err: any) {
    console.error("GET /bookings error:", err);
    res.status(500).json({ error: err?.message || "Ошибка загрузки списка бронирования" });
  }
});

router.post("/bookings", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();
    const surname = String(req.body?.surname || "").trim();
    const startDate = String(req.body?.startDate || "").trim();
    const endDate = String(req.body?.endDate || "").trim();
    const format = String(req.body?.format || "ГМ").trim();
    const payerType = String(req.body?.payerType || "платная").trim();
    const duration = Number(req.body?.duration || 0);

    const rawNums = Array.isArray(req.body?.shoppingCenterNumbers)
      ? req.body.shoppingCenterNumbers
      : String(req.body?.shoppingCenterNumbers || "").split(",");
    const uniqueScNumbers = Array.from(
      new Set(rawNums.map((n: unknown) => String(n).trim()).filter(Boolean))
    );
    const tkNumbersStr = uniqueScNumbers.join(", ");

    if (!surname) {
      res.status(400).json({ error: "Укажите фамилию" });
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      res.status(400).json({ error: "Проверьте даты показа" });
      return;
    }
    if (!duration || duration <= 0) {
      res.status(400).json({ error: "Выберите хронометраж" });
      return;
    }
    if (uniqueScNumbers.length === 0) {
      res.status(400).json({ error: "Укажите список ТК" });
      return;
    }

    const insertRes = await db.execute(
      sql`INSERT INTO bookings (surname, start_date, end_date, format, payer_type, duration, tk_numbers)
          VALUES (${surname}, ${startDate}, ${endDate}, ${format}, ${payerType}, ${duration}, ${tkNumbersStr})
          RETURNING id, surname, start_date, end_date, format, payer_type, duration, tk_numbers, created_at`
    );
    const rows = extractRows(insertRes);
    const r = rows[0] || {};

    broadcastDataUpdated();

    res.status(201).json({
      id: Number(r.id),
      surname: String(r.surname || surname),
      startDate: String(r.start_date || startDate),
      endDate: String(r.end_date || endDate),
      format: String(r.format || format),
      payerType: String(r.payer_type || payerType),
      duration: Number(r.duration || duration),
      shoppingCenterNumbers: uniqueScNumbers,
      tkNumbersRaw: tkNumbersStr,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("POST /bookings error:", err);
    res.status(500).json({ error: err?.message || "Ошибка сохранения брони" });
  }
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const idParsed = parseInt(rawId, 10);
    if (Number.isNaN(idParsed)) {
      res.status(400).json({ error: "Некорректный ID брони" });
      return;
    }
    await db.execute(sql`DELETE FROM bookings WHERE id = ${idParsed}`);
    broadcastDataUpdated();
    res.json({ success: true, deleted: 1 });
  } catch (err: any) {
    console.error("DELETE /bookings/:id error:", err);
    res.status(500).json({ error: err?.message || "Ошибка удаления брони" });
  }
});

// ==================== МАРШРУТЫ РЕКЛАМНЫХ КАМПАНИЙ ====================

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();

    const parsed = ListCampaignsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { search, status, showActiveOnly, date } = parsed.data;
    const today = date ?? new Date().toISOString().slice(0, 10);

    let rows = await db.select().from(campaignsTable);

    if (showActiveOnly) {
      rows = rows.filter((c) => c.startDate <= today && c.endDate >= today);
    }
    if (status) {
      const normStatus = normalizePayerStatus(status);
      rows = rows.filter((c) => normalizePayerStatus(c.status) === normStatus);
    }
    if (search) {
      const lower = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.client.toLowerCase().includes(lower),
      );
    }

    const allPlacements = await db
      .select({
        campaignId: campaignPlacementsTable.campaignId,
        sc: shoppingCentersTable,
      })
      .from(campaignPlacementsTable)
      .innerJoin(
        shoppingCentersTable,
        eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id),
      );

    const scByCampaign = new Map<number, (typeof shoppingCentersTable.$inferSelect)[]>();
    for (const p of allPlacements) {
      if (!scByCampaign.has(p.campaignId)) {
        scByCampaign.set(p.campaignId, []);
      }
      scByCampaign.get(p.campaignId)!.push(p.sc);
    }

    const enrichedRows = rows.map((r) => ({
      ...r,
      shoppingCenters: scByCampaign.get(r.id) ?? [],
    }));

    res.json(enrichedRows);
  } catch (err: any) {
    console.error("GET /campaigns error:", err);
    res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
});

router.post("/campaigns", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();

    const rawNumbers: string[] = Array.isArray(req.body?.shoppingCenterNumbers)
      ? req.body.shoppingCenterNumbers
      : [];
    const uniqueScNumbers = Array.from(
      new Set(rawNumbers.map((n) => String(n).trim()).filter(Boolean)),
    );

    const normalizedBody = {
      ...req.body,
      status: normalizePayerStatus(req.body?.status ?? req.body?.type),
      duration: Number(req.body?.duration),
      shoppingCenterNumbers: uniqueScNumbers,
    };

    const parsed = CreateCampaignBody.safeParse(normalizedBody);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, startDate, endDate, client, status, duration, shoppingCenterNumbers } = parsed.data;
    const note = (req.body?.note as string | undefined) ?? null;
    const tkTypeRaw = (req.body && (req.body.tkType || req.body.tk_type || req.body.format)) as string | undefined;
    const tkType = tkTypeRaw && ALLOWED_FORMATS.includes(tkTypeRaw) ? tkTypeRaw : null;

    if (startDate > endDate) {
      res.status(400).json({ error: "Дата старта не может быть позже даты окончания" });
      return;
    }

    const existingSCs = await db.select().from(shoppingCentersTable);
    const scByNumber = new Map(existingSCs.map((sc) => [sc.number, sc.id]));

    const unknownNumbers = shoppingCenterNumbers.filter((n) => !scByNumber.has(n));
    if (unknownNumbers.length > 0) {
      const defaultFormat = tkType && tkType.includes("СМ") ? "СМ" : "ГМ";
      await db
        .insert(shoppingCentersTable)
        .values(
          unknownNumbers.map((n) => ({
            number: n,
            city: "Неизвестный",
            format: defaultFormat,
            address: null,
          })),
        )
        .onConflictDoNothing();

      const refreshedSCs = await db.select().from(shoppingCentersTable);
      for (const sc of refreshedSCs) scByNumber.set(sc.number, sc.id);
    }

    const [campaign] = await db
      .insert(campaignsTable)
      .values({ name, startDate, endDate, client, status, duration, note, tkType })
      .returning();

    if (shoppingCenterNumbers.length > 0) {
      const placements = shoppingCenterNumbers
        .filter((n) => scByNumber.has(n))
        .map((n) => ({ campaignId: campaign.id, shoppingCenterId: scByNumber.get(n)! }));
      if (placements.length > 0) {
        await db.insert(campaignPlacementsTable).values(placements).onConflictDoNothing();
      }
    }

    const placementRows = await db
      .select({ sc: shoppingCentersTable })
      .from(campaignPlacementsTable)
      .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
      .where(eq(campaignPlacementsTable.campaignId, campaign.id));

    broadcastDataUpdated();

    res.status(201).json({ ...campaign, shoppingCenters: placementRows.map((p) => p.sc) });
  } catch (err: any) {
    console.error("POST /campaigns error:", err);
    res.status(500).json({ error: err?.message || "Ошибка сохранения кампании" });
  }
});

router.post("/campaigns/bulk-delete", async (req, res): Promise<void> => {
  try {
    const parsed = BulkDeleteCampaignsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { ids } = parsed.data;
    if (ids.length === 0) {
      res.json({ success: true, deleted: 0 });
      return;
    }

    const deleted = await db
      .delete(campaignsTable)
      .where(inArray(campaignsTable.id, ids))
      .returning();

    broadcastDataUpdated();

    res.json({ success: true, deleted: deleted.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Ошибка массового удаления" });
  }
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();

    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const params = GetCampaignParams.safeParse({ id: parseInt(rawId, 10) });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const placements = await db
      .select({ sc: shoppingCentersTable })
      .from(campaignPlacementsTable)
      .innerJoin(
        shoppingCentersTable,
        eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id),
      )
      .where(eq(campaignPlacementsTable.campaignId, campaign.id));

    const shoppingCenters = placements.map((p) => p.sc);

    res.json({ ...campaign, shoppingCenters });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Ошибка получения кампании" });
  }
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const params = DeleteCampaignParams.safeParse({ id: parseInt(rawId, 10) });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    broadcastDataUpdated();

    res.json({ success: true, deleted: 1 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Ошибка удаления кампании" });
  }
});

router.put("/campaigns/:id", async (req, res): Promise<void> => {
  try {
    await ensureCampaignColumns();

    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const idParsed = parseInt(rawId, 10);
    if (Number.isNaN(idParsed)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const rawNumbers: string[] = Array.isArray(req.body?.shoppingCenterNumbers)
      ? req.body.shoppingCenterNumbers
      : [];
    const uniqueScNumbers = Array.from(
      new Set(rawNumbers.map((n) => String(n).trim()).filter(Boolean)),
    );

    const normalizedBody = {
      ...req.body,
      status: normalizePayerStatus(req.body?.status ?? req.body?.type),
      duration: Number(req.body?.duration),
      shoppingCenterNumbers: uniqueScNumbers,
    };

    const parsed = CreateCampaignBody.safeParse(normalizedBody);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, startDate, endDate, client, status, duration, shoppingCenterNumbers } = parsed.data;
    const note = (req.body?.note as string | undefined) ?? null;
    const tkTypeRaw = (req.body && (req.body.tkType || req.body.tk_type || req.body.format)) as string | undefined;
    const tkType = tkTypeRaw && ALLOWED_FORMATS.includes(tkTypeRaw) ? tkTypeRaw : null;

    if (startDate > endDate) {
      res.status(400).json({ error: "Дата старта не может быть позже даты окончания" });
      return;
    }

    const existingSCs = await db.select().from(shoppingCentersTable);
    const scByNumber = new Map(existingSCs.map((sc) => [sc.number, sc.id]));

    const unknownNumbers = shoppingCenterNumbers.filter((n) => !scByNumber.has(n));
    if (unknownNumbers.length > 0) {
      const defaultFormat = tkType && tkType.includes("СМ") ? "СМ" : "ГМ";
      await db
        .insert(shoppingCentersTable)
        .values(
          unknownNumbers.map((n) => ({
            number: n,
            city: "Неизвестный",
            format: defaultFormat,
            address: null,
          })),
        )
        .onConflictDoNothing();

      const refreshedSCs = await db.select().from(shoppingCentersTable);
      for (const sc of refreshedSCs) scByNumber.set(sc.number, sc.id);
    }

    const [updated] = await db
      .update(campaignsTable)
      .set({ name, startDate, endDate, client, status, duration, note, tkType })
      .where(eq(campaignsTable.id, idParsed))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    await db.delete(campaignPlacementsTable).where(eq(campaignPlacementsTable.campaignId, idParsed));

    if (shoppingCenterNumbers.length > 0) {
      const placements = shoppingCenterNumbers
        .filter((n) => scByNumber.has(n))
        .map((n) => ({ campaignId: idParsed, shoppingCenterId: scByNumber.get(n)! }));
      if (placements.length > 0) {
        await db.insert(campaignPlacementsTable).values(placements).onConflictDoNothing();
      }
    }

    const placementRows = await db
      .select({ sc: shoppingCentersTable })
      .from(campaignPlacementsTable)
      .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
      .where(eq(campaignPlacementsTable.campaignId, idParsed));

    broadcastDataUpdated();

    res.json({ ...updated, shoppingCenters: placementRows.map((p) => p.sc) });
  } catch (err: any) {
    console.error("PUT /campaigns/:id error:", err);
    res.status(500).json({ error: err?.message || "Ошибка обновления кампании" });
  }
});

export default router;
