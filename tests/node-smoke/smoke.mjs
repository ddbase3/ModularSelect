import assert from 'node:assert/strict';
import { normalizeItems, filterItems, normalizePage, ModularSelect } from '../../src/index.js';

const options = normalizeItems([
  { value: 1, label: 'Max Müller', description: 'alpha' },
  { value: 2, label: 'Julia', description: 'Beta' },
  { value: '1', label: 'duplicate ID' },
  3
]);
assert.deepEqual(options.map(({ value }) => value), ['1', '2', '3']);
assert.equal(options[0].label, 'Max Müller');
assert.deepEqual(filterItems(options, 'mÜlLeR').map(({ value }) => value), ['1']);
assert.deepEqual(filterItems(options, 'BETA').map(({ value }) => value), ['2']);
assert.deepEqual(filterItems(options, '3').map(({ value }) => value), ['3']);
assert.equal(normalizePage([{ value: 'a' }, { value: 'b' }], 2).hasMore, true);
assert.equal(normalizePage({ items: options, hasMore: false }, 20).hasMore, false);
assert.throws(() => normalizeItems([{ label: 'missing value' }]), TypeError);
assert.throws(() => normalizePage({ data: [] }, 10), TypeError);
assert.throws(() => new ModularSelect(null, { limit: 0 }), RangeError);
assert.throws(() => new ModularSelect(null, { debounceMs: -1 }), RangeError);
assert.throws(() => new ModularSelect(null, { source: 'not a function' }), TypeError);

const single = new ModularSelect(null, { items: options, value: 1 });
assert.equal(single.options.multiple, false);
assert.equal(single.options.closeOnSelect, true);
assert.equal(single.getValue(), '1');
assert.equal(single.getSelectedItems()[0].label, 'Max Müller');
single.setValue(2, { silent: true });
assert.equal(single.getValue(), '2');
single.clear();
assert.equal(single.getValue(), null);

const multi = new ModularSelect(null, {
  multiple: true,
  value: ['12', '24'],
  selectedItems: [{ value: '12', label: 'Alice' }, { value: '24', label: 'Bob' }]
});
assert.equal(multi.options.multiple, true);
assert.equal(multi.options.closeOnSelect, false);
assert.deepEqual(multi.getValue(), ['12', '24']);
assert.equal(multi.getSelectedItems()[0].label, 'Alice');
const selected = multi.getSelectedItems();
selected[0].label = 'changed outside';
assert.equal(multi.getSelectedItems()[0].label, 'Alice');
multi.setValue(['24', '12', '24']);
assert.deepEqual(multi.getValue(), ['24', '12']);
multi.clear();
assert.deepEqual(multi.getValue(), []);
console.log('ModularSelect node smoke tests passed.');
