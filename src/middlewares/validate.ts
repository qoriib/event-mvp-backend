import { ZodError, ZodObject } from "zod";
import { Request, Response, NextFunction } from "express";

/**
 * Middleware untuk validasi body, query, dan params menggunakan Zod.
 */
export function validateSchema(schema: ZodObject<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formatted = error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: formatted,
        });
      }

      next(error);
    }
  };
}
