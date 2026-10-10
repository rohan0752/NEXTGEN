import {
  User,
  Course,
  Classroom,
  AttendanceSession,
  QrChallenge,
  AttendanceRecord,
  RosterStudent,
  AuditLog,
  DemoAccount,
} from "../types";

const API_BASE = "/api";

function getToken(): string | null {
  const token = localStorage.getItem("campusverify_token");
  if (!token || token === "undefined" || token === "null" || token.trim() === "") {
    return null;
  }
  return token;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({ error: "Failed to parse JSON response" }));

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Auth
  auth: {
    getDemoAccounts: () => request<{ accounts: DemoAccount[] }>("/auth/demo-accounts"),
    login: (email: string, password: string) =>
      request<{ success: boolean; token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: (data: { fullName: string; email: string; password: string; role?: string }) =>
      request<{ success: boolean; token: string; user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => request<{ user: User }>("/auth/me"),
    logout: () =>
      request<{ success: boolean }>("/auth/logout", {
        method: "POST",
      }),
  },

  // Courses
  courses: {
    list: () => request<{ courses: Course[] }>("/courses"),
    get: (id: string) => request<{ course: Course }>("/courses/" + id),
    create: (data: Partial<Course>) =>
      request<{ success: boolean; id: string }>("/courses", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // Classrooms
  classrooms: {
    list: () => request<{ classrooms: Classroom[] }>("/classrooms"),
    create: (data: Partial<Classroom>) =>
      request<{ success: boolean; id: string }>("/classrooms", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Classroom>) =>
      request<{ success: boolean }>("/classrooms/" + id, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  // Sessions
  sessions: {
    list: () => request<{ sessions: AttendanceSession[] }>("/sessions"),
    get: (id: string) =>
      request<{
        session: AttendanceSession;
        counts: {
          totalEnrolled: number;
          present: number;
          late: number;
          pendingReview: number;
          rejected: number;
        };
        recordsCount: number;
      }>("/sessions/" + id),
    create: (data: {
      courseId: string;
      classroomId: string;
      title?: string;
      durationMinutes?: number;
      qrRotationSeconds?: number;
      requireLocation?: boolean;
      requireFace?: boolean;
      lateThresholdMinutes?: number;
    }) =>
      request<{ success: boolean; sessionId: string; sessionCode: string }>("/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getNetworkInfo: () =>
      request<{
        lanIp: string;
        currentOrigin: string;
        wifiUrl5173: string;
        wifiUrl5000: string;
        localhostUrl: string;
      }>("/sessions/network-info"),
    getQr: (sessionId: string, origin?: string) =>
      request<QrChallenge & { qrUrl?: string; lanIp?: string }>(
        "/sessions/" + sessionId + "/qr" + (origin ? "?origin=" + encodeURIComponent(origin) : "")
      ),
    getActiveChallenge: (sessionId: string) =>
      request<{
        success: boolean;
        sessionId: string;
        sessionCode: string;
        challengeToken: string;
        qrData: string;
        remainingSeconds: number;
        rotationIntervalSeconds: number;
        expiresAt: string;
      }>("/sessions/" + sessionId + "/active-challenge"),
    end: (sessionId: string) =>
      request<{ success: boolean }>("/sessions/" + sessionId + "/end", {
        method: "POST",
      }),
    getRoster: (sessionId: string) =>
      request<{ roster: RosterStudent[] }>("/sessions/" + sessionId + "/roster"),
  },

  // Attendance
  attendance: {
    submit: (payload: {
      sessionId?: string;
      sessionCode?: string;
      challengeToken?: string;
      location?: { latitude: number; longitude: number; accuracy: number };
      face?: { descriptor?: number[]; error?: string };
      deviceFingerprint?: string;
    }) =>
      request<{
        success: boolean;
        status: "present" | "late" | "pending_review" | "rejected";
        record: AttendanceRecord;
        summary: {
          qrValid: boolean;
          locationStatus: string;
          distanceMeters: number | null;
          faceStatus: string;
          faceSimilarity: number | null;
          flaggedReasons: string[];
          isLate: boolean;
        };
      }>("/attendance/submit", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    myRecords: () => request<{ records: AttendanceRecord[] }>("/attendance/my-records"),
    mySummary: () =>
      request<{
        overall: {
          totalSessions: number;
          present: number;
          late: number;
          pendingReview: number;
          percentage: number;
        };
        courses: Array<{
          courseId: string;
          courseCode: string;
          courseName: string;
          totalSessions: number;
          presentCount: number;
          lateCount: number;
          pendingCount: number;
          absentCount: number;
          percentage: number;
        }>;
      }>("/attendance/my-summary"),
    submitCorrection: (data: { attendanceRecordId: string; reason: string; proofNotes?: string }) =>
      request<{ success: boolean; requestId: string }>("/attendance/correction-request", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    manualOverride: (data: {
      recordId: string;
      newStatus: "present" | "late" | "rejected";
      reason: string;
    }) =>
      request<{ success: boolean; record: AttendanceRecord }>("/attendance/manual-override", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    pendingReviews: () =>
      request<{
        reviews: Array<{
          id: string;
          sessionId: string;
          studentId: string;
          studentName: string;
          studentEmail: string;
          studentIdNumber: string;
          sessionCode: string;
          sessionTitle: string;
          courseCode: string;
          courseName: string;
          timestamp: string;
          status: string;
          locationStatus: string;
          faceStatus: string;
          distanceMeters: number | null;
          faceSimilarity: number | null;
          verificationNotes: string | null;
          flaggedReasons: string[];
          deviceFingerprint: string | null;
        }>;
      }>("/attendance/pending-reviews"),
    sessionRecords: (sessionId: string) =>
      request<{ records: AttendanceRecord[] }>("/attendance/session/" + sessionId),
  },

  // Admin
  admin: {
    getStats: () =>
      request<{
        metrics: {
          totalStudents: number;
          totalFaculty: number;
          totalCourses: number;
          activeSessions: number;
          totalRecords: number;
          present: number;
          late: number;
          pendingReview: number;
          rejected: number;
        };
        recentLogs: AuditLog[];
      }>("/admin/stats"),
    getAuditLogs: () => request<{ logs: AuditLog[] }>("/admin/audit-logs"),
    getUsers: () => request<{ users: User[] }>("/admin/users"),
  },

  // Reports
  reports: {
    getSummary: () =>
      request<{
        totalRecords: number;
        statusBreakdown: { present: number; late: number; pending_review: number; rejected: number };
        reasonBreakdown: Record<string, number>;
        courseBreakdown: Record<string, { code: string; name: string; present: number; total: number }>;
      }>("/reports/summary"),
  },

  // Face
  face: {
    getStatus: () =>
      request<{
        biometricConsent: boolean;
        biometricConsentDate: string | null;
        hasReferencePhoto: boolean;
        hasEmbedding: boolean;
      }>("/face/status"),
    updateConsent: (consent: boolean) =>
      request<{ success: boolean; biometricConsent: boolean }>("/face/consent", {
        method: "POST",
        body: JSON.stringify({ consent }),
      }),
  },
};
