import { NextFunction, Request, Response } from "express";

/**
 * Middleware global untuk menangani error secara konsisten.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("Unhandled Error:", err);

  const status = err.statusCode || 500;
  const message =
    typeof err.message === "string" ? err.message : "Internal Server Error";

  res.status(status).json({
    success: false,
    error: message,
  });
}
