import { test } from 'vitest';
import { selftest } from '../src/selftest.js';

test('selftest: anchoring, splice, security and every state transition (git, branch, folder)', () => selftest(), 60_000);
