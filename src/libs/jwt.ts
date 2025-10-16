import jwt from "jsonwebtoken";
import { env } from "../env";

export interface JwtPayload {
  id: string;
  role: "ORGANIZER" | "CUSTOMER";
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
