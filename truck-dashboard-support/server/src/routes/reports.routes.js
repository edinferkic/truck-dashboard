// server/src/routes/report.routes.js
import { Router } from "express";
import { pool } from "../db.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

/**
 * POST /report/weekly { from, to }
 * -> { from, to, loads_net, standalone_expenses, weekly_net }
 */
router.post("/weekly", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.user?.id || req.auth?.id || req.user_id;
    const { from, to } = req.body;

    const loadsSql = `
      SELECT
        COALESCE(SUM(
          gross_pay
          - COALESCE(broker_fee,0)
          - COALESCE(fuel_cost,0)
          - COALESCE(tolls,0)
          - COALESCE(maintenance_cost,0)
          - COALESCE(other_costs,0)
        ),0) AS loads_net
      FROM loads
      WHERE user_id = $1
        AND pickup_date >= $2
        AND pickup_date <= $3
    `;
    const { rows: lrows } = await pool.query(loadsSql, [userId, from, to]);
    const loads_net = Number(lrows[0]?.loads_net ?? 0);

    const expSql = `
      SELECT COALESCE(SUM(amount),0) AS standalone_expenses
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= $2
        AND expense_date <= $3
    `;
    const { rows: erows } = await pool.query(expSql, [userId, from, to]);
    const standalone_expenses = Number(erows[0]?.standalone_expenses ?? 0);

    const weekly_net = loads_net - standalone_expenses;

    res.json({ from, to, loads_net, standalone_expenses, weekly_net });
  } catch (err) {
    next(err);
  }
});

export default router;
