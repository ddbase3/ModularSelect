import { ModularSelect } from '../../src/index.js';

const options = Array.from({ length: 60 }, (_, index) => ({
	value: String(index + 1),
	label: `Example item ${String(index + 1).padStart(2, '0')}`
}));

const select = new ModularSelect('#select', {
	label: 'Find an item',
	multiple: true,
	minChars: 1,
	limit: 6,
	debounceMs: 200,
	selectedItems: [{ value: '25', label: 'Example item 25' }],
	value: ['25'],
	async source({ query, limit, offset, signal }) {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(resolve, 180);
			signal.addEventListener('abort', () => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			}, { once: true });
		});
		const found = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
		return { items: found.slice(offset, offset + limit), hasMore: offset + limit < found.length };
	},
	onChange: (value) => { document.querySelector('#output').textContent = JSON.stringify(value, null, 2); }
}).init();

document.querySelector('#output').textContent = JSON.stringify(select.getValue());
