/**
 * Genuine Face Verification & Comparison Service
 * Handles 128-dimensional facial embedding vectors derived from standard facial recognition models (e.g. face-api / FaceNet).
 */

export function calculateEuclideanDistance(desc1: number[], desc2: number[]): number {
  if (!desc1 || !desc2 || desc1.length !== desc2.length || desc1.length === 0) {
    throw new Error("Invalid descriptor arrays for Euclidean distance computation.");
  }

  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function convertDistanceToSimilarity(distance: number): number {
  // Standard face-api distance scale: 0 is identical, ~0.6 is boundary threshold, > 1.0 is distinct
  const score = Math.max(0, 1 - distance / 1.1);
  return Math.round(score * 100) / 100;
}

export interface FaceVerificationResult {
  passed: boolean;
  status: "verified" | "mismatch" | "unconfigured" | "manual_review" | "skipped";
  distance: number | null;
  similarity: number | null;
  reason: string;
}

export function verifyFaceDescriptors(
  referenceDescriptor: number[] | null,
  probeDescriptor: number[] | null,
  threshold: number = 0.58
): FaceVerificationResult {
  if (!referenceDescriptor || referenceDescriptor.length === 0) {
    return {
      passed: false,
      status: "unconfigured",
      distance: null,
      similarity: null,
      reason: "No reference face enrolled for this student. System policy requires faculty manual review.",
    };
  }

  if (!probeDescriptor || probeDescriptor.length === 0) {
    return {
      passed: false,
      status: "manual_review",
      distance: null,
      similarity: null,
      reason: "Probe face capture could not extract facial landmarks. Attempt flagged for manual review.",
    };
  }

  if (referenceDescriptor.length !== probeDescriptor.length) {
    return {
      passed: false,
      status: "manual_review",
      distance: null,
      similarity: null,
      reason: "Biometric descriptor dimension mismatch. Attempt flagged for faculty review.",
    };
  }

  try {
    const distance = calculateEuclideanDistance(referenceDescriptor, probeDescriptor);
    const similarity = convertDistanceToSimilarity(distance);

    if (distance <= threshold) {
      return {
        passed: true,
        status: "verified",
        distance: Math.round(distance * 1000) / 1000,
        similarity,
        reason: `Face verified with ${Math.round(similarity * 100)}% match confidence (Euclidean distance: ${Math.round(distance * 1000) / 1000}).`,
      };
    } else {
      return {
        passed: false,
        status: "mismatch",
        distance: Math.round(distance * 1000) / 1000,
        similarity,
        reason: `Face mismatch: Similarity ${Math.round(similarity * 100)}% is below threshold of ${Math.round((1 - threshold / 1.1) * 100)}%.`,
      };
    }
  } catch (err: any) {
    return {
      passed: false,
      status: "manual_review",
      distance: null,
      similarity: null,
      reason: `Biometric matching calculation error: ${err.message}. Routed to manual review queue.`,
    };
  }
}
