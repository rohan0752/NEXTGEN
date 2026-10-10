import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  ShieldCheck,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Building2,
  UserCheck,
  GraduationCap,
  CheckCircle,
  UserPlus,
  LogIn,
} from "lucide-react";
import { DemoAccount } from "../types";

export const Login: React.FC = () => {
  const { login, register, quickLogin, demoAccounts, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  // Login & Register Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"student" | "faculty" | "admin">("student");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (authMode === "login") {
      if (!email.trim() || !password) {
        setError("Please enter both your institutional email and password.");
        return;
      }
      setSubmitting(true);
      try {
        await login(email.trim(), password);
      } catch (err: any) {
        setError(err.message || "Failed to sign in. Please verify your credentials.");
      } finally {
        setSubmitting(false);
      }
    } else {
      // Register validation
      if (!fullName.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (!email.trim()) {
        setError("Please enter an institutional email address.");
        return;
      }
      if (!password || password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      setSubmitting(true);
      try {
        await register(fullName.trim(), email.trim(), password, role);
      } catch (err: any) {
        setError(err.message || "Failed to create account. Please try again.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleFillCredentials = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  };

  const [scannedSessionCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || params.get("session");
    if (code) return code;
    const stored = sessionStorage.getItem("scanned_attendance_qr");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.code || parsed.sessionId;
      } catch {}
    }
    return null;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl"></div>
      </div>

      <div className="relative sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 shadow-xl shadow-indigo-500/30 mb-4 ring-8 ring-indigo-900/30">
          <ShieldCheck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          CampusVerify
        </h1>
        <p className="mt-2 text-sm text-indigo-200/80 font-medium max-w-sm mx-auto">
          Smart Multi-Layer Attendance System with Dynamic Rotating QR, Geofencing & Camera Capture
        </p>
      </div>

      <div className="relative sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white text-slate-900 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100/20">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                authMode === "login"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                authMode === "register"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Create Account (Register)
            </button>
          </div>

          {scannedSessionCode && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-sm animate-in fade-in duration-200">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">📱 Live Attendance QR Scanned!</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Session token captured. Sign in with your student account (or click <strong>Alex Rivers</strong> below) to immediately verify attendance.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm animate-in fade-in">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Authentication Notice</p>
                <p className="text-xs text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Authentication Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {authMode === "register" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Jordan Lee"
                    required
                    className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                {authMode === "login" ? "Institutional Email or Student ID" : "Institutional Email"}
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type={authMode === "login" ? "text" : "email"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={authMode === "login" ? "name@campusverify.edu or STU-..." : "name@campusverify.edu"}
                  required
                  className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Password {authMode === "register" && "(Min. 6 Characters)"}
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="block w-full pl-10 pr-3 py-2.5 sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                />
              </div>
            </div>

            {authMode === "register" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Institutional Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      role === "student"
                        ? "bg-indigo-50 border-indigo-600 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("faculty")}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                      role === "faculty"
                        ? "bg-indigo-50 border-indigo-600 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    Faculty
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {role === "student" && "Students can scan QR codes, verify attendance, and view academic records."}
                  {role === "faculty" && "Faculty can launch live dynamic QR sessions and review student attendance."}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full mt-3 flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting
                ? authMode === "login"
                  ? "Authenticating Session..."
                  : "Creating Institutional Account..."
                : authMode === "login"
                ? "Sign in to Dashboard"
                : "Register & Open Dashboard"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Demonstration Credentials Reference */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Demonstration Test Accounts
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Click to fill form credentials</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {demoAccounts.map((account) => {
                const isStudent = account.role === "student";
                const isFaculty = account.role === "faculty";
                const isAdmin = account.role === "admin";

                return (
                  <div
                    key={account.email}
                    className="p-3 text-left border rounded-xl bg-slate-50/70 border-slate-200 flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700"
                            : isFaculty
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {isAdmin && <Building2 className="w-4 h-4" />}
                        {isFaculty && <UserCheck className="w-4 h-4" />}
                        {isStudent && <GraduationCap className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {account.name.split(" (")[0]}
                          </p>
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                              isAdmin
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : isFaculty
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {account.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{account.roleLabel}</p>
                        <p className="text-[10px] text-indigo-600 font-mono mt-0.5 truncate">{account.email}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleFillCredentials(account)}
                      className="w-full py-1.5 px-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-bold text-slate-700 hover:text-indigo-700 transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      Fill Credentials
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System Capabilities Pills */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Dynamic Rotating QR
            </span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Geofence Haversine Check
            </span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Camera Verification (Demo Snapshot)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
