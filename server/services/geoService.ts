/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10; // 1 decimal place meters
}

export interface GeofenceEvaluationResult {
  passed: boolean;
  distanceMeters: number;
  allowedRadiusMeters: number;
  accuracyMeters: number;
  status: "verified" | "out_of_bounds" | "poor_accuracy" | "permission_denied" | "unavailable";
  reason: string;
}

export function evaluateGeofence(
  studentLat: number | null | undefined,
  studentLng: number | null | undefined,
  studentAccuracy: number | null | undefined,
  classroomLat: number,
  classroomLng: number,
  classroomRadiusMeters: number,
  maxAllowedAccuracyMeters: number = 100
): GeofenceEvaluationResult {
  if (studentLat == null || studentLng == null) {
    return {
      passed: false,
      distanceMeters: -1,
      allowedRadiusMeters: classroomRadiusMeters,
      accuracyMeters: -1,
      status: "unavailable",
      reason: "Location data was not provided or permission was denied by the browser.",
    };
  }

  const distance = calculateHaversineDistance(
    studentLat,
    studentLng,
    classroomLat,
    classroomLng
  );

  const accuracy = studentAccuracy ?? 10;

  // Check if GPS reported accuracy is so poor that device location is indeterminate
  if (accuracy > maxAllowedAccuracyMeters) {
    return {
      passed: false,
      distanceMeters: distance,
      allowedRadiusMeters: classroomRadiusMeters,
      accuracyMeters: accuracy,
      status: "poor_accuracy",
      reason: `Device GPS accuracy radius is ±${Math.round(accuracy)}m (exceeds threshold of ±${maxAllowedAccuracyMeters}m). Please switch on Wi-Fi or move near a window.`,
    };
  }

  // Account for GPS margin of error: student is considered within geofence if
  // distance <= radius + Math.min(accuracy / 2, 20)
  const effectiveTolerance = Math.min(accuracy / 2, 20);
  const passed = distance <= (classroomRadiusMeters + effectiveTolerance);

  if (passed) {
    return {
      passed: true,
      distanceMeters: distance,
      allowedRadiusMeters: classroomRadiusMeters,
      accuracyMeters: accuracy,
      status: "verified",
      reason: `Location verified. Distance to classroom is ${distance}m (allowed radius: ${classroomRadiusMeters}m).`,
    };
  } else {
    return {
      passed: false,
      distanceMeters: distance,
      allowedRadiusMeters: classroomRadiusMeters,
      accuracyMeters: accuracy,
      status: "out_of_bounds",
      reason: `Location outside classroom geofence. Distance is ${distance}m (allowed radius: ${classroomRadiusMeters}m).`,
    };
  }
}
