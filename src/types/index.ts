export type UserRole = "student" | "faculty" | "admin";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  profile?: StudentProfile | FacultyProfile | null;
}

export interface StudentProfile {
  userId: string;
  studentIdNumber: string;
  department: string;
  section: string;
  academicYear: string;
  biometricConsent: boolean;
  biometricConsentDate?: string | null;
  referenceFacePath?: string | null;
}

export interface FacultyProfile {
  userId: string;
  employeeId: string;
  department: string;
  officeLocation?: string | null;
  phone?: string | null;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  department: string;
  section: string;
  credits: number;
  facultyId: string;
  facultyName?: string;
  facultyEmail?: string;
  isActive: boolean;
  studentCount?: number;
}

export interface Classroom {
  id: string;
  code: string;
  name: string;
  building: string;
  floor: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  isActive: boolean;
  createdAt: string;
}

export interface AttendanceSession {
  id: string;
  courseId: string;
  courseCode?: string;
  courseName?: string;
  classroomId: string;
  classroomName?: string;
  classroomCode?: string;
  classroomBuilding?: string;
  classroomFloor?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  sessionCode: string;
  title: string;
  startTime: string;
  endTime: string;
  status: "active" | "completed" | "cancelled";
  durationMinutes: number;
  qrRotationSeconds: number;
  requireLocation: boolean;
  requireFace: boolean;
  lateThresholdMinutes: number;
}

export interface QrChallenge {
  sessionId: string;
  sessionCode: string;
  challengeToken: string;
  qrData: string;
  remainingSeconds: number;
  rotationIntervalSeconds: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  studentIdNumber?: string;
  timestamp: string;
  status: "present" | "late" | "pending_review" | "rejected" | "absent";
  locationStatus: "verified" | "out_of_bounds" | "permission_denied" | "skipped" | "manual_review";
  faceStatus: "verified" | "mismatch" | "unconfigured" | "skipped" | "manual_review";
  distanceMeters?: number | null;
  accuracyMeters?: number | null;
  faceSimilarity?: number | null;
  verificationNotes?: string | null;
  flaggedReasons?: string[] | null;
  sessionCode?: string;
  sessionTitle?: string;
  sessionDate?: string;
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  correctedBy?: string | null;
  correctionReason?: string | null;
  correctedAt?: string | null;
}

export interface RosterStudent {
  studentId: string;
  fullName: string;
  email: string;
  studentIdNumber: string;
  department: string;
  section: string;
  status: "present" | "late" | "pending_review" | "rejected" | "absent" | "not_marked";
  recordId: string | null;
  timestamp: string | null;
  locationStatus: string | null;
  faceStatus: string | null;
  distanceMeters: number | null;
  faceSimilarity: number | null;
  flaggedReasons: string[];
  verificationNotes: string | null;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorRole: string;
  actorName: string;
  action: string;
  targetResource: string;
  targetId: string | null;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface DemoAccount {
  role: UserRole;
  roleLabel: string;
  email: string;
  password: string;
  name: string;
  description: string;
}
