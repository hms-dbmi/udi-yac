/**
 * Dev-server API for reading and writing the template review sidecar.
 *
 * A static SPA cannot write to disk, so the studio POSTs review decisions here
 * and this middleware persists them to the sidecar JSON next to the agent's
 * templates. Reviews live in a sidecar rather than in the builder or the
 * generated tool module because those are regenerated wholesale (and marked
 * DO NOT EDIT) — a human edit there would be clobbered on the next regen.
 *
 * `apply: 'serve'` keeps this out of production builds: it is a local authoring
 * affordance, not a deployed service. A build of the studio is read-only.
 */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Connect, Plugin } from 'vite';
import type { ServerResponse } from 'node:http';

export const REVIEW_STATUSES = ['new', 'approved', 'rejected', 'needs_changes'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewEntry {
  status: ReviewStatus;
  feedback: string;
  reviewed_at: string;
  /** Recorded for human legibility; the key is a spec hash, not this name. */
  tool_name?: string;
  chart_type?: string;
}

export type ReviewFile = Record<string, ReviewEntry>;

const MAX_BODY_BYTES = 256 * 1024;

/** Reject anything that isn't a plain review entry before it reaches disk. */
function parseEntry(raw: unknown): ReviewEntry | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'body must be a JSON object' };
  const body = raw as Record<string, unknown>;

  const status = body.status;
  if (typeof status !== 'string' || !REVIEW_STATUSES.includes(status as ReviewStatus)) {
    return { error: `status must be one of: ${REVIEW_STATUSES.join(', ')}` };
  }

  const feedback = body.feedback ?? '';
  if (typeof feedback !== 'string') return { error: 'feedback must be a string' };

  const entry: ReviewEntry = {
    status: status as ReviewStatus,
    feedback,
    reviewed_at: new Date().toISOString(),
  };
  if (typeof body.tool_name === 'string') entry.tool_name = body.tool_name;
  if (typeof body.chart_type === 'string') entry.chart_type = body.chart_type;
  return entry;
}

function readReviews(file: string): ReviewFile {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as ReviewFile) : {};
  } catch {
    // Missing file is the normal first-run state; a corrupt one shouldn't wedge
    // the tool, so start from empty either way.
    return {};
  }
}

/** Write via a temp file + rename so a crash can't leave a half-written sidecar. */
function writeReviews(file: string, reviews: ReviewFile): void {
  // Sorted keys keep diffs reviewable when the sidecar is committed.
  const sorted = Object.fromEntries(Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tmp, file);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export interface ReviewStorePluginOptions {
  /** Absolute path to the sidecar JSON file. */
  reviewFile: string;
  /**
   * Absolute path to template_visualizations.json. Hashed on request so the app
   * can detect that its exported previews are stale — a reviewer must never
   * approve a rendering of a spec that has since changed.
   */
  templatesFile: string;
}

export function reviewStorePlugin({ reviewFile, templatesFile }: ReviewStorePluginOptions): Plugin {
  return {
    name: 'udi-template-studio:review-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/templates-hash', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const raw = readFileSync(templatesFile, 'utf8');
          const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
          sendJson(res, 200, { templatesHash: hash });
        } catch (err) {
          sendJson(res, 500, { error: `cannot read templates file: ${(err as Error).message}` });
        }
      });

      server.middlewares.use('/api/reviews', async (req, res, next) => {
        // Path within the mount: '/' for the collection, '/<key>' for one entry.
        const url = req.url ?? '/';
        const key = decodeURIComponent(url.split('?')[0].replace(/^\//, ''));

        if (req.method === 'GET' && !key) {
          sendJson(res, 200, { reviews: readReviews(reviewFile), path: reviewFile });
          return;
        }

        if (req.method === 'PUT' || req.method === 'POST') {
          if (!key) {
            sendJson(res, 400, { error: 'missing template key in path' });
            return;
          }
          // Keys are spec hashes from the exporter; refuse anything else so a
          // malformed key can never widen what this endpoint writes.
          if (!/^[a-f0-9]{6,64}$/.test(key)) {
            sendJson(res, 400, { error: 'template key must be a hex hash' });
            return;
          }

          let entry: ReviewEntry | { error: string };
          try {
            entry = parseEntry(JSON.parse(await readBody(req)));
          } catch (err) {
            sendJson(res, 400, { error: `invalid JSON body: ${(err as Error).message}` });
            return;
          }
          if ('error' in entry) {
            sendJson(res, 400, entry);
            return;
          }

          const reviews = readReviews(reviewFile);
          reviews[key] = entry;
          try {
            writeReviews(reviewFile, reviews);
          } catch (err) {
            sendJson(res, 500, { error: `failed to write sidecar: ${(err as Error).message}` });
            return;
          }
          sendJson(res, 200, { key, entry });
          return;
        }

        if (req.method === 'DELETE') {
          if (!key) {
            sendJson(res, 400, { error: 'missing template key in path' });
            return;
          }
          const reviews = readReviews(reviewFile);
          delete reviews[key];
          writeReviews(reviewFile, reviews);
          sendJson(res, 200, { key, deleted: true });
          return;
        }

        next();
      });

      server.config.logger.info(
        `  \x1b[32m➜\x1b[0m  reviews:  \x1b[2m${reviewFile.replace(join(process.cwd(), '..', '..'), '.')}\x1b[0m`,
      );
    },
  };
}
