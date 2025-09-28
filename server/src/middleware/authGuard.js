import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change_me_please";

export function authGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
