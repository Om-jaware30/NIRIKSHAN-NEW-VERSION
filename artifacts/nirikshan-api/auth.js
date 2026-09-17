import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set to a 32+ character secret in production.");
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || "local-development-only-nirikshan-secret-please-change";

const defaultUsers = [
  { id: "civilian-demo", username: "civilian", password: "Civic@123", role: "civilian" },
  { id: "officer-demo", username: "officer", password: "Officer@123", role: "officer" },
  { id: "incharge-demo", username: "incharge", password: "Incharge@123", role: "incharge" },
  { id: "contractor-demo", username: "contractor", password: "Contractor@123", role: "contractor" },
];
let users = defaultUsers;
if (process.env.NIRIKSHAN_USERS_JSON) {
  try {
    const parsed = JSON.parse(process.env.NIRIKSHAN_USERS_JSON);
    if (Array.isArray(parsed) && parsed.length) users = parsed;
  } catch { throw new Error("NIRIKSHAN_USERS_JSON is not valid JSON."); }
}
if (process.env.NODE_ENV === "production" && !process.env.NIRIKSHAN_USERS_JSON) {
  throw new Error("Set NIRIKSHAN_USERS_JSON in production; demo passwords are disabled by configuration policy.");
}

export function login(username, password) {
  const user = users.find((item) => item.username === username && item.password === password);
  if (!user) return null;
  const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, EFFECTIVE_JWT_SECRET, { expiresIn: "8h" });
  return { token, user: { id: user.id, username: user.username, role: user.role } };
}

export function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.user = jwt.verify(token, EFFECTIVE_JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "Invalid or expired token" }); }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
