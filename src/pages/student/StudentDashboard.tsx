import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { AttendanceRecord, AttendanceSession, Course } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { Html5Qrcode } from "html5-qrcode";
import {
  QrCode,
  MapPin,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Calendar,
  History,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Send,
  Sparkles,
  Info,
  X,
  ScanLine,
  Upload,
} from "lucide-react";

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [activeSessions, setActiveSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Verification Portal States
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [inputToken, setInputToken] = useState("");
  const [inputSessionCode, setInputSessionCode] = useState("");
  const [verifyingGps, setVerifyingGps] = useState(false);
  const [simulatedGps, setSimulatedGps] = useState<{
    lat: number;
    lng: number;
    acc: number;
    mode: string;
  } | null>(null);
  const [requireFaceCheck, setRequireFaceCheck] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Webcam access is not supported by your browser environment.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn("Camera access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please allow camera permissions in your browser or continue with demo simulation.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No webcam hardware detected on this device.");
      } else {
        setCameraError(`Camera error: ${err.message || "Failed to start camera"}`);
      }
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedPhoto(dataUrl);
      }
      stopCamera();
    } catch (err: any) {
      console.error("Failed to capture snapshot:", err);
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  useEffect(() => {
    if (!isVerifying) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isVerifying]);

  // Live In-App Camera QR Scanner States
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const qrScannerRef = React.useRef<Html5Qrcode | null>(null);

  const openQrScanner = () => {
    setIsScanningQr(true);
    setScannerError(null);
    setScanStatus(null);
  };

  const closeQrScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch (e) {
        console.warn("Error stopping QR scanner:", e);
      }
      qrScannerRef.current = null;
    }
    setIsScanningQr(false);
  };

  const handleQrDecoded = (decodedText: string) => {
    let sessionId: string | null = null;
    let token: string | null = null;
    let code: string | null = null;

    try {
      if (decodedText.startsWith("{")) {
        const parsed = JSON.parse(decodedText);
        sessionId = parsed.sessionId || parsed.session;
        token = parsed.token || parsed.challengeToken;
        code = parsed.code || parsed.sessionCode;
      }
    } catch {}

    if (!sessionId || !token) {
      try {
        if (decodedText.includes("?")) {
          const url = new URL(decodedText, window.location.origin);
          sessionId = url.searchParams.get("sessionId") || url.searchParams.get("session");
          token = url.searchParams.get("token");
          code = url.searchParams.get("code");
        } else if (decodedText.includes("=")) {
          const params = new URLSearchParams(decodedText);
          sessionId = params.get("sessionId") || params.get("session");
          token = params.get("token");
          code = params.get("code");
        }
      } catch {}
    }

    if (!sessionId || !token) {
      if (activeSessions.length > 0) {
        sessionId = activeSessions[0].id;
        token = decodedText.trim();
        code = activeSessions[0].sessionCode;
      } else {
        alert("Scanned QR code does not contain a recognized CampusVerify session URL or payload.");
        return;
      }
    }

    // Load session and open verification drawer
    api.sessions
      .get(sessionId)
      .then((res) => {
        if (res?.session) {
          setSelectedSession(res.session);
          setInputSessionCode(res.session.sessionCode || code || "");
          setInputToken(token || "");
          setTokenSource("scanned");
          setSubmissionResult(null);
          setSubmitError(null);
          setRequireFaceCheck(res.session.requireFace);

          if (res.session.latitude && res.session.longitude) {
            setSimulatedGps({
              lat: res.session.latitude,
              lng: res.session.longitude,
              acc: 5,
              mode: "Inside Classroom (Simulated 0m — Demo Preset)",
            });
          }
          setIsVerifying(true);
        }
      })
      .catch((err) => {
        alert("Failed to load session for scanned QR: " + err.message);
      });
  };

  const handleQrFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setScanStatus("Scanning QR image file...");
      const scanner = new Html5Qrcode("interactive-qr-reader");
      const decodedText = await scanner.scanFile(file, true);
      await closeQrScanner();
      handleQrDecoded(decodedText);
    } catch (err: any) {
      setScannerError("No QR code found in the uploaded image. Please try another image.");
      setScanStatus(null);
    }
  };

  useEffect(() => {
    if (!isScanningQr) return;
    let mounted = true;
    const scannerId = "interactive-qr-reader";

    const startScanner = async () => {
      await new Promise((r) => setTimeout(r, 150));
      if (!mounted) return;
      const element = document.getElementById(scannerId);
      if (!element) return;

      try {
        const scanner = new Html5Qrcode(scannerId);
        qrScannerRef.current = scanner;

        const onScanSuccess = async (decodedText: string) => {
          if (!mounted) return;
          setScanStatus("QR Code Detected! Opening session...");
          try {
            await scanner.stop();
            await scanner.clear();
          } catch {}
          qrScannerRef.current = null;
          setIsScanningQr(false);
          handleQrDecoded(decodedText);
        };

        const onScanFailure = () => {};

        try {
          await scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            onScanSuccess,
            onScanFailure
          );
        } catch {
          // Fallback to user facing camera
          await scanner.start(
            { facingMode: "user" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            onScanSuccess,
            onScanFailure
          );
        }
      } catch (err: any) {
        if (!mounted) return;
        console.warn("Camera QR scan error:", err);
        if (err.name === "NotAllowedError" || err.toString().includes("NotAllowedError") || err.toString().includes("Permission")) {
          setScannerError("Camera permission denied. Please allow camera permissions in your browser or upload an image of the QR code below.");
        } else if (err.name === "NotFoundError" || err.toString().includes("NotFound")) {
          setScannerError("No camera device found on this system. You can upload an image of the QR code below.");
        } else {
          setScannerError(err.message || "Unable to access camera. You can upload an image of the QR code below.");
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            qrScannerRef.current.stop().catch(() => {});
          }
          qrScannerRef.current.clear();
        } catch {}
        qrScannerRef.current = null;
      }
    };
  }, [isScanningQr]);

  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenSource, setTokenSource] = useState<"scanned" | "autofill" | "manual" | "none">("none");
  const [fetchingChallenge, setFetchingChallenge] = useState(false);
  const [tokenRemainingSec, setTokenRemainingSec] = useState<number | null>(null);

  // Correction Request Modal
  const [correctionRecord, setCorrectionRecord] = useState<AttendanceRecord | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionProof, setCorrectionProof] = useState("");
  const [correctionSuccess, setCorrectionSuccess] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, recRes, sesRes] = await Promise.all([
        api.attendance.mySummary(),
        api.attendance.myRecords(),
        api.sessions.list(),
      ]);
      setSummary(sumRes);
      setRecords(recRes.records);
      setActiveSessions(sesRes.sessions.filter((s) => s.status === "active"));
    } catch (err) {
      console.error("Failed to load student data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-trigger verification if opened from a scanned QR URL or stored scan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get("sessionId") || params.get("session");
    let token = params.get("token");
    let code = params.get("code");

    if (!sessionId) {
      const stored = sessionStorage.getItem("scanned_attendance_qr");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          sessionId = parsed.sessionId || parsed.session;
          token = token || parsed.token;
          code = code || parsed.code;
        } catch {}
      }
    }

    if (sessionId) {
      // Clear from storage and clean URL query so refresh doesn't trap
      sessionStorage.removeItem("scanned_attendance_qr");
      if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Fetch session details from server
      api.sessions
        .get(sessionId)
        .then((res) => {
          if (res?.session) {
            setSelectedSession(res.session);
            setInputSessionCode(res.session.sessionCode || code || "");
            setInputToken(token || "");
            setTokenSource(token ? "scanned" : "none");
            setSubmissionResult(null);
            setSubmitError(null);
            setRequireFaceCheck(res.session.requireFace);

            if (!token) {
              api.sessions
                .getActiveChallenge(sessionId!)
                .then((cRes) => {
                  if (cRes?.challengeToken) {
                    setInputToken(cRes.challengeToken);
                    setTokenSource("autofill");
                    setTokenRemainingSec(cRes.remainingSeconds);
                  }
                })
                .catch(() => {});
            }

            if (res.session.latitude && res.session.longitude) {
              setSimulatedGps({
                lat: res.session.latitude,
                lng: res.session.longitude,
                acc: 5,
                mode: "Inside Classroom (Simulated 0m — Demo Preset)",
              });
            }
            setIsVerifying(true);
          }
        })
        .catch((err) => {
          console.error("Failed to load scanned session:", err);
        });
    }
  }, []);

  // Handle starting verification for a session
  const startVerification = (session: AttendanceSession) => {
    setSelectedSession(session);
    setInputSessionCode(session.sessionCode);
    setInputToken("");
    setTokenSource("none");
    setTokenRemainingSec(null);
    setSubmissionResult(null);
    setSubmitError(null);
    setRequireFaceCheck(session.requireFace);

    // Pre-fetch active rotating challenge token so testing is immediately ready
    api.sessions
      .getActiveChallenge(session.id)
      .then((res) => {
        if (res?.challengeToken) {
          setInputToken(res.challengeToken);
          setTokenSource("autofill");
          setTokenRemainingSec(res.remainingSeconds);
        }
      })
      .catch(() => {});

    // Default to in-classroom simulated demo preset
    if (session.latitude && session.longitude) {
      setSimulatedGps({
        lat: session.latitude,
        lng: session.longitude,
        acc: 5,
        mode: "Inside Classroom (Simulated 0m — Demo Preset)",
      });
    } else {
      setSimulatedGps({
        lat: 12.971598,
        lng: 77.594562,
        acc: 5,
        mode: "Default Campus Location (Simulated Preset)",
      });
    }

    setIsVerifying(true);
  };

  // Explicitly pull active rotating demo challenge token
  const handleAutofillChallenge = async () => {
    if (!selectedSession) return;
    setFetchingChallenge(true);
    setSubmitError(null);
    try {
      const res = await api.sessions.getActiveChallenge(selectedSession.id);
      if (res?.challengeToken) {
        setInputToken(res.challengeToken);
        setTokenSource("autofill");
        setTokenRemainingSec(res.remainingSeconds);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to fetch active demo challenge.");
    } finally {
      setFetchingChallenge(false);
    }
  };

  // Get real browser GPS
  const handleUseRealGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setVerifyingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSimulatedGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
          mode: "Live Browser GPS",
        });
        setVerifyingGps(false);
      },
      (err) => {
        alert("GPS Error: " + err.message);
        setVerifyingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Handle Quick Submission
  const handleSubmitAttendance = async () => {
    if (!selectedSession) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let challengeToken = inputToken.trim();
      if (!challengeToken) {
        // Attempt to auto-fetch active challenge
        try {
          const res = await api.sessions.getActiveChallenge(selectedSession.id);
          if (res?.challengeToken) {
            challengeToken = res.challengeToken;
            setInputToken(challengeToken);
            setTokenSource("autofill");
          }
        } catch (e: any) {
          setSubmitError(
            e.message ||
              "Missing QR challenge token. Please scan the live QR code or click 'Autofill Active Demo Token'."
          );
          setIsSubmitting(false);
          return;
        }
      }

      if (!challengeToken) {
        setSubmitError(
          "Missing QR challenge token. Please scan the live dynamic QR code on screen or click 'Autofill Active Demo Token'."
        );
        setIsSubmitting(false);
        return;
      }

      const payload: any = {
        sessionId: selectedSession.id,
        sessionCode: selectedSession.sessionCode,
        challengeToken,
        location: simulatedGps
          ? {
              latitude: simulatedGps.lat,
              longitude: simulatedGps.lng,
              accuracy: simulatedGps.acc,
            }
          : undefined,
        face: requireFaceCheck
          ? {
              descriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
            }
          : undefined,
        deviceFingerprint: navigator.userAgent.substring(0, 50),
      };

      const res = await api.attendance.submit(payload);
      setSubmissionResult(res);
      await loadData();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit attendance.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle correction filing
  const handleFileCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionRecord || !correctionReason) return;
    try {
      await api.attendance.submitCorrection({
        attendanceRecordId: correctionRecord.id,
        reason: correctionReason,
        proofNotes: correctionProof,
      });
      setCorrectionSuccess(true);
      setTimeout(() => {
        setCorrectionSuccess(false);
        setCorrectionRecord(null);
        setCorrectionReason("");
        setCorrectionProof("");
        loadData();
      }, 1500);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const studentProfile = user?.profile as any;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Student Portal
            </span>
            <span className="text-xs text-indigo-200">
              ID: {studentProfile?.studentIdNumber || "STU-2024-001"} • {studentProfile?.department || "Computer Science"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName}
          </h1>
          <p className="text-sm text-indigo-200/80 mt-1">
            Track class attendance compliance, participate in live dynamic sessions, and view verified records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openQrScanner}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-indigo-500/25 transition cursor-pointer flex items-center gap-1.5"
          >
            <ScanLine className="w-4 h-4" />
            Scan Attendance QR
          </button>

          {activeSessions.length > 0 && (
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  {activeSessions.length} Active Session{activeSessions.length > 1 ? "s" : ""} Live
                </p>
                <p className="text-xs text-white/90 font-medium">
                  {activeSessions[0].courseCode} — {activeSessions[0].classroomName}
                </p>
              </div>
              <button
                onClick={() => startVerification(activeSessions[0])}
                className="ml-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-lg shadow transition cursor-pointer"
              >
                Verify Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Attendance</p>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {summary?.overall?.percentage ?? 100}%
            </span>
            <span className="text-xs font-medium text-slate-500">
              {summary?.overall?.present ?? 0} of {summary?.overall?.totalSessions ?? 0} sessions
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className={`h-2 rounded-full ${
                (summary?.overall?.percentage ?? 100) >= 75 ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${Math.min(100, summary?.overall?.percentage ?? 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Present Count</p>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {summary?.overall?.present ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Verified on-time check-ins</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Late Arrivals</p>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {summary?.overall?.late ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Arrived past session threshold</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flagged / Review</p>
            <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {summary?.overall?.pendingReview ?? 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Geofence or simulated face review</p>
        </div>
      </div>

      {/* Live Active Attendance Sessions */}
      {activeSessions.length > 0 && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-lg font-bold text-slate-900">Live Attendance Session in Progress</h2>
            </div>
            <span className="text-xs font-medium text-slate-600">Action Required</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800">
                      {session.courseCode}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      Code: {session.sessionCode}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{session.courseName}</h3>
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    {session.classroomName} ({session.classroomCode})
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    {session.requireLocation && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                        Geofence ({session.geofenceRadiusMeters || 50}m)
                      </span>
                    )}
                    {session.requireFace && (
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                        Face Match (Simulated)
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                      QR Rotate ({session.qrRotationSeconds}s)
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => startVerification(session)}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Verify Attendance
                  </button>
                  <button
                    type="button"
                    onClick={openQrScanner}
                    className="py-2.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Scan live dynamic QR code with camera"
                  >
                    <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
                    Scan QR
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Course-by-Course Attendance Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          Enrolled Courses Attendance Breakdown
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary?.courses?.map((course: any) => {
            const isGood = course.percentage >= 75;
            return (
              <div
                key={course.courseId}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-indigo-900 text-sm">{course.courseCode}</span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-full ${
                        isGood
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {course.percentage}% Attendance
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{course.courseName}</h3>
                </div>

                <div className="mt-4">
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mb-2">
                    <div
                      className={`h-2 rounded-full ${isGood ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, course.percentage)}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Present: {course.presentCount}</span>
                    <span>Late: {course.lateCount}</span>
                    <span>Review: {course.pendingCount}</span>
                    <span>Total Sessions: {course.totalSessions}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Verified Attendance Records
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable audit trail generated by the multi-layer verification engine
            </p>
          </div>
          <button
            onClick={loadData}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Records
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Course & Session</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Geofence Distance</th>
                <th className="py-3 px-4">Verification Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No attendance records found yet.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{rec.courseCode}</div>
                      <div className="text-[11px] text-slate-500">{rec.sessionTitle || rec.sessionCode}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      {new Date(rec.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={rec.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4">
                      {rec.distanceMeters != null ? (
                        <span
                          className={`font-mono text-xs ${
                            rec.distanceMeters > 80 ? "text-rose-600 font-bold" : "text-emerald-700 font-medium"
                          }`}
                        >
                          {rec.distanceMeters}m
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">N/A</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate text-[11px] text-slate-600">
                      {rec.verificationNotes || "Verified by multi-layer engine"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {rec.status === "pending_review" && (
                        <button
                          onClick={() => setCorrectionRecord(rec)}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition cursor-pointer"
                        >
                          Contest / Appeal
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

      {/* Multi-Layer Verification Modal / Drawer */}
      {isVerifying && selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 p-5 text-white flex items-center justify-between">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/20 uppercase tracking-wider">
                  Live Attendance Check
                </span>
                <h3 className="text-lg font-bold mt-1">{selectedSession.courseCode} — {selectedSession.title}</h3>
                <p className="text-xs text-indigo-200">
                  {selectedSession.classroomName} • Geofence Radius: {selectedSession.geofenceRadiusMeters || 60}m
                </p>
              </div>
              <button
                onClick={() => setIsVerifying(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Submission Blocked: </span>
                    {submitError}
                  </div>
                </div>
              )}

              {/* Result Card if Submitted */}
              {submissionResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    submissionResult.status === "present"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : submissionResult.status === "late"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-orange-50 border-orange-200 text-orange-900"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 font-bold text-sm">
                    {submissionResult.status === "present" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    {submissionResult.status === "late" && <Clock className="w-5 h-5 text-amber-600" />}
                    {submissionResult.status === "pending_review" && <AlertTriangle className="w-5 h-5 text-orange-600" />}
                    Attendance Decision: {submissionResult.status.toUpperCase()}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <p>
                      <strong>QR Challenge:</strong> {submissionResult.summary.qrValid ? "Valid (Authenticated)" : "Failed"}
                    </p>
                    <p>
                      <strong>Geofence Location:</strong> {submissionResult.summary.locationStatus} (Distance: {submissionResult.summary.distanceMeters ?? "N/A"}m) {simulatedGps?.mode?.includes("Real") ? "— [Live Device GPS]" : "— [Simulated Demo Preset]"}
                    </p>
                    <p>
                      <strong>Biometric Check:</strong> {submissionResult.summary.faceStatus} (Simulated Demo)
                    </p>
                    {submissionResult.summary.flaggedReasons?.length > 0 && (
                      <p className="text-orange-700 font-semibold">
                        Flagged Reasons: {submissionResult.summary.flaggedReasons.join(", ")}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setIsVerifying(false)}
                    className="mt-3 w-full py-2 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              )}

              {!submissionResult && (
                <>
                  {/* Step 1: Dynamic QR Code Input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Layer 1: Dynamic QR Challenge Token
                      </label>
                      {inputToken && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {tokenSource === "scanned"
                            ? "QR Scanned"
                            : tokenSource === "autofill"
                            ? "Active Token Attached"
                            : "Manual Token"}
                        </span>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputToken}
                          onChange={(e) => {
                            setInputToken(e.target.value);
                            setTokenSource(e.target.value ? "manual" : "none");
                          }}
                          placeholder="Paste or scan QR token, or click Autofill"
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 font-mono"
                        />
                        <button
                          type="button"
                          onClick={openQrScanner}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                          title="Point device camera at classroom screen"
                        >
                          <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
                          Scan QR
                        </button>
                        <button
                          type="button"
                          onClick={handleAutofillChallenge}
                          disabled={fetchingChallenge}
                          className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer disabled:opacity-50"
                          title="Pull live challenge token from active session for local testing"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          {fetchingChallenge ? "Fetching..." : "Autofill Token"}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {tokenSource === "scanned"
                            ? "✓ Token loaded from scanned QR code deep-link URL."
                            : tokenSource === "autofill"
                            ? `✓ Active dynamic challenge attached${tokenRemainingSec ? ` (valid for ~${tokenRemainingSec}s)` : ""}.`
                            : "* In classrooms, scan the dynamic QR on screen. For local demo testing, click Autofill above."}
                        </span>
                        {inputToken && (
                          <button
                            type="button"
                            onClick={() => {
                              setInputToken("");
                              setTokenSource("none");
                            }}
                            className="text-[10px] text-rose-600 hover:underline font-semibold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Geofence Verification Simulation / Live GPS */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Layer 2: Classroom Geofence Coordinates
                    </label>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Selected Location Mode:</span>
                        <span className="font-bold text-indigo-700 font-mono text-[11px]">
                          {simulatedGps?.mode || "Not Selected"}
                        </span>
                      </div>

                      {/* Simulation Controls for Judges/Testers */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSimulatedGps({
                              lat: selectedSession.latitude || 12.971598,
                              lng: selectedSession.longitude || 77.594562,
                              acc: 5,
                              mode: "Inside Classroom (Simulated 0m — Demo Preset)",
                            })
                          }
                          className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                            simulatedGps?.mode?.includes("Inside")
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>Inside Classroom</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
                              Simulated
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Preset: Dist 0m (Passes)</div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSimulatedGps({
                              lat: (selectedSession.latitude || 12.971598) + 0.05,
                              lng: (selectedSession.longitude || 77.594562) + 0.05,
                              acc: 20,
                              mode: "Outside Geofence (Simulated 5.4km — Demo Preset)",
                            })
                          }
                          className={`p-2.5 rounded-lg border text-left text-xs transition cursor-pointer ${
                            simulatedGps?.mode?.includes("Outside")
                              ? "bg-rose-50 border-rose-300 text-rose-900 font-bold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>Outside Geofence</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold uppercase tracking-wider">
                              Simulated
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Preset: Dist 5.4km (Flags test)</div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleUseRealGps}
                        disabled={verifyingGps}
                        className={`w-full py-2 px-3 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                          simulatedGps?.mode?.includes("Real")
                            ? "bg-blue-50 border-blue-300 text-blue-900 font-bold"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                        {verifyingGps ? "Acquiring Real Device Geolocation..." : "Query Real Device Geolocation (GPS)"}
                      </button>

                      {/* Transparency Notice on Geolocation Limitations */}
                      <div className="p-2.5 rounded-lg bg-slate-100 text-[11px] text-slate-600 space-y-1 border border-slate-200/80">
                        <p className="font-bold text-slate-700">Transparency Notice:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-[10.5px]">
                          <li>
                            <strong>Simulated Demo Presets:</strong> Injects synthetic coordinates to test pass/flag workflows without requiring physical presence on campus.
                          </li>
                          <li>
                            <strong>Real Device GPS:</strong> Obtains coordinates via browser <code>navigator.geolocation</code>. Note: Browser location can be inaccurate indoors due to poor GPS signal and can be spoofed via client developer tools or mock-location software.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Camera Capture & Verification */}
                  {requireFaceCheck && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Layer 3: Camera Verification (Live Browser Snapshot)
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                          Live Webcam Preview
                        </span>
                      </div>

                      {/* Explicit Transparency Notice */}
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-[11px] leading-relaxed">
                            <strong>Notice:</strong> This captures a demo snapshot photo. <em>Genuine biometric facial recognition matching is NOT configured.</em> This image is clearly labeled as a captured demo snapshot for visual audit records.
                          </p>
                        </div>
                      </div>

                      {/* Camera Viewport / Captured Photo Preview */}
                      <div className="rounded-xl border border-slate-200 bg-slate-900 overflow-hidden relative min-h-[220px] flex flex-col items-center justify-center text-white">
                        {capturedPhoto ? (
                          <div className="relative w-full flex flex-col items-center p-3 bg-slate-950">
                            <img
                              src={capturedPhoto}
                              alt="Captured verification photo"
                              className="max-h-56 rounded-lg object-contain border border-slate-700 shadow-md"
                            />
                            <div className="mt-2.5 flex items-center justify-between w-full px-2">
                              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                📷 Photo Snapshot Captured
                              </span>
                              <button
                                type="button"
                                onClick={retakePhoto}
                                className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" /> Retake Photo
                              </button>
                            </div>
                            <p className="text-[10px] text-amber-300/90 mt-1.5 font-medium text-center">
                              Captured photo for demo snapshot (NOT genuine facial identity verification).
                            </p>
                          </div>
                        ) : cameraActive ? (
                          <div className="relative w-full flex flex-col items-center bg-black">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full max-h-56 object-cover"
                            />
                            {/* Framing Overlay */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                              <div className="w-40 h-44 border-2 border-dashed border-indigo-400/70 rounded-2xl"></div>
                            </div>
                            <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-2 px-3">
                              <button
                                type="button"
                                onClick={capturePhoto}
                                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition cursor-pointer flex items-center gap-1.5"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                Capture Photo Snapshot
                              </button>
                              <button
                                type="button"
                                onClick={stopCamera}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                              >
                                Stop Camera
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-6 text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-indigo-400">
                              <Camera className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-200">Live Browser Camera Preview</p>
                              <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-0.5">
                                Connect webcam via <code>getUserMedia</code> to capture a photo snapshot for attendance verification.
                              </p>
                            </div>
                            {cameraError && (
                              <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-[11px] text-rose-300">
                                {cameraError}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={startCamera}
                              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow transition cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              Enable Live Camera Preview
                            </button>
                          </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={handleSubmitAttendance}
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-indigo-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? "Running Decision Engine..." : "Submit Attendance Verification"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Correction Appeal Modal */}
      {correctionRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Contest Flagged Attendance</h3>
              <button
                onClick={() => setCorrectionRecord(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {correctionSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
                Correction request submitted to faculty!
              </div>
            ) : (
              <form onSubmit={handleFileCorrection} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Record for <strong>{correctionRecord.courseCode}</strong> was flagged as{" "}
                  <span className="font-bold text-orange-700">{correctionRecord.status}</span>.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reason for Exception / Appeal
                  </label>
                  <textarea
                    rows={3}
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    required
                    placeholder="E.g., GPS drift inside concrete basement lecture hall, was present in row 4."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Proof / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={correctionProof}
                    onChange={(e) => setCorrectionProof(e.target.value)}
                    placeholder="Notes or faculty witness acknowledgment"
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition"
                >
                  Submit Appeal to Faculty
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Live In-App Camera QR Scanner Modal */}
      {isScanningQr && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-bold">Classroom QR Scanner</h3>
              </div>
              <button
                type="button"
                onClick={closeQrScanner}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scanner Viewport */}
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-800">
                  Point device camera at the rotating QR code projected on the classroom screen.
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Reads real-time dynamic challenge token & validates anti-proxy security.
                </p>
              </div>

              {/* Viewfinder Target Container */}
              <div className="relative w-full aspect-square max-w-[280px] mx-auto rounded-2xl overflow-hidden bg-slate-950 border-2 border-indigo-500 shadow-inner flex items-center justify-center">
                <div id="interactive-qr-reader" className="w-full h-full" />

                {scanStatus && (
                  <div className="absolute inset-0 bg-indigo-900/90 text-white flex flex-col items-center justify-center p-4 text-center z-10">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce mb-2" />
                    <p className="text-xs font-bold">{scanStatus}</p>
                  </div>
                )}
              </div>

              {scannerError && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-relaxed">{scannerError}</p>
                  </div>
                </div>
              )}

              {/* Fallback image upload for laptops/desktops without back cameras */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[11px]">Testing on laptop / no camera?</span>
                <label className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition cursor-pointer flex items-center gap-1.5 border border-indigo-200">
                  <Upload className="w-3.5 h-3.5" />
                  Upload QR Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileScan}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
