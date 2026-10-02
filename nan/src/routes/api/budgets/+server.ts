import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBudget, listBudgets } from '$lib/server/budgets';
import { badRequestResponse, invalidInputResponse, parseJsonBody } from '$lib/server/http';

/** GET /api/budgets — all budgets, newest first. */
export const GET: RequestHandler = async () => {
	return json(listBudgets());
};

/** POST /api/budgets — create a budget: 201, or 422 { code, message } on validation error. */
export const POST: RequestHandler = async ({ request }) => {
	const parsed = await parseJsonBody(request);
	if (!parsed.ok) {
		return badRequestResponse();
	}
	const result = createBudget(parsed.body);
	if (result.ok) {
		return json(result.budget, { status: 201 });
	}
	return invalidInputResponse(result.code);
};
