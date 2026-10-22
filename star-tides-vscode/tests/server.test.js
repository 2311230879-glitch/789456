import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../server.mjs';

test('preview serves HTML, JS and model with correct MIME; private files stay inaccessible', async () => {
  const preview = createPreviewServer();
  preview.server.listen(0, '127.0.0.1'); await once(preview.server, 'listening');
  const base = `http://127.0.0.1:${preview.server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200);
    assert.match(await page.text(), /__stars_events/);
    const js = await fetch(base + '/src/main.js'); assert.match(js.headers.get('content-type'), /javascript/);
    const model = await fetch(base + '/assets/pose_landmarker_lite.task', { method: 'HEAD' }); assert.equal(model.status, 200);
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/.vscode/launch.json')).status, 404);
    assert.equal((await fetch(base + '/src/missing.js')).status, 404);
  } finally { preview.server.closeAllConnections(); preview.dispose(); }
});
