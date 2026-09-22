import { Router } from 'express';
import { created, ok } from '../../lib/http';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { authLimiter, loginLimiter } from '../../middleware/rateLimit';
import { auditContext } from '../../services/audit.service';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas';
import * as authService from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAccessCookie, setAuthCookies, verifyAccessToken } from './tokens';

export const authRouter = Router();

/** POST /api/auth/register - self-service registration (creates a TRAINEE). */
authRouter.post('/register', authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, auditContext(req));
  if (result.tokens) setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
  created(res, { user: result.user, requiresApproval: result.requiresApproval });
});

/** POST /api/auth/login - verifies credentials and sets HttpOnly session cookies. */
authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, auditContext(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  ok(res, { user: result.user });
});

/** POST /api/auth/refresh - rotates the refresh token and issues a new access token. */
authRouter.post('/refresh', async (req, res) => {
  const result = await authService.refresh(req.cookies?.[REFRESH_COOKIE] as string | undefined, auditContext(req));
  if (result.refreshToken) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
  } else {
    // Grace-window refresh: only the access token changes, the refresh cookie set by the other tab stays valid.
    setAccessCookie(res, result.accessToken);
  }
  ok(res, { user: result.user });
});

/** POST /api/auth/logout - revokes the session and clears cookies. Idempotent. */
authRouter.post('/logout', async (req, res) => {
  let sessionId: string | undefined;
  const accessToken = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (accessToken) {
    try {
      sessionId = verifyAccessToken(accessToken).sid;
    } catch {
      // An expired access token must not prevent signing out; the refresh cookie identifies the session.
    }
  }
  await authService.logout({ ...(sessionId ? { sessionId } : {}), rawRefreshToken: req.cookies?.[REFRESH_COOKIE] as string | undefined }, auditContext(req));
  clearAuthCookies(res);
  ok(res, { loggedOut: true });
});

/** POST /api/auth/change-password */
authRouter.post('/change-password', authLimiter, authenticate, async (req, res) => {
  const user = currentUser(req);
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(user.id, user.sessionId, input, auditContext(req));
  ok(res, { changed: true });
});
