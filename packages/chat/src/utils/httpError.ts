// Turn a failed HTTP response into a user-friendly message: the semantic
// meaning of the status code plus the server's own detail/error/message text,
// instead of surfacing a raw `HTTP 401: {"detail":"..."}` string.

const STATUS_LABELS: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication failed',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timed out',
  409: 'Conflict',
  422: 'Invalid request',
  429: 'Rate limited',
};

function statusLabel(status: number): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  if (status >= 500) return 'Server error';
  if (status >= 400) return 'Request failed';
  return `HTTP ${status}`;
}

/**
 * Pull a human-readable detail out of a response body: FastAPI's `detail`
 * (string or validation-error array), our handlers' `error`/`message`, or a
 * short plain-text body. Returns '' when there's nothing safe to show (e.g. an
 * HTML error page or a multi-line stack trace).
 */
export function extractErrorDetail(body: string): string {
  const text = body.trim();
  if (!text) return '';
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.detail === 'string') return obj.detail;
      if (Array.isArray(obj.detail)) {
        // FastAPI request-validation errors: [{ loc, msg, type }, ...]
        const msgs = obj.detail
          .map((d) =>
            d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : '',
          )
          .filter(Boolean);
        if (msgs.length) return msgs.join('; ');
      }
      if (typeof obj.error === 'string') return obj.error;
      if (typeof obj.message === 'string') return obj.message;
      return ''; // structured but unrecognized — don't dump JSON at the user
    }
  } catch {
    // not JSON — fall through to the plain-text guard
  }
  // Only surface short, single-line plain text; skip HTML pages / stack traces.
  if (text.length <= 200 && !text.includes('\n') && !text.includes('<')) return text;
  return '';
}

/** Format a status + body into `Label: detail` (or just `Label`). */
export function formatHttpError(status: number, body: string): string {
  const label = statusLabel(status);
  const detail = extractErrorDetail(body);
  const trimmed = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
  return trimmed ? `${label}: ${trimmed}` : label;
}

/** Read a failed Response and build a friendly Error to throw. */
export async function httpError(response: Response): Promise<Error> {
  let body = '';
  try {
    body = await response.text();
  } catch {
    // ignore body-read failures; the status label alone is still useful
  }
  return new Error(formatHttpError(response.status, body));
}
