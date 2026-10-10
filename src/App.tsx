import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { Login } from "./pages/Login";
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { FacultyDashboard } from "./pages/faculty/FacultyDashboard";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { ShieldCheck } from "lucide-react";

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();

  // Capture scanned QR query parameters into sessionStorage so they survive login
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("sessionId") || params.get("session");
    const token = params.get("token");
    const code = params.get("code");
    if (session) {
      sessionStorage.setItem(
        "scanned_attendance_qr",
        JSON.stringify({ sessionId: session, token: token || "", code: code || "" })
      );
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-xl shadow-indigo-500/30 animate-pulse">
          <ShieldCheck className="w-10 h-10 text-white" />
        </div>
        <p className="mt-4 font-bold text-sm tracking-wide text-indigo-200">
          Initializing CampusVerify Core Engine...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <Navbar />

      <main>
        {user.role === "student" && <StudentDashboard />}
        {user.role === "faculty" && <FacultyDashboard />}
        {user.role === "admin" && <AdminDashboard />}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
