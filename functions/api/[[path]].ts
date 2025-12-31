// Pages Functions - handles all API requests including WebSocket
import app from '../../backend/src/router';
import type { Env } from '../../backend/src/types/models';

// Extend Env to include service binding
interface PagesEnv extends Env {
  DURABLE_OBJECTS_WORKER: Fetcher;
}

// Handle all API requests
export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env, waitUntil } = context;
  
  // Handle all requests (including WebSocket) through Hono router
  return app.fetch(request, env, waitUntil);
};
