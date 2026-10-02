import { describe, expect, it } from 'vitest';
import { createPresId } from './session';

describe('createPresId', () => {
	it('returns PRES- followed by exactly six digits', () => {
		for (let i = 0; i < 20; i++) {
			expect(createPresId()).toMatch(/^PRES-\d{6}$/);
		}
	});

	// Uniqueness across sessions is NOT guaranteed by the spec (RQ-01)
	// and must not be asserted here.
});
