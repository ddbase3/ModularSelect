import { normalizeItems, filterItems, normalizePage } from './utils/options.js';

let instanceCounter = 0;

const DEFAULT_STRINGS = {
	placeholder: 'Search or select...',
	options: 'Options',
	showOptions: 'Show options',
	hideOptions: 'Hide options',
	remove: 'Remove {label}',
	removed: 'Removed {label}.',
	backspaceHint: 'When the search field is empty, press Backspace to remove the last selected option.',
	loadMore: 'Load more',
	loading: 'Loading options...',
	noResults: 'No matching options.',
	minChars: 'Enter at least {count} characters.',
	results: '{count} options available.',
	searchError: 'Options could not be loaded.',
	required: 'Please select an option.'
};

function interpolate(template, values = {}) {
	let result = String(template);
	for (const [key, value] of Object.entries(values)) {
		result = result.split(`{${key}}`).join(String(value));
	}
	return result;
}

function resolveTarget(target) {
	if (typeof target === 'string') return document.querySelector(target);
	return target;
}

function createElement(tag, className, text = null) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== null) element.textContent = text;
	return element;
}

/**
 * Standalone, dependency-free and domain-neutral accessible select component.
 *
 * Options are {value, label, description?, disabled?}. A remote source is
 * async ({query, limit, offset, signal}) => {items, hasMore?} (or an array).
 * Only selected values are exposed via getValue() and optional form inputs.
 *
 * This component deliberately does not perform network requests itself;
 * callers own their data source, authentication and authorization boundary.
 */
export class ModularSelect {
	constructor(target, options = {}) {
		const source = options.source ?? null;
		if (source !== null && typeof source !== 'function') {
			throw new TypeError('ModularSelect source must be a function.');
		}
		const limit = options.limit ?? 20;
		const debounceMs = options.debounceMs ?? 250;
		const minChars = options.minChars ?? (source ? 1 : 0);
		if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(debounceMs) || debounceMs < 0 ||
			!Number.isInteger(minChars) || minChars < 0) {
			throw new RangeError('limit must be positive; debounceMs and minChars must be non-negative integers.');
		}

