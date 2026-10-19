import { writeFile } from 'node:fs/promises';
const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_SHA ?? process.env.GITHUB_SHA;
if (!sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit))
  throw new Error('A hosted build needs its real VERCEL_GIT_COMMIT_SHA, SOURCE_SHA or GITHUB_SHA');
await writeFile('dist/_deployment.json', JSON.stringify({
  sourceCommit,
  builtCommit: process.env.GITHUB_SHA ?? sourceCommit,
  provider: process.env.VERCEL ? 'vercel' : 'github-actions',
  builtAt: new Date().toISOString(),
}, null, 2));
