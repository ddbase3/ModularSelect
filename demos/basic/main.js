import { ModularSelect } from '../../src/index.js';

const items = [
	{ value: 'one', label: 'Alpha', description: 'First example' },
	{ value: 'two', label: 'Bravo', description: 'Second example' },
	{ value: 'three', label: 'Charlie', description: 'Third example', disabled: true },
	{ value: 'four', label: '<img src=x onerror=alert(1)>', description: 'Rendered as text, not HTML' }
];
const output = document.querySelector('#output');
const show = () => { output.textContent = JSON.stringify({ single: single.getValue(), multi: multi.getValue() }, null, 2); };

const single = new ModularSelect('#single', {
	label: 'Single value', name: 'item', items,
	onChange: show
}).init();
const multi = new ModularSelect('#multiple', {
	label: 'Multiple values', name: 'items[]', multiple: true, items,
	value: ['two'], onChange: show
}).init();
show();
