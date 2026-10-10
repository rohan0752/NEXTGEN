import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { classrooms } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateToken, requireRole, logAudit } from "../middleware/auth.js";

const router = Router();

// List all classrooms
router.get("/", authenticateToken, async (req, res) => {
  try {
    const list = await db.select().from(classrooms).all();
    res.json({ classrooms: list });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch classrooms." });
  }
});

// Admin: Create classroom
router.post("/", authenticateToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { code, name, building, floor = "Ground Floor", latitude, longitude, geofenceRadiusMeters = 50 } = req.body;

    if (!code || !name || !building || latitude == null || longitude == null) {
      return res.status(400).json({ error: "Code, name, building, latitude, and longitude are required." });
    }

    const id = uuidv4();
    await db.insert(classrooms).values({
      id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      building: building.trim(),
      floor: floor.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      geofenceRadiusMeters: Number(geofenceRadiusMeters) || 50,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    await logAudit(
      req.user!,
      "CLASSROOM_CREATE",
      "Classroom",
      id,
      `Created classroom ${code} with geofence radius ${geofenceRadiusMeters}m.`,
      req
    );

    res.status(201).json({ success: true, id, message: "Classroom created successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create classroom." });
  }
});

// Admin/Faculty: Update classroom coordinates or geofence radius
router.put("/:id", authenticateToken, requireRole(["admin", "faculty"]), async (req, res) => {
  try {
    const { name, building, floor, latitude, longitude, geofenceRadiusMeters, isActive } = req.body;

    const existing = await db.select().from(classrooms).where(eq(classrooms.id, req.params.id)).get();
    if (!existing) {
      return res.status(404).json({ error: "Classroom not found." });
    }

    await db
      .update(classrooms)
      .set({
        name: name !== undefined ? name.trim() : existing.name,
        building: building !== undefined ? building.trim() : existing.building,
        floor: floor !== undefined ? floor.trim() : existing.floor,
        latitude: latitude !== undefined ? Number(latitude) : existing.latitude,
        longitude: longitude !== undefined ? Number(longitude) : existing.longitude,
        geofenceRadiusMeters:
          geofenceRadiusMeters !== undefined ? Number(geofenceRadiusMeters) : existing.geofenceRadiusMeters,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      })
      .where(eq(classrooms.id, req.params.id))
      .run();

    await logAudit(
      req.user!,
      "CLASSROOM_UPDATE",
      "Classroom",
      req.params.id,
      `Updated geofence for classroom ${existing.code} (Lat: ${latitude ?? existing.latitude}, Lng: ${longitude ?? existing.longitude}, Radius: ${geofenceRadiusMeters ?? existing.geofenceRadiusMeters}m).`,
      req
    );

    res.json({ success: true, message: "Classroom geofence updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update classroom." });
  }
});

export default router;
