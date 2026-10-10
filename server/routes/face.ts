import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db/index.js";
import { studentProfiles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";

const router = Router();

// Ensure upload folder exists
const uploadDir = path.resolve(process.cwd(), "uploads", "reference_faces");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for secure reference photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const filename = `ref_${req.user!.id}_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Only standard image formats (JPEG, PNG, WebP) are allowed."));
    }
  },
});

// Update Biometric Consent (Student)
router.post("/consent", authenticateToken, requireRole(["student"]), async (req, res) => {
  try {
    const { consent } = req.body;

    const profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, req.user!.id)).get();
    if (!profile) {
      return res.status(404).json({ error: "Student profile not found." });
    }

    const now = new Date().toISOString();
    await db
      .update(studentProfiles)
      .set({
        biometricConsent: Boolean(consent),
        biometricConsentDate: consent ? now : null,
      })
      .where(eq(studentProfiles.userId, req.user!.id))
      .run();

    await logAudit(
      req.user!,
      "BIOMETRIC_CONSENT_CHANGE",
      "StudentProfile",
      req.user!.id,
      `Student set biometric consent to ${Boolean(consent)}.`,
      req
    );

    res.json({
      success: true,
      biometricConsent: Boolean(consent),
      message: consent
        ? "Biometric consent recorded. You may now enroll your reference face."
        : "Biometric consent revoked. Face matching will be bypassed and routed to manual review.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update biometric consent." });
  }
});

// Check Biometric Enrollment Status
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const targetUserId = (req.query.studentId as string) || req.user!.id;

    // Only student themselves or faculty/admin can view status
    if (req.user!.role === "student" && targetUserId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden: You cannot inspect other students' biometric status." });
    }

    const profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, targetUserId)).get();
    if (!profile) {
      return res.status(404).json({ error: "Student profile not found." });
    }

    res.json({
      hasConsent: Boolean(profile.biometricConsent),
      consentDate: profile.biometricConsentDate,
      isEnrolled: Boolean(profile.faceEmbedding && profile.faceEmbedding.length > 10),
      hasReferencePhoto: Boolean(profile.referenceFacePath),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch biometric status." });
  }
});

// Enroll reference face embedding & optional photo (Student or Admin)
router.post("/enroll", authenticateToken, upload.single("referenceImage"), async (req, res) => {
  try {
    const targetUserId = req.body.studentId && req.user!.role === "admin" ? req.body.studentId : req.user!.id;

    const profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, targetUserId)).get();
    if (!profile) {
      return res.status(404).json({ error: "Student profile not found." });
    }

    if (!profile.biometricConsent && req.user!.role !== "admin") {
      return res.status(400).json({
        error: "Biometric consent is required before enrolling facial templates. Please grant consent in profile.",
      });
    }

    let embeddingJson: string | null = null;
    if (req.body.descriptor) {
      try {
        const parsed = typeof req.body.descriptor === "string" ? JSON.parse(req.body.descriptor) : req.body.descriptor;
        if (Array.isArray(parsed) && parsed.length > 50) {
          embeddingJson = JSON.stringify(parsed);
        }
      } catch (err) {
        return res.status(400).json({ error: "Invalid facial embedding vector format." });
      }
    }

    const imagePath = req.file ? `/uploads/reference_faces/${req.file.filename}` : profile.referenceFacePath;

    if (!embeddingJson && !imagePath) {
      return res.status(400).json({ error: "Either a facial embedding vector or reference photo must be provided." });
    }

    await db
      .update(studentProfiles)
      .set({
        referenceFacePath: imagePath,
        faceEmbedding: embeddingJson || profile.faceEmbedding,
      })
      .where(eq(studentProfiles.userId, targetUserId))
      .run();

    await logAudit(
      req.user!,
      "BIOMETRIC_ENROLLED",
      "StudentProfile",
      targetUserId,
      `Enrolled reference face template (vector dimensions: ${embeddingJson ? JSON.parse(embeddingJson).length : "image only"}).`,
      req
    );

    res.json({
      success: true,
      message: "Biometric reference template enrolled successfully.",
      isEnrolled: true,
    });
  } catch (err: any) {
    console.error("Biometric enrollment error:", err);
    res.status(500).json({ error: err.message || "Failed to enroll biometric face data." });
  }
});

// Delete reference biometric data (GDPR / Privacy Compliance)
router.delete("/data", authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.query.studentId && req.user!.role === "admin" ? (req.query.studentId as string) : req.user!.id;

    const profile = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, targetUserId)).get();
    if (!profile) {
      return res.status(404).json({ error: "Student profile not found." });
    }

    // Remove local file if exists
    if (profile.referenceFacePath) {
      const fullPath = path.resolve(process.cwd(), profile.referenceFacePath.replace(/^\//, ""));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.error("Failed to delete file:", e);
        }
      }
    }

    await db
      .update(studentProfiles)
      .set({
        referenceFacePath: null,
        faceEmbedding: null,
        biometricConsent: false,
        biometricConsentDate: null,
      })
      .where(eq(studentProfiles.userId, targetUserId))
      .run();

    await logAudit(
      req.user!,
      "BIOMETRIC_DATA_PURGED",
      "StudentProfile",
      targetUserId,
      "Biometric reference templates and consent purged per user request.",
      req
    );

    res.json({
      success: true,
      message: "Biometric templates and photos have been permanently removed.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to purge biometric records." });
  }
});

export default router;
