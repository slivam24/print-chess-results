import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMParser } from 'linkedom';

const here = dirname(fileURLToPath(import.meta.url));

export function fixtureHtml(name) {
  return readFileSync(join(here, 'fixtures', `${name}.html`), 'utf8');
}

export function fixture(name) {
  return new DOMParser().parseFromString(fixtureHtml(name), 'text/html');
}

export function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}
