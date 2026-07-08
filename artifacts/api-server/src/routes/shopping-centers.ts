import { Router, type IRouter } from "express";
import { db, shoppingCentersTable } from "@workspace/db";
import { ListShoppingCentersQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/shopping-centers", async (req, res): Promise<void> => {
  const parsed = ListShoppingCentersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { city, format } = parsed.data;

  let query = db.select().from(shoppingCentersTable).$dynamic();

  const conditions = [];
  if (city) conditions.push({ city });
  if (format) conditions.push({ format });

  let rows = await db.select().from(shoppingCentersTable);

  if (city) rows = rows.filter((r) => r.city === city);
  if (format) rows = rows.filter((r) => r.format === format);

  res.json(rows);
});

export default router;
