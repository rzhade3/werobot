import app from '../../../backend/src/router';
import type { Env } from '../../../backend/src/types/models';

interface PagesEnv extends Env {
  DURABLE_OBJECTS_WORKER: Fetcher;
}

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env, waitUntil } = context;
  return app.fetch(request, env, waitUntil);
};
