/**
 * Super-admin gate middleware.
 * Returns 403 for any user that is not a platform super admin.
 * Must be placed after the `authenticate` middleware.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

export const requireSuperAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "forbidden", message: "Super admin access required" });
    return;
  }
  next();
};
