import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldAlert, MapPin, Eye } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "md" }) => {
  const normalized = (status || "").toLowerCase().trim();
  const isSm = size === "sm";

  switch (normalized) {
    case "present":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs sm:text-sm"
          }`}
        >
          <CheckCircle2 className={isSm ? "w-3 h-3" : "w-4 h-4"} />
          Present
        </span>
      );

    case "late":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs sm:text-sm"
          }`}
        >
          <Clock className={isSm ? "w-3 h-3" : "w-4 h-4"} />
          Late
        </span>
      );

    case "pending_review":
    case "manual_review":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-orange-50 text-orange-700 border border-orange-200 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs sm:text-sm"
          }`}
        >
          <AlertTriangle className={isSm ? "w-3 h-3" : "w-4 h-4"} />
          Flagged / Review
        </span>
      );

    case "rejected":
    case "absent":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs sm:text-sm"
          }`}
        >
          <XCircle className={isSm ? "w-3 h-3" : "w-4 h-4"} />
          {normalized === "absent" ? "Absent" : "Rejected"}
        </span>
      );

    case "verified":
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-md bg-blue-50 text-blue-700 border border-blue-200 ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          }`}
        >
          <MapPin className="w-3 h-3" />
          Verified
        </span>
      );

    case "out_of_bounds":
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-md bg-red-50 text-red-700 border border-red-200 ${
            isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
          }`}
        >
          <ShieldAlert className="w-3 h-3" />
          Out of Bounds
        </span>
      );

    case "active":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-xs"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Session
        </span>
      );

    case "completed":
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-xs"
          }`}
        >
          Completed
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-slate-100 text-slate-700 ${
            isSm ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-xs"
          }`}
        >
          {status}
        </span>
      );
  }
};
