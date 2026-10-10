import rateLimit from "express-rate-limit";

// Rate limiter for login endpoint to prevent brute-force attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 20 : 300, // 300 in dev/test, 20 in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again after 15 minutes for security reasons.",
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// Rate limiter for verification attempts to avoid replay or rapid submission spam
export const verificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === "production" ? 15 : 200, // 200 in dev/test, 15 in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many attendance verification attempts in a short period. Please wait a minute.",
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests to CampusVerify API. Please slow down.",
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});
