import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
const script = resolve('scripts/write-deployment.mjs');

test('hosted metadata records the actual provider revision and fails without a valid one', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'frostcut-deployment-'));
  try {
    await mkdir(join(temp, 'dist'));
    const cleared = { ...process.env, VERCEL_GIT_COMMIT_SHA: undefined, SOURCE_SHA: undefined, GITHUB_SHA: undefined, VERCEL: undefined };
    const source = 'a'.repeat(40), merge = 'b'.repeat(40);
    for (const env of [{ SOURCE_SHA: source, GITHUB_SHA: merge }, { VERCEL: '1', VERCEL_GIT_COMMIT_SHA: source }]) {
      const result = spawnSync(process.execPath, [script], { cwd: temp, env: { ...cleared, ...env }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const metadata = JSON.parse(await readFile(join(temp, 'dist/_deployment.json'), 'utf8'));
      assert.equal(metadata.sourceCommit, source);
      assert.equal(metadata.builtCommit, env.GITHUB_SHA ?? source);
      assert.equal(metadata.provider, env.VERCEL ? 'vercel' : 'github-actions');
      assert.ok(Number.isFinite(Date.parse(metadata.builtAt)));
    }
    for (const SOURCE_SHA of [undefined, 'not-a-commit', 'abc\nmalicious']) {
      const result = spawnSync(process.execPath, [script], { cwd: temp, env: { ...cleared, SOURCE_SHA }, encoding: 'utf8' });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /real VERCEL_GIT_COMMIT_SHA/);
    }
  } finally {
    assert.ok(relative(resolve(tmpdir()), resolve(temp)).startsWith('frostcut-deployment-'));
    await rm(temp, { recursive: true, force: true });
  }
});
