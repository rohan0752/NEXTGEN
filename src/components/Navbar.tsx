import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, LogOut, UserCheck, ChevronDown, Sparkles, Building2, GraduationCap, ShieldAlert } from "lucide-react";

export const Navbar: React.FC<{ activeTab?: string; onTabChange?: (tab: string) => void }> = () => {
  const { user, logout, demoAccounts, quickLogin } = useAuth();
  const [showDemoMenu, setShowDemoMenu] = useState(false);

  if (!user) return null;

  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    faculty: "bg-blue-100 text-blue-800 border-blue-200",
    student: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    faculty: "Faculty Member",
    student: "Enrolled Student",
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-indigo-900 bg-clip-text text-transparent">
                  CampusVerify
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
                  v2.0 Multi-Layer
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                Geofenced & Multi-Layer Smart Attendance Engine (Biometrics Simulated)
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDemoMenu(!showDemoMenu)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                title="Switch persona for rapid testing"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden md:inline">Switch Demo Persona</span>
                <span className="md:hidden">Switch</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {showDemoMenu && (
                <div
                  className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                  onClick={() => setShowDemoMenu(false)}
                >
                  <div className="px-3 py-1.5 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">Rapid Test Personas</p>
                    <p className="text-[11px] text-slate-500">Switch account without re-entering credentials</p>
                  </div>
                  <div className="p-1 space-y-1">
                    {demoAccounts.map((account) => {
                      const isCurrent = user.email === account.email;
                      return (
                        <button
                          key={account.email}
                          onClick={() => quickLogin(account)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 ${
                            isCurrent
                              ? "bg-indigo-50 text-indigo-900 border border-indigo-200 font-semibold"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {account.role === "admin" && <Building2 className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />}
                          {account.role === "faculty" && <UserCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />}
                          {account.role === "student" && <GraduationCap className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900 truncate">{account.name}</span>
                              <span className="text-[10px] uppercase font-bold text-slate-400">{account.role}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{account.email}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* User Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-inner">
                {user.fullName.charAt(0)}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 leading-tight">{user.fullName}</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                      roleColors[user.role] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {roleLabels[user.role] || user.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
