import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { TenantProvider } from "./contexts/TenantContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import FactoryViewer from "./pages/FactoryViewer";
import Upload from "./pages/Upload";
import DataManagement from "./pages/DataManagement";
import MachineDetail from "./pages/MachineDetail";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0a0a1a", overflowY: "auto" }}>
                    <Navbar />
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/" element={<FactoryViewer />} />
                        <Route path="/viewer" element={<FactoryViewer />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/upload" element={<Upload />} />
                        <Route path="/data" element={<DataManagement />} />
                        <Route path="/machine/:id" element={<MachineDetail />} />
                        <Route path="/settings" element={<Settings />} />
                      </Routes>
                    </ErrorBoundary>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
