// Utility functions

import type { ApiResponse, SessionData } from '../types/models';

// JSON response helpers
export function jsonResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export function successResponse<T>(data: T, message?: string): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  return jsonResponse(response);
}

export function errorResponse(error: string, status: number = 400): Response {
  const response: ApiResponse = {
    success: false,
    error,
  };
  return jsonResponse(response, status);
}

// CORS preflight handler
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Cookie parsing
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
}

// Session cookie creation - secure for same-origin deployment
export function createSessionCookie(token: string, maxAge: number = 4 * 60 * 60): string {
  // Base cookie attributes
  const attributes = [
    `session=${token}`,
    'HttpOnly', // Prevent JavaScript access
    'Secure', // HTTPS only
    'SameSite=Strict', // Same origin - maximum security!
    'Path=/',
    `Max-Age=${maxAge}`,
  ];

  return attributes.join('; ');
}

// Validation helpers
export function validateRoomCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

export function validatePlayerName(name: string): boolean {
  return name.length >= 2 && name.length <= 20;
}

export function validatePrompt(prompt: string): boolean {
  return prompt.length >= 10 && prompt.length <= 500;
}

export function validateAnswer(answer: string): boolean {
  return answer.length >= 1 && answer.length <= 1000;
}

// Password helpers
export function generatePassword(): string {
  return crypto.randomUUID();
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  
  // Use crypto.timingSafeEqual for constant-time comparison
  // This prevents timing attacks where attackers measure response times
  // to guess password hashes character by character
  const encoder = new TextEncoder();
  const hashBuffer = encoder.encode(passwordHash);
  const expectedBuffer = encoder.encode(hash);
  
  // timingSafeEqual requires buffers of equal length
  if (hashBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  // Node.js crypto.timingSafeEqual (available via nodejs_compat flag)
  return (crypto as any).timingSafeEqual(hashBuffer, expectedBuffer);
}

// Session helpers
export async function getSession(request: Request, env: any): Promise<SessionData | null> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const sessionToken = cookies['session'];

  if (!sessionToken) return null;

  const sessionData = await env.SESSIONS.get(sessionToken);
  if (!sessionData) return null;

  const session: SessionData = JSON.parse(sessionData);

  // Check expiration
  if (session.expiresAt < Date.now()) {
    await env.SESSIONS.delete(sessionToken);
    return null;
  }

  return session;
}

export async function createSession(
  env: any,
  playerId: string,
  roomId: string,
  roomCode: string
): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 hours

  const session: SessionData = {
    playerId,
    roomId,
    roomCode,
    expiresAt,
  };

  await env.SESSIONS.put(sessionToken, JSON.stringify(session), {
    expirationTtl: 4 * 60 * 60, // Auto-cleanup after 4 hours
  });

  return sessionToken;
}

export async function deleteSession(request: Request, env: any): Promise<void> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const sessionToken = cookies['session'];

  if (sessionToken) {
    await env.SESSIONS.delete(sessionToken);
  }
}

// Verify session is valid
export async function verifySession(
  request: Request,
  env: any,
  db: any
): Promise<{ valid: boolean; playerId?: string; session?: SessionData }> {
  const session = await getSession(request, env);
  if (!session) {
    return { valid: false };
  }

  // Get player from database to ensure they still exist
  const player = await db.getPlayerById(session.playerId);
  if (!player) {
    return { valid: false };
  }

  return { valid: true, playerId: player.id, session };
}

// Request body parsing
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    const contentType = request.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    return await request.json();
  } catch {
    return null;
  }
}

// URL path parsing
export function getPathParams(url: URL, pattern: string): Record<string, string> {
  const patternParts = pattern.split('/').filter(Boolean);
  const urlParts = url.pathname.split('/').filter(Boolean);

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = urlParts[i];
    }
  }

  return params;
}

// Route matching
export function matchRoute(pathname: string, pattern: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, i) => {
    if (part.startsWith(':')) return true;
    return part === pathParts[i];
  });
}

// Error handling
export class AppError extends Error {
  constructor(public message: string, public status: number = 400) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: unknown): Response {
  console.error('Error:', error);

  if (error instanceof AppError) {
    return errorResponse(error.message, error.status);
  }

  if (error instanceof Error) {
    return errorResponse(error.message, 500);
  }

  return errorResponse('An unexpected error occurred', 500);
}
