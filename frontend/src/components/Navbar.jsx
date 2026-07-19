import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { path: "/", label: "3D Viewer" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/upload", label: "Upload" },
  { path: "/data", label: "Data" },
  { path: "/settings", label: "Settings" },
];

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        zIndex: 100,
        background: "transparent",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, pointerEvents: "auto" }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                textDecoration: "none",
                color: isActive ? "#f1f5f9" : "#94a3b8",
                background: isActive ? "rgba(148, 163, 184, 0.15)" : "transparent",
                fontSize: 12,
                fontWeight: 500,
                transition: "all 0.15s ease",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
        {user && (
          <>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || "?"}
            </div>
            <button
              onClick={logout}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
