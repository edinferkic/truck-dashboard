import express from "express";
import { pool } from "../db.js";
import { authGuard } from "../middleware/authGuard.js"; // named import
import { z } from "zod";

const router = express.Router();

// Zod validation for expense create
const expenseSchema = z.object({
  expense_date: z.string().min(1, "expense_date is required"),
  category: z.string().min(1, "category is required"),
  description: z.string().optional().default(""),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => !Number.isNaN(v), { message: "amount must be a number" }),
});

// List expenses for the authed user
router.get("/", authGuard, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, expense_date, category, description, amount, created_at
       FROM expenses
       WHERE user_id = $1
       ORDER BY expense_date DESC, created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
});

// Create expense (validated)
router.post("/", authGuard, async (req, res, next) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten
      ? parsed.error.flatten()
      : { errors: parsed.error.issues };
    return res.status(400).json({ error: "ValidationError", details });
  }

  const { expense_date, category, description, amount } = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO expenses (user_id, expense_date, category, description, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, expense_date, category, description, amount, created_at`,
      [req.user.id, expense_date, category, description, amount]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

export default router;
