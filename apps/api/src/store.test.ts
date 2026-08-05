import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultOrganizationBilling } from './billing.js';
import { FileStore } from './store.js';

test('FileStore persists updates to disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chatbot-store-'));
  try {
    const file = join(dir, 'data.json');
    const store = new FileStore(file);
    await store.update((data) => {
      data.organizations.push({
        id: 'org_test',
        name: 'Test Org',
        billing: defaultOrganizationBilling(new Date('2026-08-05T00:00:00.000Z')),
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
    });
    const data = await store.read();
    assert.equal(data.organizations.length, 1);
    assert.equal(data.organizations[0]?.name, 'Test Org');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
