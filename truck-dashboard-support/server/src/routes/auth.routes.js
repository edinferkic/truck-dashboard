import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../schemas.js";
import { query } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";

const router = Router();

// POST /auth/register
router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const password_hash = await hashPassword(password);
    const sql = `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, created_at
    `;
    const { rows } = await query(sql, [email, password_hash]);
    if (rows.length === 0) return res.status(409).json({ error: "EmailExists" });

    const user = rows[0];
    const token = signToken({ id: user.id, email: user.email });
    res.status(201).json({ token, user });
  } catch (e) { next(e); }
});

// POST /auth/login
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query("SELECT id, email, password_hash FROM users WHERE email=$1", [email]);
    if (rows.length === 0) return res.status(401).json({ error: "InvalidCredentials" });

    const user = rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "InvalidCredentials" });

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) { next(e); }
});

export default router;
