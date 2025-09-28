// server/src/routes/loads.routes.js
import { Router } from "express";
import { pool } from "../db.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

function stateFromPlace(s = "") {
  // Try to pull a 2-letter state from "City, ST"
  const m = String(s).match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : null;
}

function makeTitle(l) {
  const fn = l.driver_first_name?.trim() || '';
  const ln = l.driver_last_name?.trim()  || '';
  const ps = (l.pickup_state || stateFromPlace(l.origin) || '??').toUpperCase();
  const ds = (l.dropoff_state || stateFromPlace(l.destination) || '??').toUpperCase();
  const dd = l.delivery_date?.slice?.(0, 10) || l.delivery_date || '';
  return [fn, ln, `${ps}-${ds}`, dd].filter(Boolean).join(' ');
}

// List loads
router.get("/", authGuard, async (req, res, next) => {
  try {
    const userId =
      req.user?.id || req.auth?.user?.id || req.auth?.id || req.user_id;
    const { rows } = await pool.query(
      `SELECT *
         FROM loads
        WHERE user_id = $1
        ORDER BY pickup_date DESC NULLS LAST, id DESC`,
      [userId]
    );
    const withTitle = rows.map(r => ({ ...r, title: makeTitle(r) }));
    res.json(withTitle);
  } catch (err) {
    next(err);
  }
});

// Create-or-update (idempotent) using your unique signature
router.post("/", authGuard, async (req, res, next) => {
  try {
    const userId =
      req.user?.id || req.auth?.user?.id || req.auth?.id || req.user_id;

    const {
      pickup_date,
      delivery_date,
      origin,
      destination,
      miles,
      gross_pay,
      broker_fee = 0,
      fuel_cost = 0,
      tolls = 0,
      maintenance_cost = 0,
      other_costs = 0,
      notes = "",
      status = "completed",
      // NEW:
      driver_first_name = "",
      driver_last_name = "",
      pickup_state,
      dropoff_state,
    } = req.body;

    // derive states when missing
    const ps = pickup_state || stateFromPlace(origin);
    const ds = dropoff_state || stateFromPlace(destination);

    const sql = `
      INSERT INTO loads (
        user_id, pickup_date, delivery_date, origin, destination,
        miles, gross_pay, broker_fee, fuel_cost, tolls,
        maintenance_cost, other_costs, notes, status,
        driver_first_name, driver_last_name, pickup_state, dropoff_state
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,
        $15,$16,$17,$18
      )
      ON CONFLICT (user_id, pickup_date, delivery_date, origin, destination, miles, gross_pay)
      DO UPDATE SET
        broker_fee       = EXCLUDED.broker_fee,
        fuel_cost        = EXCLUDED.fuel_cost,
        tolls            = EXCLUDED.tolls,
        maintenance_cost = EXCLUDED.maintenance_cost,
        other_costs      = EXCLUDED.other_costs,
        notes            = EXCLUDED.notes,
        status           = EXCLUDED.status,
        driver_first_name= EXCLUDED.driver_first_name,
        driver_last_name = EXCLUDED.driver_last_name,
        pickup_state     = COALESCE(EXCLUDED.pickup_state, loads.pickup_state),
        dropoff_state    = COALESCE(EXCLUDED.dropoff_state, loads.dropoff_state),
        updated_at       = NOW()
      RETURNING *;
    `;

    const params = [
      userId,
      pickup_date,
      delivery_date,
      origin,
      destination,
      miles,
      gross_pay,
      broker_fee,
      fuel_cost,
      tolls,
      maintenance_cost,
      other_costs,
      notes,
      status,
      driver_first_name,
      driver_last_name,
      ps,
      ds,
    ];

    const { rows } = await pool.query(sql, params);
    const saved = rows[0];
    res.json({ ...saved, title: makeTitle(saved) });
  } catch (err) {
    if (err?.code === "23505") {
      return res
        .status(409)
        .json({ error: "DuplicateLoad", message: "Load already exists." });
    }
    next(err);
  }
});

export default router;
