/**
 * Normalize untrusted option data into the public ModularSelect shape.
 * The DOM renderer uses textContent for every label and description.
 * Values are strings because HTML form controls submit strings.
 *
 * @param {Array<unknown>} items
 * @returns {Array<{value: string, label: string, description: string, disabled: boolean}>}
 */
export function normalizeItems(items) {
	if (!Array.isArray(items)) {
		throw new TypeError('ModularSelect items must be an array.');
	}

	const seen = new Set();
	const normalized = [];
	for (const entry of items) {
		const option = (typeof entry === 'string' || typeof entry === 'number')
			? { value: entry, label: entry }
			: entry;
		if (!option || typeof option !== 'object' || option.value === null || option.value === undefined) {
			throw new TypeError('Each ModularSelect option requires a value.');
		}
		if (typeof option.value !== 'string' && typeof option.value !== 'number') {
			throw new TypeError('ModularSelect option values must be strings or numbers.');
		}
		const value = String(option.value);
		if (value === '' || seen.has(value)) continue;
		seen.add(value);
		normalized.push({
			value,
			label: String(option.label ?? value),
			description: String(option.description ?? ''),
			disabled: Boolean(option.disabled)
		});
	}
	return normalized;
}

/**
 * Filter a static set without interpreting text as HTML, SQL or regex.
 * Keep the caller's original order for stable pagination.
 *
 * @param {Array<{label: string, description: string}>} items
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterItems(items, query) {
	const text = String(query ?? '').trim().toLocaleLowerCase();
	if (!text) return items.slice();
	return items.filter((item) =>
		item.label.toLocaleLowerCase().includes(text) ||
		item.description.toLocaleLowerCase().includes(text) ||
		String(item.value).toLocaleLowerCase().includes(text)
	);
}

/**
 * Normalize static or remote page payloads to the same interface.
 * A source must page its results; no full-dataset fallback occurs.
 *
 * @param {Array|{items: Array, hasMore?: boolean}} payload
 * @param {number} limit
 * @returns {{items: Array, hasMore: boolean}}
 */
export function normalizePage(payload, limit) {
	const array = Array.isArray(payload) ? payload : payload?.items;
	if (!Array.isArray(array)) {
		throw new TypeError('ModularSelect source must return an array or {items, hasMore}.');
	}
	const items = normalizeItems(array.slice(0, limit));
	const hasMore = Array.isArray(payload)
		? array.length >= limit
		: (typeof payload.hasMore === 'boolean' ? payload.hasMore : array.length >= limit);
	return { items, hasMore };
}
