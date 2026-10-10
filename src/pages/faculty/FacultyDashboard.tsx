import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { AttendanceSession, Course, Classroom, RosterStudent } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { QRCodeSVG } from "qrcode.react";
import {
  Play,
  StopCircle,
  RefreshCw,
  QrCode,
  Users,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  X,
  ChevronRight,
  ExternalLink,
  Eye,
  Info,
  FileText,
} from "lucide-react";

export const FacultyDashboard: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [qrChallenge, setQrChallenge] = useState<any>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);

  // Network & Wi-Fi IP states for multi-device QR scanning
  const [networkInfo, setNetworkInfo] = useState<{
    lanIp: string;
    wifiUrl5173: string;
    wifiUrl5000: string;
    localhostUrl: string;
  } | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);

  // New Session Form State
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Lecture Session");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [qrRotationSeconds, setQrRotationSeconds] = useState(15);
  const [requireLocation, setRequireLocation] = useState(true);
  const [requireFace, setRequireFace] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Override State
  const [selectedRosterItem, setSelectedRosterItem] = useState<RosterStudent | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<"present" | "late" | "rejected">("present");
  const [overrideReason, setOverrideReason] = useState("");
  const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);

  // Global pending reviews for this faculty
  const [pendingReviewsList, setPendingReviewsList] = useState<any[]>([]);

  // Historical session inspection
  const [inspectingSession, setInspectingSession] = useState<AttendanceSession | null>(null);
  const [inspectingRoster, setInspectingRoster] = useState<RosterStudent[]>([]);
  const [isLoadingInspectingRoster, setIsLoadingInspectingRoster] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [coursesRes, classroomsRes, sessionsRes, netRes, pendingRes] = await Promise.all([
        api.courses.list(),
        api.classrooms.list(),
        api.sessions.list(),
        api.sessions.getNetworkInfo().catch(() => null),
        api.attendance.pendingReviews().catch(() => ({ reviews: [] })),
      ]);

      setCourses(coursesRes.courses);
      setClassrooms(classroomsRes.classrooms);
      setSessions(sessionsRes.sessions);
      setPendingReviewsList(pendingRes?.reviews || []);

      if (netRes) {
        setNetworkInfo(netRes);
        if (!selectedOrigin) {
          // Default to Wi-Fi URL so phone camera scanning works out of the box!
          setSelectedOrigin(netRes.wifiUrl5173);
        }
      }

      if (coursesRes.courses.length > 0 && !selectedCourseId) {
        setSelectedCourseId(coursesRes.courses[0].id);
      }
      if (classroomsRes.classrooms.length > 0 && !selectedClassroomId) {
        setSelectedClassroomId(classroomsRes.classrooms[0].id);
      }

      const active = sessionsRes.sessions.find((s) => s.status === "active");
      if (active) {
        setActiveSession(active);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error("Failed to load faculty data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll active session QR & Roster
  useEffect(() => {
    if (!activeSession) return;

    let qrInterval: NodeJS.Timeout;
    let rosterInterval: NodeJS.Timeout;

    const fetchQr = async () => {
      try {
        const qr = await api.sessions.getQr(activeSession.id, selectedOrigin || undefined);
        setQrChallenge(qr);
      } catch (err) {
        console.error("Failed to poll QR token:", err);
      }
    };

    const fetchRoster = async () => {
      try {
        const r = await api.sessions.getRoster(activeSession.id);
        setRoster(r.roster);
      } catch (err) {
        console.error("Failed to poll roster:", err);
      }
    };

    fetchQr();
    fetchRoster();

    // Re-fetch QR slightly faster than rotation interval to maintain fresh tokens
    const intervalMs = Math.max(5000, ((activeSession.qrRotationSeconds || 15) - 2) * 1000);
    qrInterval = setInterval(fetchQr, intervalMs);
    rosterInterval = setInterval(fetchRoster, 4000);

    return () => {
      clearInterval(qrInterval);
      clearInterval(rosterInterval);
    };
  }, [activeSession, selectedOrigin]);

  // Handle Session Creation
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedClassroomId) {
      alert("Please select a course and classroom.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.sessions.create({
        courseId: selectedCourseId,
        classroomId: selectedClassroomId,
        title: sessionTitle,
        durationMinutes,
        qrRotationSeconds,
        requireLocation,
        requireFace,
      });

      setIsCreatingSession(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to start session: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Ending Session
  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!window.confirm("Are you sure you want to end this attendance session? New submissions will be blocked.")) {
      return;
    }
    try {
      await api.sessions.end(activeSession.id);
      setActiveSession(null);
      setQrChallenge(null);
      await loadData();
    } catch (err: any) {
      alert("Failed to end session: " + err.message);
    }
  };

  const handleInspectSession = async (session: AttendanceSession) => {
    try {
      setInspectingSession(session);
      setIsLoadingInspectingRoster(true);
      const r = await api.sessions.getRoster(session.id);
      setInspectingRoster(r.roster);
    } catch (err: any) {
      alert("Failed to load session roster: " + err.message);
    } finally {
      setIsLoadingInspectingRoster(false);
    }
  };

  // Handle Override
  const handleManualOverride = async () => {
    if (!selectedRosterItem || !selectedRosterItem.recordId) return;
    if (!overrideReason.trim()) {
      alert("A specific justification reason is required for manual attendance review and audit logging.");
      return;
    }
    try {
      setIsOverrideSubmitting(true);
      await api.attendance.manualOverride({
        recordId: selectedRosterItem.recordId,
        newStatus: overrideStatus,
        reason: overrideReason.trim(),
      });
      setSelectedRosterItem(null);
      setOverrideReason("");
      if (activeSession) {
        const r = await api.sessions.getRoster(activeSession.id);
        setRoster(r.roster);
      }
      if (inspectingSession) {
        const r = await api.sessions.getRoster(inspectingSession.id);
        setInspectingRoster(r.roster);
      }
      await loadData();
    } catch (err: any) {
      alert("Override failed: " + err.message);
    } finally {
      setIsOverrideSubmitting(false);
    }
  };

  const presentCount = roster.filter((r) => r.status === "present").length;
  const lateCount = roster.filter((r) => r.status === "late").length;
  const pendingCount = roster.filter((r) => r.status === "pending_review").length;
  const totalEnrolled = roster.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Faculty Command Portal
            </span>
            <span className="text-xs text-indigo-200">
              Department of Computer Science & Engineering
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {user?.fullName}
          </h1>
          <p className="text-sm text-indigo-200/80 mt-1">
            Manage course rosters, project rotating anti-spoofing QR codes, and review geofence flagged attempts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!activeSession ? (
            <button
              onClick={() => setIsCreatingSession(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              Launch Attendance Session
            </button>
          ) : (
            <button
              onClick={handleEndSession}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm text-white shadow-lg shadow-rose-600/30 flex items-center gap-2 transition cursor-pointer"
            >
              <StopCircle className="w-4 h-4" />
              End Active Session
            </button>
          )}
        </div>
      </div>

      {/* PENDING VERIFICATION REVIEW QUEUE (Audit Requirement) */}
      {pendingReviewsList.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-amber-950 flex items-center gap-2">
                  Action Required: {pendingReviewsList.length} Attendance Verification(s) Awaiting Review
                </h2>
                <p className="text-xs text-amber-800">
                  Submissions flagged by system checks (such as unconfigured face profile or geofence deviation) require instructor manual review and a recorded audit reason before credit is granted.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-200 text-amber-900 font-bold text-xs rounded-full self-start sm:self-auto shrink-0">
              {pendingReviewsList.length} Flagged
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingReviewsList.map((rev) => (
              <div
                key={rev.id}
                className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm flex flex-col justify-between hover:border-amber-400 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-900 text-xs">{rev.studentName}</span>
                    <span className="text-[10px] font-mono text-slate-500">{rev.studentIdNumber}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 mb-2">
                    {rev.courseCode} • Session <strong className="font-mono text-indigo-700">{rev.sessionCode}</strong>
                  </div>
                  <div className="space-y-1 mb-3">
                    {rev.distanceMeters != null && (
                      <div className="text-[10px] text-slate-500">
                        Distance:{" "}
                        <strong className={rev.distanceMeters > 70 ? "text-rose-600 font-mono" : "text-slate-800 font-mono"}>
                          {rev.distanceMeters}m
                        </strong>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {rev.flaggedReasons?.map((flag: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRosterItem({
                      studentId: rev.studentId,
                      fullName: rev.studentName,
                      email: rev.studentEmail,
                      studentIdNumber: rev.studentIdNumber || "N/A",
                      department: "N/A",
                      section: "N/A",
                      status: rev.status as any,
                      recordId: rev.id,
                      timestamp: rev.timestamp,
                      locationStatus: rev.locationStatus as any,
                      faceStatus: rev.faceStatus as any,
                      distanceMeters: rev.distanceMeters,
                      faceSimilarity: rev.faceSimilarity,
                      flaggedReasons: rev.flaggedReasons,
                      verificationNotes: rev.verificationNotes,
                    });
                  }}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition text-center cursor-pointer shadow-sm"
                >
                  Review & Resolve Flag
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE SESSION COMMAND CENTER (When a session is live) */}
      {activeSession && (
        <div className="bg-white rounded-2xl border-2 border-indigo-500 shadow-xl overflow-hidden animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
              <div>
                <h2 className="text-lg font-bold">
                  LIVE SESSION: {activeSession.courseCode} — {activeSession.title}
                </h2>
                <p className="text-xs text-indigo-200">
                  {activeSession.classroomName} ({activeSession.classroomCode}) • Session Code:{" "}
                  <strong className="font-mono text-white text-sm">{activeSession.sessionCode}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="px-3 py-1 rounded-lg bg-white/10 border border-white/20">
                Rotation: <strong>{activeSession.qrRotationSeconds}s</strong>
              </div>
              <div className="px-3 py-1 rounded-lg bg-white/10 border border-white/20">
                Geofence: <strong>{activeSession.geofenceRadiusMeters || 60}m</strong>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Dynamic Rotating QR Projection Box */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <div className="mb-2 flex items-center justify-between w-full">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  Dynamic Attendance QR
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Direct Phone URL
                </span>
              </div>

              {/* Wi-Fi vs Localhost Selector */}
              {networkInfo && (
                <div className="mb-3 w-full p-2 bg-indigo-50/80 rounded-xl border border-indigo-200 text-left space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-indigo-950">
                    <span>Target Network Host:</span>
                    <span className="font-mono text-indigo-600">{selectedOrigin}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedOrigin(networkInfo.wifiUrl5173)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                        selectedOrigin === networkInfo.wifiUrl5173
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Wi-Fi Phone URL ({networkInfo.lanIp}:5173)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrigin(networkInfo.localhostUrl)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                        selectedOrigin === networkInfo.localhostUrl
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Laptop Only (localhost:5173)
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-2xl border-2 border-indigo-200 shadow-md">
                {qrChallenge ? (
                  <QRCodeSVG
                    value={qrChallenge.qrData || qrChallenge.qrUrl || ""}
                    size={240}
                    level="H"
                    includeMargin={true}
                  />
                ) : (
                  <div className="w-60 h-60 flex items-center justify-center text-slate-400 text-xs font-mono">
                    Generating rotating challenge...
                  </div>
                )}
              </div>

              {/* Encoded URL & Copy Button */}
              {qrChallenge?.qrUrl && (
                <div className="mt-3 w-full max-w-sm">
                  <div className="flex items-center gap-1.5 p-2 bg-white rounded-lg border border-slate-200 text-left">
                    <input
                      type="text"
                      readOnly
                      value={qrChallenge.qrUrl}
                      className="text-[10px] font-mono text-slate-600 bg-transparent flex-1 truncate outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(qrChallenge.qrUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded border border-indigo-200 shrink-0 cursor-pointer"
                    >
                      {copiedLink ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                </div>
              )}

              {/* Countdown / Token indicator */}
              <div className="mt-3 w-full max-w-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Anti-Proxy Token Expiration:</span>
                  <span className="font-bold text-indigo-600 font-mono">
                    {qrChallenge?.remainingSeconds ?? activeSession.qrRotationSeconds}s left
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-1000"
                    style={{
                      width: `${
                        (((qrChallenge?.remainingSeconds ?? activeSession.qrRotationSeconds) /
                          activeSession.qrRotationSeconds) *
                          100)
                      }%`,
                    }}
                  ></div>
                </div>
                <p className="text-[11px] text-slate-500">
                  📱 <strong>Phone Camera Ready:</strong> Scanning this QR code opens CampusVerify directly in your phone browser—no Google search! Ensure your phone is connected to the same Wi-Fi.
                </p>
              </div>
            </div>

            {/* Real-time Roster & Check-in Stream */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      Live Attendance Stream ({presentCount + lateCount} / {totalEnrolled} verified)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Auto-refreshes in real-time as students submit verification
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                      Present: {presentCount}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                      Late: {lateCount}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800">
                      Flagged: {pendingCount}
                    </span>
                  </div>
                </div>

                {/* Table of students */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Student</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Distance</th>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {roster.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No students enrolled in this course section.
                          </td>
                        </tr>
                      ) : (
                        roster.map((stu) => (
                          <tr key={stu.studentId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{stu.fullName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{stu.studentIdNumber}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={stu.status} size="sm" />
                            </td>
                            <td className="py-2.5 px-3">
                              {stu.distanceMeters != null ? (
                                <span
                                  className={`font-mono ${
                                    stu.distanceMeters > 70 ? "text-rose-600 font-bold" : "text-emerald-700"
                                  }`}
                                >
                                  {stu.distanceMeters}m
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                              {stu.timestamp ? new Date(stu.timestamp).toLocaleTimeString() : "Pending"}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {stu.status === "pending_review" && (
                                <button
                                  onClick={() => setSelectedRosterItem(stu)}
                                  className="px-2 py-0.5 rounded bg-orange-100 hover:bg-orange-200 text-orange-900 font-bold text-[10px] cursor-pointer"
                                >
                                  Review Flag
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Courses Assigned to Faculty */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your Assigned Courses</h2>
            <p className="text-xs text-slate-500">Courses currently registered under your instruction</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between hover:border-indigo-300 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-blue-100 text-blue-800">
                    {course.code}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{course.section} • {course.credits} Credits</span>
                </div>
                <h3 className="font-bold text-slate-900 text-base">{course.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{course.department}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-600 font-medium">Status: Active</span>
                {!activeSession && (
                  <button
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setIsCreatingSession(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Start Session <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past Attendance Sessions History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Attendance Session History</h2>
            <p className="text-xs text-slate-500">Concluded and active sessions for your courses</p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Session Code & Title</th>
                <th className="py-3 px-4">Course</th>
                <th className="py-3 px-4">Classroom</th>
                <th className="py-3 px-4">Start Time</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Parameters</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No sessions recorded yet.
                  </td>
                </tr>
              ) : (
                sessions.map((ses) => (
                  <tr key={ses.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">{ses.sessionCode}</div>
                      <div className="text-[11px] text-slate-500">{ses.title}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-indigo-900">{ses.courseCode}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {ses.classroomName} ({ses.classroomCode})
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      {new Date(ses.startTime).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={ses.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-500">
                      Rotate: {ses.qrRotationSeconds}s • Geofence: {ses.requireLocation ? "Yes" : "No"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleInspectSession(ses)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect Roster
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Launch Session Modal */}
      {isCreatingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Launch Attendance Session</h3>
                <p className="text-xs text-indigo-200">
                  Generates dynamic anti-proxy QR code with classroom geofencing
                </p>
              </div>
              <button
                onClick={() => setIsCreatingSession(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Course
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name} ({c.section})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Classroom / Geofence Location
                </label>
                <select
                  value={selectedClassroomId}
                  onChange={(e) => setSelectedClassroomId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                >
                  {classrooms.map((cr) => (
                    <option key={cr.id} value={cr.id}>
                      {cr.name} ({cr.code}) — {cr.building} [Radius: {cr.geofenceRadiusMeters}m]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    QR Rotation (Seconds)
                  </label>
                  <select
                    value={qrRotationSeconds}
                    onChange={(e) => setQrRotationSeconds(Number(e.target.value))}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  >
                    <option value={15}>15 Seconds (Standard)</option>
                    <option value={20}>20 Seconds (High Security)</option>
                    <option value={30}>30 Seconds (Relaxed)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={requireLocation}
                    onChange={(e) => setRequireLocation(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  Enforce Classroom Geofence Verification
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={requireFace}
                    onChange={(e) => setRequireFace(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  Require Face Verification (Simulated Embeddings Demo — Not Genuine Biometrics)
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition cursor-pointer"
              >
                {isSubmitting ? "Initiating Session..." : "Start Live Session Now"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Past Session Inspection Modal */}
      {inspectingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-300" />
                  Session Roster: {inspectingSession.courseCode} — {inspectingSession.title}
                </h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Session Code: <span className="font-mono font-bold text-white">{inspectingSession.sessionCode}</span> • Classroom: {inspectingSession.classroomName} • Status: {inspectingSession.status}
                </p>
              </div>
              <button
                onClick={() => setInspectingSession(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 border-b border-slate-200 pb-3">
                <div>
                  Enrolled Students: <strong>{inspectingRoster.length}</strong>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                    Present: {inspectingRoster.filter((r) => r.status === "present").length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    Late: {inspectingRoster.filter((r) => r.status === "late").length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold">
                    Flagged: {inspectingRoster.filter((r) => r.status === "pending_review").length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                    Rejected / Absent: {inspectingRoster.filter((r) => r.status === "rejected" || r.status === "absent").length}
                  </span>
                </div>
              </div>

              {isLoadingInspectingRoster ? (
                <div className="py-12 text-center text-slate-400 text-xs">Loading session roster...</div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Student</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Distance</th>
                        <th className="py-2.5 px-3">Flags / Verification</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {inspectingRoster.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No students enrolled or recorded for this session.
                          </td>
                        </tr>
                      ) : (
                        inspectingRoster.map((stu) => (
                          <tr key={stu.studentId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{stu.fullName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{stu.studentIdNumber}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={stu.status} size="sm" />
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {stu.distanceMeters != null ? (
                                <span className={stu.distanceMeters > 70 ? "text-rose-600 font-bold" : "text-emerald-700"}>
                                  {stu.distanceMeters}m
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {stu.flaggedReasons && stu.flaggedReasons.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {stu.flaggedReasons.map((f, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 bg-rose-50 text-rose-700 text-[10px] rounded font-medium border border-rose-200"
                                    >
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {stu.recordId ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRosterItem(stu)}
                                  className={`px-2 py-1 rounded font-bold text-[10px] cursor-pointer ${
                                    stu.status === "pending_review"
                                      ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  {stu.status === "pending_review" ? "Resolve Flag" : "Override"}
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[10px]">No record</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review / Manual Override Modal */}
      {selectedRosterItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Faculty Attendance Review & Audit Override</h3>
              </div>
              <button
                onClick={() => setSelectedRosterItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 text-sm">{selectedRosterItem.fullName}</strong>
                  <span className="text-slate-500 font-mono text-[11px] ml-2">({selectedRosterItem.studentIdNumber})</span>
                </div>
                <StatusBadge status={selectedRosterItem.status} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-500">Reported Distance:</span>{" "}
                  <strong>{selectedRosterItem.distanceMeters != null ? `${selectedRosterItem.distanceMeters}m` : "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Submission Time:</span>{" "}
                  <strong>{selectedRosterItem.timestamp ? new Date(selectedRosterItem.timestamp).toLocaleTimeString() : "N/A"}</strong>
                </div>
              </div>
              {selectedRosterItem.flaggedReasons && selectedRosterItem.flaggedReasons.length > 0 && (
                <div className="pt-1.5 border-t border-slate-200">
                  <span className="text-xs font-bold text-amber-900">Security Flags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedRosterItem.flaggedReasons.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned Attendance Status <span className="text-rose-600">*</span>
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as any)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="present">Present (Approved / Verified in Person)</option>
                  <option value="late">Late (Marked Late Attendance)</option>
                  <option value="rejected">Rejected (Unexcused Absence / Flag Upheld)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Faculty Override Justification <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Required for official audit trail</span>
                </div>

                {/* Quick justification chips */}
                <div className="mb-2 flex flex-wrap gap-1">
                  {[
                    "Visual in-person confirmation in lecture hall",
                    "Indoor GPS accuracy drift verified manually",
                    "Face unconfigured manual identity verification passed",
                    "Approved excused academic exception",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setOverrideReason(preset)}
                      className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 rounded text-[10px] font-medium transition cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="State the factual reason for approving or rejecting this student's attendance..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                {overrideReason.trim().length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    ⚠️ You must provide a justification note to complete the review.
                  </p>
                )}
              </div>

              {/* Audit trail guarantee notice */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl flex items-start gap-2 text-[11px] text-indigo-900">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Immutable Audit Trail:</strong> Your faculty user ID ({user?.fullName}), timestamp, and decision reason will be logged to <code className="bg-indigo-100 px-1 rounded">audit_logs</code>. Unauthorized users cannot alter records.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRosterItem(null)}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!overrideReason.trim() || isOverrideSubmitting}
                  onClick={handleManualOverride}
                  className={`w-2/3 py-2.5 font-bold text-xs rounded-xl transition cursor-pointer shadow-md ${
                    !overrideReason.trim() || isOverrideSubmitting
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30"
                  }`}
                >
                  {isOverrideSubmitting ? "Recording Audit..." : "Record Decision & Update Status"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
