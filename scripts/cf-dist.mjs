import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const src = join(root, '.open-next');
const dist = join(root, '.open-next', 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(src, 'assets'), dist, { recursive: true });
cpSync(join(src, 'worker.js'), join(dist, '_worker.js'));
cpSync(join(src, 'cloudflare'), join(dist, 'cloudflare'), { recursive: true });
cpSync(join(src, 'middleware'), join(dist, 'middleware'), { recursive: true });
cpSync(join(src, 'server-functions'), join(dist, 'server-functions'), { recursive: true });
if (existsSync(join(src, '.build'))) {
  cpSync(join(src, '.build'), join(dist, '.build'), { recursive: true });
}

console.log('✓ Cloudflare deploy bundle ready at .open-next/dist');
