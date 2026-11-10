import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const names = JSON.parse(fs.readFileSync('src/own-art.json', 'utf8'));
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('every card with its own art has the three images', () => {
  for (const name of names) for (const size of ['small', 'normal', 'art'])
    assert.ok(fs.existsSync(`public/cartas/${slug(name)}-${size}.webp`), `${name}: falta public/cartas/${slug(name)}-${size}.webp`);
});
