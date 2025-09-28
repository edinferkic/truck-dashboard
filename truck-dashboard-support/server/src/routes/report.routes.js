import express from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authGuard } from "../middleware/authGuard.js"; // <-- named import

const router = express.Router();

const schema = z.object({
  from: z.string().min(1, "from is required"),
  to: z.string().min(1, "to is required"),
});

router.post("/weekly", authGuard, async (req, res, next) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const { formErrors, fieldErrors } = parsed.error.flatten();
    return res
      .status(400)
      .json({ error: "ValidationError", details: { formErrors, fieldErrors } });
  }

  const { from, to } = parsed.data;

  try {
    const loadsSql = `
      SELECT COALESCE(SUM(net_profit), 0) AS loads_net
      FROM loads
      WHERE user_id = $1 AND pickup_date >= $2 AND pickup_date <= $3
    `;
    const expSql = `
      SELECT COALESCE(SUM(amount), 0) AS expenses_sum
      FROM expenses
      WHERE user_id = $1 AND expense_date >= $2 AND expense_date <= $3
    `;

    const [loadsRes, expRes] = await Promise.all([
      pool.query(loadsSql, [req.user.id, from, to]),
      pool.query(expSql,  [req.user.id, from, to]),
    ]);

    const loads_net = Number(loadsRes.rows[0]?.loads_net ?? 0);
    const standalone_expenses = Number(expRes.rows[0]?.expenses_sum ?? 0);
    const weekly_net = +(loads_net - standalone_expenses).toFixed(2);

    return res.status(200).json({ from, to, loads_net, standalone_expenses, weekly_net });
  } catch (err) {
    return next(err);
  }
});

export default router;
