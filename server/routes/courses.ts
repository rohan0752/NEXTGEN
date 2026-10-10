import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { courses, users, enrollments, studentProfiles } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";

const router = Router();

// List courses according to user role
router.get("/", authenticateToken, async (req, res) => {
  try {
    const allCourses = await db
      .select({
        id: courses.id,
        code: courses.code,
        name: courses.name,
        department: courses.department,
        section: courses.section,
        credits: courses.credits,
        facultyId: courses.facultyId,
        facultyName: users.fullName,
        facultyEmail: users.email,
        isActive: courses.isActive,
      })
      .from(courses)
      .leftJoin(users, eq(courses.facultyId, users.id))
      .all();

    if (req.user!.role === "faculty") {
      const myCourses = allCourses.filter((c) => c.facultyId === req.user!.id);
      return res.json({ courses: myCourses });
    }

    if (req.user!.role === "student") {
      const studentEnrollments = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(eq(enrollments.studentId, req.user!.id))
        .all();

      const enrolledIds = new Set(studentEnrollments.map((e) => e.courseId));
      const myCourses = allCourses.filter((c) => enrolledIds.has(c.id));
      return res.json({ courses: myCourses });
    }

    // Admin sees all
    res.json({ courses: allCourses });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch courses." });
  }
});

// Get single course details with enrolled students
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const course = await db
      .select({
        id: courses.id,
        code: courses.code,
        name: courses.name,
        department: courses.department,
        section: courses.section,
        credits: courses.credits,
        facultyId: courses.facultyId,
        facultyName: users.fullName,
        facultyEmail: users.email,
        isActive: courses.isActive,
      })
      .from(courses)
      .leftJoin(users, eq(courses.facultyId, users.id))
      .where(eq(courses.id, req.params.id))
      .get();

    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const students = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        studentIdNumber: studentProfiles.studentIdNumber,
        department: studentProfiles.department,
        section: studentProfiles.section,
        enrolledAt: enrollments.enrolledAt,
        status: enrollments.status,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .leftJoin(studentProfiles, eq(users.id, studentProfiles.userId))
      .where(eq(enrollments.courseId, course.id))
      .all();

    res.json({ course, students });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch course details." });
  }
});

// Admin: Create new course
router.post("/", authenticateToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { code, name, department, section, facultyId, credits = 4 } = req.body;

    if (!code || !name || !department || !facultyId) {
      return res.status(400).json({ error: "Code, name, department, and assigned faculty are required." });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.insert(courses).values({
      id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      department: department.trim(),
      section: (section || "Sec-A").trim(),
      facultyId,
      credits: Number(credits) || 4,
      isActive: true,
      createdAt: now,
    });

    await logAudit(req.user!, "COURSE_CREATE", "Course", id, `Created course ${code} - ${name}.`, req);

    res.status(201).json({ success: true, id, message: "Course created successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create course." });
  }
});

// Admin: Update course
router.put("/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { code, name, department, section, facultyId, credits, isActive } = req.body;

    const existing = await db.select().from(courses).where(eq(courses.id, req.params.id)).get();
    if (!existing) {
      return res.status(404).json({ error: "Course not found." });
    }

    await db
      .update(courses)
      .set({
        code: code ? code.trim().toUpperCase() : existing.code,
        name: name ? name.trim() : existing.name,
        department: department ? department.trim() : existing.department,
        section: section ? section.trim() : existing.section,
        facultyId: facultyId || existing.facultyId,
        credits: credits !== undefined ? Number(credits) : existing.credits,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      })
      .where(eq(courses.id, req.params.id))
      .run();

    await logAudit(req.user!, "COURSE_UPDATE", "Course", req.params.id, `Updated course details for ${existing.code}.`, req);

    res.json({ success: true, message: "Course updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update course." });
  }
});

// Admin: Enroll student into course
router.post("/:id/enroll", authenticateToken, requireRole(["admin", "faculty"]), async (req, res) => {
  try {
    const { studentId } = req.body;
    const courseId = req.params.id;

    if (!studentId) {
      return res.status(400).json({ error: "Student ID is required." });
    }

    const existingEnrollment = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, studentId)))
      .get();

    if (existingEnrollment) {
      return res.status(400).json({ error: "Student is already enrolled in this course." });
    }

    const id = uuidv4();
    await db.insert(enrollments).values({
      id,
      courseId,
      studentId,
      status: "enrolled",
      enrolledAt: new Date().toISOString(),
    });

    await logAudit(
      req.user!,
      "ENROLLMENT_CREATE",
      "Enrollment",
      id,
      `Enrolled student ${studentId} in course ${courseId}.`,
      req
    );

    res.status(201).json({ success: true, message: "Student enrolled successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to enroll student." });
  }
});

export default router;
