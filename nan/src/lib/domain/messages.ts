/**
 * Error message map: one code = one message (constitution rule).
 * Strings declared as exact in the spec are preserved literally.
 */

import type { ErrorCode } from './validate';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
	NO_ITEMS: 'Agregá al menos un ítem',
	EXPORT_CLIENT_INVALID: 'Revisá los datos del cliente antes de exportar.',
	PRES_NUMBER_DUPLICATE:
		'Ya existe un presupuesto guardado con el número PRES-XXXXXX. Recargá la página para empezar uno nuevo.',
	CLIENT_NAME_REQUIRED: 'El nombre es obligatorio.',
	CLIENT_NAME_TOO_LONG: 'Máximo 120 caracteres.',
	EMAIL_INVALID: 'El formato del email es inválido.',
	EMAIL_TOO_LONG: 'Máximo 254 caracteres.',
	ADDRESS_TOO_LONG: 'Máximo 240 caracteres.',
	RUT_TOO_LONG: 'Máximo 30 caracteres.',
	ITEM_DESCRIPTION_REQUIRED: 'La descripción es obligatoria.',
	ITEM_DESCRIPTION_TOO_LONG: 'Máximo 240 caracteres.',
	QUANTITY_INVALID: 'Entero entre 1 y 9999.',
	PRICE_INVALID: 'Desde 0,01; punto o coma; sin miles.',
	PRICE_BELOW_MINIMUM: 'Debe ser mayor o igual a 0,01.',
	ITEM_LIMIT_REACHED: 'Alcanzaste el límite de 100 ítems.',
	MAIL_RECIPIENT_INVALID: 'El mail del destinatario no es válido.',
	MAIL_NOT_FOUND: 'El presupuesto no está guardado: guardalo antes de enviarlo por mail.',
	MAIL_THROTTLED: 'Ya enviamos un mail a esta dirección hace un momento. Esperá un minuto para reenviar.',
	MAIL_UNAVAILABLE: 'El servicio de mail no respondió. Probá de nuevo en un rato.',
	MAIL_NOT_CONFIGURED: 'El envío de mail no está configurado en el servidor.'
};

/** Resolve a validation outcome for the UI. A null code stays null (no error to show). */
export function messageFor(code: ErrorCode | null): string | null {
	return code === null ? null : ERROR_MESSAGES[code];
}
