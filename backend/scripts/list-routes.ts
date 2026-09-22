/**
 * Lists every HTTP route the API registers (method, full path and who may call it) by watching the Express router
 * while the route modules load, so the list cannot drift from the code.
 *
 *   npm run routes                 print the table
 *   npm run routes -- --markdown   print it as Markdown rows
 *   npm run routes -- --check      fail when docs/api.md and the code disagree (used in CI)
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

type Handler = (...args: unknown[]) => unknown;
type RouterLike = object;

interface RouteRecord {
  seq: number;
  method: string;
  path: string;
  handlers: Handler[];
}
interface MountRecord {
  seq: number;
  path: string;
  child: RouterLike;
  middleware: Handler[];
}
interface RouterRecord {
  routes: RouteRecord[];
  mounts: MountRecord[];
  middleware: { seq: number; handlers: Handler[] }[];
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const records = new Map<RouterLike, RouterRecord>();
let sequence = 0;

const recordFor = (router: RouterLike): RouterRecord => {
  let record = records.get(router);
  if (!record) {
    record = { routes: [], mounts: [], middleware: [] };
    records.set(router, record);
  }
  return record;
};

/** Watches route registration. Must run before the route modules are imported. */
function instrumentRouter(): void {
  const proto = express.Router.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;

  for (const method of METHODS) {
    const original = proto[method.toLowerCase()] as (...args: unknown[]) => unknown;
    proto[method.toLowerCase()] = function (this: RouterLike, routePath: unknown, ...handlers: unknown[]) {
      recordFor(this).routes.push({ seq: (sequence += 1), method, path: String(routePath), handlers: handlers.flat(Infinity) as Handler[] });
      return original.call(this, routePath, ...handlers);
    };
  }

  const originalUse = proto['use'] as (...args: unknown[]) => unknown;
  proto['use'] = function (this: RouterLike, ...args: unknown[]) {
    const mountPath = typeof args[0] === 'string' ? args[0] : '/';
    const handlers = (typeof args[0] === 'string' ? args.slice(1) : args).flat(Infinity) as Handler[];
    // A router is a function that carries its layer stack.
    const child = handlers.find((handler) => Array.isArray((handler as unknown as { stack?: unknown }).stack));
    const record = recordFor(this);
    if (child) record.mounts.push({ seq: (sequence += 1), path: mountPath, child, middleware: handlers.filter((handler) => handler !== child) });
    else record.middleware.push({ seq: (sequence += 1), handlers });
    return originalUse.apply(this, args);
  };
}

interface Endpoint {
  method: string;
  path: string;
  access: string;
}

const joinPaths = (prefix: string, tail: string): string => {
  const joined = `/${prefix}/${tail}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
};

async function collect(): Promise<Endpoint[]> {
  instrumentRouter();
  const { apiRouter } = await import('../src/routes');
  const { authenticate } = await import('../src/middleware/authenticate');

  const accessOf = (handlers: Handler[]): string => {
    if (!handlers.includes(authenticate as unknown as Handler)) return 'Public';
    const roles = [...new Set(handlers.flatMap((handler) => (handler as unknown as { allowedRoles?: string[] }).allowedRoles ?? []))];
    return roles.length > 0 ? roles.join(' / ') : 'Any signed-in user';
  };

  const endpoints: Endpoint[] = [];
  const walk = (router: RouterLike, prefix: string, inherited: Handler[]): void => {
    const record = records.get(router);
    if (!record) return;
    const before = (seq: number) => record.middleware.filter((entry) => entry.seq < seq).flatMap((entry) => entry.handlers);
    for (const route of record.routes) {
      endpoints.push({ method: route.method, path: joinPaths(prefix, route.path), access: accessOf([...inherited, ...before(route.seq), ...route.handlers]) });
    }
    for (const mount of record.mounts) walk(mount.child, joinPaths(prefix, mount.path), [...inherited, ...before(mount.seq), ...mount.middleware]);
  };
  walk(apiRouter, '/api', []);

  return endpoints.sort((a, b) => a.path.localeCompare(b.path) || METHODS.indexOf(a.method as (typeof METHODS)[number]) - METHODS.indexOf(b.method as (typeof METHODS)[number]));
}

/** The endpoint rows of the API document: table rows whose first cell is exactly `METHOD /api/path`. */
function documentedRoutes(markdown: string): string[] {
  return [...markdown.matchAll(/^\|\s*`(GET|POST|PUT|PATCH|DELETE) (\/api\/[^`\s]*)`\s*\|/gm)].map((match) => `${match[1]} ${match[2]}`);
}

async function main(): Promise<void> {
  const endpoints = await collect();
  const args = new Set(process.argv.slice(2));

  if (args.has('--check')) {
    const file = path.resolve(__dirname, '../../docs/api.md');
    const documented = documentedRoutes(fs.readFileSync(file, 'utf8'));
    const implemented = endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`);
    const duplicates = implemented.filter((route, index) => implemented.indexOf(route) !== index);
    const undocumented = implemented.filter((route) => !documented.includes(route));
    const unknown = [...new Set(documented)].filter((route) => !implemented.includes(route));
    const listedTwice = documented.filter((route, index) => documented.indexOf(route) !== index);

    console.log(`${implemented.length} routes in the code, ${new Set(documented).size} in docs/api.md`);
    for (const [title, list] of [
      ['Registered twice in the code', duplicates],
      ['In the code but missing from docs/api.md', undocumented],
      ['In docs/api.md but not in the code', unknown],
      ['Listed more than once in docs/api.md', [...new Set(listedTwice)]],
    ] as const) {
      if (list.length > 0) console.error(`\n${title}:\n${list.map((route) => `  ${route}`).join('\n')}`);
    }
    const failed = duplicates.length + undocumented.length + unknown.length + listedTwice.length > 0;
    console.log(failed ? '\ndocs/api.md is out of date.' : 'docs/api.md matches the code.');
    process.exit(failed ? 1 : 0);
  }

  if (args.has('--markdown')) {
    for (const endpoint of endpoints) console.log(`| \`${endpoint.method} ${endpoint.path}\` | ${endpoint.access} |`);
    return;
  }

  const width = Math.max(...endpoints.map((endpoint) => endpoint.path.length));
  for (const endpoint of endpoints) console.log(`${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(width)}  ${endpoint.access}`);
  console.log(`\n${endpoints.length} routes`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