		this.target = target;
		this.options = {
			items: [],
			multiple: false,
			disabled: false,
			required: false,
			label: '',
			ariaLabel: '',
			labelledBy: '',
			name: '',
			closeOnSelect: !options.multiple,
			className: '',
			onChange: null,
			onError: null,
			...options,
			source,
			limit,
			debounceMs,
			minChars,
			strings: { ...DEFAULT_STRINGS, ...(options.strings ?? {}) }
		};
		this.items = normalizeItems(this.options.items);
		this.selected = new Map();
		this.results = [];
		this.query = '';
		this.offset = 0;
		this.hasMore = false;
		this.activeIndex = -1;
		this.opened = false;
		this.pending = false;
		this.loading = false;
		this.error = false;
		this.initialized = false;
		this.requestId = 0;
		this.abortController = null;
		this.searchTimer = null;
		this.listeners = [];
		this.optionPointerActive = false;
		this.instanceId = `modularselect-${++instanceCounter}`;
		this.root = null;
		this.input = null;
		this.selected = this._setValue(options.value ?? null, options.selectedItems ?? []);
	}

	/** Mount the widget into an existing, empty or populated container. */
	init() {
		if (this.initialized) return this;
		const target = resolveTarget(this.target);
		if (!target || typeof target.appendChild !== 'function') {
			throw new Error('ModularSelect needs an existing container element or selector.');
		}
		this.host = target;
		this._build();
		this.host.appendChild(this.root);
		this.initialized = true;
		this._listen(this.input, 'focus', () => this.open());
		this._listen(this.input, 'input', () => {
			this.query = this.input.value;
			if (!this.opened) this.open();
			else this._queueSearch(this.options.debounceMs);
		});
		this._listen(this.input, 'keydown', (event) => this._onKeydown(event));
		this._listen(this.toggle, 'pointerdown', (event) => event.preventDefault());
		this._listen(this.toggle, 'click', () => {
			if (this.opened) this.close();
			else this.open();
			this.input.focus();
		});
		this._listen(this.list, 'pointerdown', (event) => {
			const option = event.target.closest('[role="option"][data-index]');
			if (!option || !this.list.contains(option) || event.button !== 0) return;
			this.optionPointerActive = true;
			// A mouse/pen click must not blur the combobox before its click handler
			// commits the value. Leave touch defaults intact so the list scrolls.
			if (event.pointerType !== 'touch') event.preventDefault();
		});
		this._listen(this.list, 'click', (event) => {
			const option = event.target.closest('[role="option"][data-index]');
			this.optionPointerActive = false;
			if (option && this.list.contains(option)) this._selectIndex(Number(option.dataset.index));
		});
		this._listen(this.moreButton, 'click', () => { void this.loadMore(); });
		this._listen(this.root, 'focusout', (event) => {
			// Touch interaction can move focus before click. The originating
			// option must remain mounted until that click has been processed.
			if (this.optionPointerActive) return;
			if (event.relatedTarget && !this.root.contains(event.relatedTarget)) this.close();
		});
		this._listen(document, 'pointerup', (event) => {
			if (!this.optionPointerActive) return;
			const option = event.target.closest?.('[role="option"][data-index]');
			if (option && this.list.contains(option)) return; // Click follows pointerup.
			this.optionPointerActive = false;
			if (!this.root.contains(document.activeElement)) this.close();
		});
		this._listen(document, 'pointercancel', () => {
			if (!this.optionPointerActive) return;
			this.optionPointerActive = false;
			if (!this.root.contains(document.activeElement)) this.close();
		});
		this._listen(document, 'pointerdown', (event) => {
			if (this.opened && !this.root.contains(event.target)) this.close();
		});
		this._render();
		// Keep the most recent initial chip visible when multi-select overflows.
		if (this.options.multiple) this.chips.scrollLeft = this.chips.scrollWidth;
		return this;
	}

	_build() {
		this.root = createElement('div', 'mselect-root');
		if (this.options.className) {
			for (const name of String(this.options.className).split(/\s+/).filter(Boolean)) {
				this.root.classList.add(name);
			}
		}
		if (this.options.label) {
			const label = createElement('label', 'mselect-label', String(this.options.label));
			label.htmlFor = `${this.instanceId}-input`;
			this.root.appendChild(label);
		}

		this.control = createElement('div', 'mselect-control');
		this.chips = createElement('div', 'mselect-chips');
		this.input = createElement('input', 'mselect-input');
		this.input.type = 'search';
		this.input.id = `${this.instanceId}-input`;
		this.input.autocomplete = 'off';
		this.input.placeholder = this.options.strings.placeholder;
		this.input.setAttribute('role', 'combobox');
		this.input.setAttribute('aria-autocomplete', 'list');
		this.input.setAttribute('aria-haspopup', 'listbox');
		this.input.setAttribute('aria-controls', `${this.instanceId}-list`);
		this.input.setAttribute('aria-describedby', `${this.instanceId}-status ${this.instanceId}-backspace-hint`);
		this.input.setAttribute('aria-expanded', 'false');
		if (this.options.labelledBy) this.input.setAttribute('aria-labelledby', this.options.labelledBy);
		else if (!this.options.label) this.input.setAttribute('aria-label', this.options.ariaLabel || 'Select an option');
		if (this.options.required) this.input.setAttribute('aria-required', 'true');

		this.toggle = createElement('button', 'mselect-toggle');
		this.toggle.type = 'button';
		this.toggle.setAttribute('aria-label', this.options.strings.showOptions);
		this.toggle.setAttribute('aria-controls', `${this.instanceId}-list`);
		this.toggle.setAttribute('aria-expanded', 'false');
		this.toggle.appendChild(createElement('span', 'mselect-chevron'));

		this.control.append(this.chips, this.input, this.toggle);
		this.root.appendChild(this.control);
		const backspaceHint = createElement('span', 'mselect-visually-hidden', this.options.strings.backspaceHint);
		backspaceHint.id = `${this.instanceId}-backspace-hint`;
		this.announcement = createElement('span', 'mselect-visually-hidden');
		this.announcement.setAttribute('role', 'status');
		this.announcement.setAttribute('aria-live', 'polite');
		this.announcement.setAttribute('aria-atomic', 'true');
		this.root.append(backspaceHint, this.announcement);

		this.popup = createElement('div', 'mselect-popup');
		this.popup.hidden = true;
		this.list = createElement('div', 'mselect-list');
		this.list.id = `${this.instanceId}-list`;
		this.list.setAttribute('role', 'listbox');
		this.list.setAttribute('aria-label', this.options.strings.options);
		if (this.options.multiple) this.list.setAttribute('aria-multiselectable', 'true');
		this.status = createElement('div', 'mselect-status');
		this.status.id = `${this.instanceId}-status`;
		this.status.setAttribute('role', 'status');
		this.status.setAttribute('aria-live', 'polite');
		this.moreButton = createElement('button', 'mselect-more', this.options.strings.loadMore);
		this.moreButton.type = 'button';
		this.popup.append(this.list, this.status, this.moreButton);
		this.root.appendChild(this.popup);
		this.hiddenFields = createElement('div', 'mselect-hidden-fields');
		this.hiddenFields.hidden = true;
		this.root.appendChild(this.hiddenFields);
	}

	_listen(element, type, listener) {
		element.addEventListener(type, listener);
		this.listeners.push(() => element.removeEventListener(type, listener));
	}

	_cancelSearch() {
		this.requestId += 1;
		if (this.searchTimer !== null) clearTimeout(this.searchTimer);
		this.searchTimer = null;
		if (this.abortController) this.abortController.abort();
		this.abortController = null;
		this.pending = false;
		this.loading = false;
	}

	_queueSearch(delay = 0) {
		this._cancelSearch();
		this.results = [];
		this.offset = 0;
		this.activeIndex = -1;
		this.hasMore = false;
		this.error = false;
		if (!this.opened || this.options.disabled) return;
		if (this.query.trim().length < this.options.minChars) {
			this._render();
			return;
		}
		this.pending = true;
		this._render();
		if (delay === 0) {
			void this._loadPage(true);
		} else {
			this.searchTimer = setTimeout(() => {
				this.searchTimer = null;
				void this._loadPage(true);
			}, delay);
		}
	}

	async _loadPage(reset) {
		if (!this.opened || this.options.disabled) return;
		if (!reset && (this.loading || !this.hasMore)) return;
		const requestId = ++this.requestId;
		const controller = new AbortController();
		this.abortController = controller;
		this.loading = true;
		this.pending = false;
		this.error = false;
		this._render();
		const offset = reset ? 0 : this.offset;
		try {
			let page;
			if (this.options.source) {
				page = await this.options.source({
					query: this.query.trim(),
					limit: this.options.limit,
					offset,
					signal: controller.signal
				});
			} else {
				const matches = filterItems(this.items, this.query);
				page = {
					items: matches.slice(offset, offset + this.options.limit),
					hasMore: matches.length > offset + this.options.limit
				};
			}
			if (requestId !== this.requestId || !this.opened) return;
			const { items, hasMore } = normalizePage(page, this.options.limit);
			const seen = new Set(reset ? [] : this.results.map((item) => item.value));
			const next = items.filter((item) => !seen.has(item.value));
			this.results = reset ? next : [...this.results, ...next];
			this.offset = offset + items.length;
			this.hasMore = hasMore && items.length > 0;
			if (this.activeIndex === -1) this.activeIndex = this.results.findIndex((item) => !item.disabled);
		} catch (error) {
			if (requestId !== this.requestId || controller.signal.aborted) return;
			this.error = true;
			this.hasMore = false;
			if (typeof this.options.onError === 'function') this.options.onError(error);
		} finally {
			if (requestId === this.requestId) {
				const restoreFocus = document.activeElement === this.moreButton && !this.hasMore;
				this.loading = false;
				this.abortController = null;
				this._render();
				if (restoreFocus) this.input.focus();
			}
		}
	}

	/** Load the next page using the current query and the same source contract. */
	async loadMore() {
		return this._loadPage(false);
	}

	/** Open the dropdown, without querying remote sources below minChars. */
	open() {
		if (!this.initialized) this.init();
		if (this.options.disabled || this.opened) return this;
		this.opened = true;
		this.input.focus();
		this._queueSearch(0);
		return this;
	}

	/** Dismiss the dropdown and uncommitted search text, preserving selection. */
	close() {
		if (!this.opened) return this;
		this.opened = false;
		this.optionPointerActive = false;
		this._cancelSearch();
		this.query = '';
		this.input.value = '';
		this.results = [];
		this.activeIndex = -1;
		this._render();
		return this;
	}

	_onKeydown(event) {
		if (this.options.disabled) return;
		if (event.key === 'Backspace' && !event.isComposing &&
			!event.altKey && !event.ctrlKey && !event.metaKey &&
			this.input.value === '' && this.selected.size) {
			event.preventDefault();
			// Holding the key must not erase several selected items at once.
			if (!event.repeat) {
				const item = [...this.selected.values()].pop();
				const next = new Map(this.selected);
				next.delete(item.value);
				this._commitSelection(next);
				this.announcement.textContent = interpolate(this.options.strings.removed, { label: item.label });
			}
			return;
		}
		if (event.key === 'Escape' && this.opened) {
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key === 'Tab') {
			this.close();
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!this.opened) {
				this.open();
				return;
			}
			const step = event.key === 'ArrowDown' ? 1 : -1;
			const length = this.results.length;
			if (!length) return;
			for (let count = 0; count < length; count += 1) {
				const index = (this.activeIndex + step + length) % length;
				this.activeIndex = index;
				if (!this.results[index].disabled) break;
			}
			this._renderResults();
			return;
		}
		if (event.key === 'Enter' && this.opened && this.activeIndex >= 0 && !this.loading) {
			event.preventDefault();
			this._selectIndex(this.activeIndex);
		}
	}

	_selectIndex(index) {
		const item = this.results[index];
		if (!item || item.disabled || this.options.disabled) return;
		const next = new Map(this.selected);
		if (this.options.multiple && next.has(item.value)) next.delete(item.value);
		else {
			if (!this.options.multiple) next.clear();
			next.set(item.value, item);
		}
		this._commitSelection(next);
		// Refocus while still open: focusing after close() would trigger the
		// focus-to-open listener and immediately reopen single-select results.
		this.input.focus();
		if (this.options.closeOnSelect) this.close();
		else if (this.input.value !== '' || this.query !== '') {
			// In multi-select the field should be empty after selection so the
			// next Backspace can remove the last chip, not edit stale search text.
			this.query = '';
			this.input.value = '';
			this._queueSearch(0);
		}
	}

	_setValue(value, explicitItems = []) {
		const input = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
		const seeded = normalizeItems(explicitItems);
		const pool = [...seeded, ...this.items, ...this.results];
		const available = new Map(pool.map((item) => [item.value, item]));
		const next = new Map();
		for (const candidate of input) {
			const entry = (candidate && typeof candidate === 'object' && !Array.isArray(candidate))
				? normalizeItems([candidate])[0]
				: null;
			const key = entry?.value ?? String(candidate);
			if (candidate === null || candidate === undefined || key === '' || next.has(key)) continue;
			next.set(key, entry ?? available.get(key) ?? this.selected.get(key) ?? {
				value: key, label: key, description: '', disabled: false
			});
			if (!this.options.multiple) break;
		}
		return next;
	}

	_commitSelection(next, silent = false) {
		const oldKeys = [...this.selected.keys()];
		const newKeys = [...next.keys()];
		this.selected = next;
		if (this.announcement) this.announcement.textContent = '';
		this._render();
		// Newly appended chips must remain visible in the one-line scroll area.
		if (this.options.multiple && newKeys.some((key) => !oldKeys.includes(key))) {
			this.chips.scrollLeft = this.chips.scrollWidth;
		}
		if (!silent && JSON.stringify(oldKeys) !== JSON.stringify(newKeys)) {
			const value = this.getValue();
			const items = this.getSelectedItems();
			if (typeof this.options.onChange === 'function') this.options.onChange(value, items);
			if (this.root) this.root.dispatchEvent(new CustomEvent('modularselect:change', {
				bubbles: true,
				detail: { value, items }
			}));
		}
	}

	/** Set scalar/array values or {value,label} options. Unknown values show their ID. */
	setValue(value, { selectedItems = [], silent = false } = {}) {
		this._commitSelection(this._setValue(value, selectedItems), silent);
		return this;
	}

	/** Return a string or null in single mode, and an array of strings in multiple mode. */
	getValue() {
		const values = [...this.selected.keys()];
		return this.options.multiple ? values : (values[0] ?? null);
	}

	getSelectedItems() {
		return [...this.selected.values()].map((item) => ({ ...item }));
	}

	clear() {
		return this.setValue(null);
	}

	/** Replace static options without creating another source or selection store. */
	setItems(items) {
		if (this.options.source) throw new Error('setItems is only available for static selects.');
		this.items = normalizeItems(items);
		this.options.items = items;
		const byKey = new Map(this.items.map((item) => [item.value, item]));
		for (const [key, item] of this.selected.entries()) {
			if (byKey.has(key)) this.selected.set(key, byKey.get(key));
		}
		if (this.opened) this._queueSearch(0);
		else this._render();
		return this;
	}

	setDisabled(disabled) {
		this.options.disabled = Boolean(disabled);
		if (disabled) this.close();
		this._render();
		return this;
	}

	/** Re-run the active search, e.g. after a remote data update. */
	refresh() {
		if (this.opened) this._queueSearch(0);
		return this;
	}

	_render() {
		if (!this.root) return;
		this.root.classList.toggle('mselect-disabled', Boolean(this.options.disabled));
		this.popup.hidden = !this.opened;
		this.input.disabled = Boolean(this.options.disabled);
		this.input.setAttribute('aria-expanded', String(this.opened));
		this.toggle.disabled = Boolean(this.options.disabled);
		this.toggle.setAttribute('aria-expanded', String(this.opened));
		this.toggle.setAttribute('aria-label', this.options.strings[this.opened ? 'hideOptions' : 'showOptions']);
		this.input.placeholder = this.selected.size ? '' : this.options.strings.placeholder;
		this._renderChips();
		this._renderResults();
		this._syncFormFields();
		this._syncValidity();
	}

	_renderChips() {
		this.chips.replaceChildren();
		for (const item of this.selected.values()) {
			const chip = createElement('span', 'mselect-chip');
			const label = createElement('span', 'mselect-chip-label', item.label);
			label.title = item.label; // Preserve the full label on hover when truncated.
			const remove = createElement('button', 'mselect-chip-remove', '×');
			remove.type = 'button';
			remove.disabled = Boolean(this.options.disabled);
			remove.setAttribute('aria-label', interpolate(this.options.strings.remove, { label: item.label }));
			remove.addEventListener('click', () => {
				const next = new Map(this.selected);
				next.delete(item.value);
				this._commitSelection(next);
				this.input.focus();
			});
			chip.append(label, remove);
			this.chips.appendChild(chip);
		}
	}

	_renderResults() {
		this.list.replaceChildren();
		if (!this.opened) {
			this.input.removeAttribute('aria-activedescendant');
			this.status.textContent = '';
			this.moreButton.hidden = true;
			return;
		}
		for (const [index, item] of this.results.entries()) {
			const option = createElement('div', 'mselect-option');
			option.id = `${this.instanceId}-option-${index}`;
			option.setAttribute('role', 'option');
			option.dataset.index = String(index);
			option.setAttribute('aria-selected', String(this.selected.has(item.value)));
			if (item.disabled) {
				option.classList.add('mselect-option-disabled');
				option.setAttribute('aria-disabled', 'true');
			}
			if (index === this.activeIndex) option.classList.add('mselect-option-active');
			option.appendChild(createElement('span', 'mselect-option-label', item.label));
			if (item.description) option.appendChild(createElement('span', 'mselect-option-description', item.description));
			this.list.appendChild(option);
		}
		const active = this.results[this.activeIndex];
		if (active && !active.disabled) {
			this.input.setAttribute('aria-activedescendant', `${this.instanceId}-option-${this.activeIndex}`);
			this.list.children[this.activeIndex]?.scrollIntoView?.({ block: 'nearest' });
		} else this.input.removeAttribute('aria-activedescendant');

		if (this.error) this.status.textContent = this.options.strings.searchError;
		else if (this.pending || this.loading) this.status.textContent = this.options.strings.loading;
		else if (this.query.trim().length < this.options.minChars) {
			this.status.textContent = interpolate(this.options.strings.minChars, { count: this.options.minChars });
		} else if (!this.results.length) this.status.textContent = this.options.strings.noResults;
		else this.status.textContent = interpolate(this.options.strings.results, { count: this.results.length });
		this.moreButton.hidden = !this.hasMore || this.pending;
		this.moreButton.setAttribute('aria-disabled', String(this.loading));
		this.moreButton.textContent = this.loading ? this.options.strings.loading : this.options.strings.loadMore;
	}

	_syncFormFields() {
		this.hiddenFields.replaceChildren();
		if (!this.options.name) return;
		for (const value of this.selected.keys()) {
			const field = createElement('input', '');
			field.type = 'hidden';
			field.name = this.options.name;
			field.value = value;
			field.disabled = Boolean(this.options.disabled);
			this.hiddenFields.appendChild(field);
		}
	}

	_syncValidity() {
		if (!this.input) return;
		this.input.setCustomValidity(this.options.required && !this.selected.size
			? this.options.strings.required : '');
	}

	/** Release document listeners, pending requests and every DOM node this instance owns. */
	destroy() {
		this._cancelSearch();
		this.optionPointerActive = false;
		for (const dispose of this.listeners.splice(0)) dispose();
		this.root?.remove();
		this.root = null;
		this.input = null;
		this.initialized = false;
		this.opened = false;
		return this;
	}
}
