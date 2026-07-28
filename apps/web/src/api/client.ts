import type { components, paths } from "./schema.ts";

export type ApiErrorBody = components["schemas"]["Error"];

export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    if (body.field !== undefined) this.field = body.field;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    (!("field" in value) || value.field === undefined || typeof value.field === "string")
  );
}

// ── Spec-derived types ─────────────────────────────────────────────────────
//
// Every helper below is keyed on a path literal from the generated `paths`
// map, so the URL a caller passes determines its params, body, and response.
// There is no type parameter to guess at: rename a field in the spec and the
// break lands on `pnpm type-check`, not in the browser.
//
// openapi-typescript emits every method on every path — the ones an operation
// doesn't declare as `?: never`, i.e. `undefined`. That is what the `extends
// undefined` filter keys off. Conditionals wrap their operands in tuples
// (`[T] extends [never]`) to suppress distribution over `never`.

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Path literals the spec declares the given method on. */
type PathWith<M extends HttpMethod> = {
  [P in keyof paths]: paths[P][M] extends undefined ? never : P;
}[keyof paths];

type Operation<P extends PathWith<M>, M extends HttpMethod> = paths[P][M];

type ParametersOf<Op> = Op extends { parameters: infer Params } ? Params : never;

type PathParams<Op> = ParametersOf<Op> extends { path?: infer T } ? Exclude<T, undefined> : never;
type QueryParams<Op> = ParametersOf<Op> extends { query?: infer T } ? Exclude<T, undefined> : never;

type RequestBody<Op> = Op extends { requestBody?: infer Body }
  ? Body extends { content: { "application/json": infer T } }
    ? T
    : never
  : never;

/** The 2xx response body, or `void` for a response with no content (204). */
type ResponseBody<Op> = Op extends { responses: infer Responses }
  ? Responses[Extract<keyof Responses, 200 | 201 | 202 | 204>] extends {
      content: { "application/json": infer T };
    }
    ? T
    : void
  : never;

/**
 * Options for one operation. A slot exists only when the spec declares it, so
 * a stray `body` on a GET, or a missing `path` on `/api/assets/{id}`, is a type
 * error. Intersecting with `unknown` is the identity — that is how the absent
 * slots disappear.
 */
type RequestInput<Op> = ([PathParams<Op>] extends [never] ? unknown : { path: PathParams<Op> }) &
  ([QueryParams<Op>] extends [never] ? unknown : { query: QueryParams<Op> }) &
  ([RequestBody<Op>] extends [never] ? unknown : { body: RequestBody<Op> }) & {
    signal?: AbortSignal;
  };

/** Makes the options argument optional for operations that take nothing. */
type RequestArgs<Op> = [PathParams<Op>] extends [never]
  ? [QueryParams<Op>] extends [never]
    ? [RequestBody<Op>] extends [never]
      ? [input?: RequestInput<Op>]
      : [input: RequestInput<Op>]
    : [input: RequestInput<Op>]
  : [input: RequestInput<Op>];

type UntypedInput = {
  path?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
};

function buildUrl(template: string, input: UntypedInput): string {
  let url = template;

  for (const [name, value] of Object.entries(input.path ?? {})) {
    url = url.replace(`{${name}}`, encodeURIComponent(value));
  }

  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) search.set(name, String(value));
  }

  return search.size > 0 ? `${url}?${search.toString()}` : url;
}

async function send(method: string, template: string, input: UntypedInput): Promise<unknown> {
  const init: RequestInit = { method, credentials: "include" };
  if (input.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(input.body);
  }
  if (input.signal !== undefined) init.signal = input.signal;

  const response = await fetch(buildUrl(template, input), init);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(
      response.status,
      isApiErrorBody(body) ? body : { error: `Request failed with status ${response.status}` },
    );
  }

  // 204 carries no body; calling .json() on it would reject.
  if (response.status === 204) return undefined;

  return await response.json();
}

function verb<M extends HttpMethod>(method: M) {
  return <P extends PathWith<M>>(
    path: P,
    ...[input]: RequestArgs<Operation<P, M>>
  ): Promise<ResponseBody<Operation<P, M>>> =>
    send(method.toUpperCase(), path, input ?? {}) as Promise<ResponseBody<Operation<P, M>>>;
}

export const apiGet = verb("get");
export const apiPost = verb("post");
export const apiPut = verb("put");
export const apiPatch = verb("patch");
export const apiDelete = verb("delete");
