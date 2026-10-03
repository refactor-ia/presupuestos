import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteBudget, getBudget, updateBudget } from '$lib/server/budgets';
import {
	badRequestResponse,
	invalidInputResponse,
	notFoundResponse,
	parseJsonBody
} from '$lib/server/http';

/** Positive-integer id param; anything else means "no such budget". */
function parseId(raw: string): number | null {
	const id = Number(raw);
	return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/budgets/[id] — the budget, or 404 when missing. */
export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null) {
		return notFoundResponse();
	}
	const budget = getBudget(id);
	if (budget === null) {
		return notFoundResponse();
	}
	return json(budget);
};

/** PUT /api/budgets/[id] — update: 200, 404 when missing, 422 on invalid body, 400 on bad JSON. */
export const PUT: RequestHandler = async ({ params, request }) => {
	const id = parseId(params.id);
	if (id === null) {
		return notFoundResponse();
	}
	const parsed = await parseJsonBody(request);
	if (!parsed.ok) {
		return badRequestResponse();
	}
	const result = updateBudget(id, parsed.body);
	if (result.ok) {
		return json(result.budget);
	}
	if (result.reason === 'not_found') {
		return notFoundResponse();
	}
	return invalidInputResponse(result.code);
};

/** DELETE /api/budgets/[id] — 200 on success (even if already absent rows are gone), 404 when missing. */
export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	if (id === null || !deleteBudget(id)) {
		return notFoundResponse();
	}
	return json({ ok: true });
};
