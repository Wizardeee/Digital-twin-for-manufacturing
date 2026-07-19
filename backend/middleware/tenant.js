export function tenantMiddleware(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ message: "Tenant context not available" });
  }

  req.tenantId = req.user.tenantId;
  next();
}
