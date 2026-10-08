const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let root;
let adapter;
test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lms-storage-test-'));
  process.env.STORAGE_DIR = root;
  process.env.STORAGE_PUBLIC_BASE_URL = 'https://api.example.test';
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME = 'test';
  adapter = require('./storage');
});
test.after(async () => {
  assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(), 'lms-storage-test-')));
  await fs.rm(root, { recursive: true, force: true });
});

test('upload, URL parsing, local copy and deletion preserve exact file bytes', async () => {
  const bucket = adapter.storage.from('smartlms');
  const bytes = Buffer.from([0, 1, 2, 255, 42]);
  const upload = await bucket.upload('courses/lesson one.pdf', bytes);
  assert.equal(upload.error, null);
  assert.equal(upload.data.publicUrl, 'https://api.example.test/uploads/storage/courses/lesson_one.pdf');
  assert.equal(adapter.storagePathFromUrl(upload.data.publicUrl), upload.data.path);
  assert.deepEqual(await fs.readFile(adapter.diskPathFor(upload.data.path)), bytes);
  const copy = await bucket.copy(upload.data.path, 'courses/copy.pdf');
  assert.equal(copy.error, null);
  assert.deepEqual(await fs.readFile(adapter.diskPathFor(copy.data.path)), bytes);
  assert.equal((await bucket.remove([upload.data.path, copy.data.path])).error, null);
  await assert.rejects(fs.stat(adapter.diskPathFor(copy.data.path)), { code: 'ENOENT' });
  assert.equal((await bucket.remove([copy.data.path])).error, null);
});

test('a missing source returns an error without a network copy or target file', async () => {
  const result = await adapter.storage.from('smartlms').copy('missing.pdf', 'copies/missing.pdf');
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'ENOENT');
  await assert.rejects(fs.stat(adapter.diskPathFor('copies/missing.pdf')), { code: 'ENOENT' });
});

test('delete cannot remove the storage root or a directory of other files', async () => {
  await adapter.storage.from('smartlms').upload('guard/keep.txt', 'keep');
  assert.ok((await adapter.storage.from('smartlms').remove(['..'])).error);
  assert.ok((await adapter.storage.from('smartlms').remove(['guard'])).error);
  assert.equal(await fs.readFile(adapter.diskPathFor('guard/keep.txt'), 'utf8'), 'keep');
});

test('managed URLs accept this API and legacy cloud, and reject another cloud', () => {
  assert.equal(adapter.isManagedUrl(adapter.publicUrlFor('lesson.pdf')), true);
  assert.equal(adapter.isManagedUrl('https://res.cloudinary.com/test/raw/upload/v12/smartlms/lesson.pdf'), true);
  assert.equal(adapter.isManagedUrl('https://res.cloudinary.com/another/raw/upload/lesson.pdf'), false);
  assert.equal(adapter.isManagedUrl('https://attacker.example/uploads/storage/lesson.pdf'), false);
  assert.equal(adapter.isLegacyCloudinaryUrl('https://res.cloudinary.com/test/image/upload/a.png'), true);
  assert.equal(adapter.isLegacyCloudinaryUrl('https://res.cloudinary.com.attacker.example/a.png'), false);
});

test('legacy URL parsing supports versions and rejects malformed percent encoding', () => {
  assert.equal(adapter.storagePathFromUrl('https://res.cloudinary.com/test/raw/upload/v12/smartlms/lesson.pdf'), 'lesson.pdf');
  assert.equal(adapter.storagePathFromUrl('https://api.example.test/uploads/storage/%ZZ'), '');
  assert.equal(adapter.storagePathFromUrl('https://old.example/storage/v1/object/public/smartlms/%ZZ'), '');
});

test('missing production URL configuration fails before writing any file', async () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    delete process.env.PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    const result = await adapter.storage.from('smartlms').upload('unconfigured.txt', 'content');
    assert.match(result.error.message, /STORAGE_PUBLIC_BASE_URL/);
    assert.ok(adapter.storage.from('smartlms').getPublicUrl('unconfigured.txt').error);
    await assert.rejects(fs.stat(adapter.diskPathFor('unconfigured.txt')), { code: 'ENOENT' });
  } finally {
    for (const key of ['NODE_ENV', 'STORAGE_PUBLIC_BASE_URL', 'PUBLIC_API_URL', 'NEXT_PUBLIC_API_URL']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
