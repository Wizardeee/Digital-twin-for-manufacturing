import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { queryOne } from "../db.js";

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || "fact-view",
};

if (!getApps().length) {
  initializeApp(firebaseAdminConfig);
}

const adminAuth = getAuth();

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // Dev mode: allow unauthenticated requests with stub user
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (process.env.NODE_ENV !== "production") {
      req.user = {
        uid: "00000000-0000-0000-0000-000000000001",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        role: "admin",
      };
      return next();
    }
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split("Bearer ")[1];

  if (token === "dev-token" && process.env.NODE_ENV !== "production") {
    req.user = {
      uid: "00000000-0000-0000-0000-000000000001",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
    };
    return next();
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);

    const dbUser = await queryOne(
      "SELECT * FROM users WHERE firebase_uid = $1",
      [decoded.uid]
    );

    if (dbUser) {
      req.user = {
        uid: dbUser.id,
        firebaseUid: decoded.uid,
        email: decoded.email || dbUser.email,
        tenantId: dbUser.tenant_id,
        role: dbUser.role,
      };
    } else {
      const defaultOrg = await queryOne(
        "SELECT id FROM organizations LIMIT 1"
      );
      const tenantId = defaultOrg?.id || "550e8400-e29b-41d4-a716-446655440000";

      const newUser = await queryOne(
        `INSERT INTO users (firebase_uid, tenant_id, name, email, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [decoded.uid, tenantId, decoded.email || "User", decoded.email || "", "operator"]
      );

      req.user = {
        uid: newUser.id,
        firebaseUid: decoded.uid,
        email: decoded.email,
        tenantId: newUser.tenant_id,
        role: newUser.role,
      };
    }

    next();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      req.user = {
        uid: "00000000-0000-0000-0000-000000000001",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        role: "admin",
      };
      return next();
    }
    return res.status(401).json({ message: "Invalid token" });
  }
}
