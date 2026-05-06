import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const src = join(root, '.open-next');
const dist = join(root, '.open-next', 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Copy static assets
cpSync(join(src, 'assets'), dist, { recursive: true });

// Copy worker dependencies
cpSync(join(src, 'cloudflare'), join(dist, 'cloudflare'), { recursive: true });
cpSync(join(src, 'middleware'), join(dist, 'middleware'), { recursive: true });
cpSync(join(src, 'server-functions'), join(dist, 'server-functions'), { recursive: true });
if (existsSync(join(src, '.build'))) {
  cpSync(join(src, '.build'), join(dist, '.build'), { recursive: true });
}

// Patch worker: add ASSETS fallback before Next.js handler
let worker = readFileSync(join(src, 'worker.js'), 'utf-8');

const ASSETS_PATCH = `
    // Serve static files via ASSETS binding (CSS, JS, fonts, images)
    const _url = new URL(request.url);
    if (env.ASSETS && (
      _url.pathname.startsWith('/_next/static/') ||
      _url.pathname.startsWith('/_next/image') ||
      /\\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|otf|eot)$/.test(_url.pathname)
    )) {
      try {
        const _resp = await env.ASSETS.fetch(request.clone());
        if (_resp.status !== 404) return _resp;
      } catch {}
    }
`;

// Inject after "async fetch(request, env, ctx) {"
worker = worker.replace(
  'async fetch(request, env, ctx) {\n        return runWithCloudflareRequestContext',
  `async fetch(request, env, ctx) {${ASSETS_PATCH}        return runWithCloudflareRequestContext`
);

writeFileSync(join(dist, '_worker.js'), worker);
console.log('✓ Cloudflare deploy bundle ready at .open-next/dist');
