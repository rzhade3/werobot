// Pages Functions - handles API and proxies WebSocket to Durable Objects Worker
import app from '../../backend/src/router';
import type { Env } from '../../backend/src/types/models';

// Extend Env to include service binding
interface PagesEnv extends Env {
  DURABLE_OBJECTS_WORKER: Fetcher;
}

// Handle all API requests
export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env, waitUntil } = context;
  
  // Handle WebSocket upgrades - proxy to Durable Objects Worker
  if (request.headers.get('Upgrade') === 'websocket') {
    console.log('WebSocket upgrade request - proxying to Durable Objects Worker');
    
    // Forward to Durable Objects Worker via service binding
    return env.DURABLE_OBJECTS_WORKER.fetch(request);
  }

  // Handle regular HTTP requests with Hono
  return app.fetch(request, env, waitUntil);
};
