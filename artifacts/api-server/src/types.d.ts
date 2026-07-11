/**
 * Express Request augmentation — adds the authenticated session context.
 * Set by the `authenticate` middleware; guaranteed to be non-null on every
 * route that is protected (i.e. not /healthz or /auth/*).
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        orgId: string;
        roleId: string;
        name: string;
        email: string;
        isSuperAdmin: boolean;
        /** Set when a super admin is impersonating an org via the portal. */
        orgOverride?: string;
      };
      /**
       * Set by the `validateGatewayToken` middleware for Edge Gateway Agent
       * requests (bearer token auth, not session cookie auth).
       */
      gateway?: {
        id: string;
        orgId: string;
        name: string;
      };
    }
  }
}

export {};
