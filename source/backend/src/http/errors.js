/** RFC 9457 problem+json. Throw HttpError anywhere; errorHandler renders it. */
export class HttpError extends Error {
  constructor(status, title, { detail, errors, headers } = {}) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.headers = headers;
  }
}

const PG_MAP = {
  23505: [409, 'Conflict', 'Resource already exists'],
  23503: [409, 'Conflict', 'Referenced resource missing or still in use'],
  23514: [422, 'Unprocessable Content', 'Value violates a data constraint'],
  23502: [422, 'Unprocessable Content', 'Required value missing'],
};

function build(status, title, detail, errors, headers) {
  const body = { type: 'about:blank', title, status };
  if (detail) body.detail = detail;
  if (errors) body.errors = errors;
  return { status, body, headers };
}

/** Normalise anything thrown into { status, body, headers }. Never leaks internals for 5xx. */
export function toProblem(err) {
  if (err instanceof HttpError) return build(err.status, err.title, err.detail, err.errors, err.headers);
  const mapped = PG_MAP[err?.code];
  if (mapped) return build(...mapped);
  if (err?.type === 'entity.too.large') return build(413, 'Payload Too Large');
  if (err?.type === 'entity.parse.failed') return build(400, 'Bad Request', 'Malformed JSON body');
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) return build(err.status, 'Bad Request');
  return build(500, 'Internal Server Error');
}

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Not Found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const { status, body, headers } = toProblem(err);
  if (status >= 500) console.error(err?.code ?? err?.name, err?.message); // never log request data/tokens
  if (res.headersSent) return res.end();
  res.status(status).set(headers ?? {}).type('application/problem+json').send(JSON.stringify(body));
}
