import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const workerBuild = resolve('dist/happy_soils_maps');
const sitesServer = resolve('dist/server');

await rm(sitesServer, { force: true, recursive: true });
await mkdir(sitesServer, { recursive: true });
await cp(workerBuild, sitesServer, { recursive: true });
