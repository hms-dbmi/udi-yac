import { describe, it, expect } from 'vitest';
import { formatHttpError } from './httpError';

describe('formatHttpError', () => {
  it('maps status to a semantic label and appends FastAPI detail', () => {
    expect(formatHttpError(401, '{"detail":"Invalid or expired token"}')).toBe(
      'Authentication failed: Invalid or expired token',
    );
  });

  it('uses our handlers `error` field', () => {
    expect(formatHttpError(401, '{"error":"OpenAI rejected the API key."}')).toBe(
      'Authentication failed: OpenAI rejected the API key.',
    );
  });

  it('joins FastAPI validation-error arrays', () => {
    const body = '{"detail":[{"loc":["body","x"],"msg":"field required","type":"missing"}]}';
    expect(formatHttpError(422, body)).toBe('Invalid request: field required');
  });

  it('falls back to a `message` field', () => {
    expect(formatHttpError(400, '{"message":"bad input"}')).toBe('Bad request: bad input');
  });

  it('surfaces short plain-text bodies', () => {
    expect(formatHttpError(500, 'Internal Server Error')).toBe(
      'Server error: Internal Server Error',
    );
  });

  it('drops HTML / multi-line bodies, keeping just the label', () => {
    expect(formatHttpError(500, '<html><body>500</body></html>')).toBe('Server error');
    expect(formatHttpError(502, 'Traceback:\n  File ...\n  boom')).toBe('Server error');
  });

  it('labels unknown 4xx and empty bodies', () => {
    expect(formatHttpError(404, '')).toBe('Not found');
    expect(formatHttpError(418, '')).toBe('Request failed');
  });
});
