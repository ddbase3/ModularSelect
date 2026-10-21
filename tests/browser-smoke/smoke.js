import { ModularSelect } from '../../src/index.js';

const output = document.querySelector('#results');
const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
let assertions = 0;
function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Assertion ${assertions}: ${message}`);
}

async function run() {
  window.modularSelectXss = false;
  const evilLabel = '<img src=x onerror="window.modularSelectXss=true">';
  const single = new ModularSelect('#static', {
    label: 'Single', name: 'kind', required: true,
    items: [
      { value: 1, label: 'Alpha' },
      { value: 2, label: 'Bravo' },
      { value: 3, label: evilLabel, description: evilLabel },
      { value: 4, label: 'Disabled option', disabled: true }
    ]
  }).init();
  assert(!single.input.checkValidity(), 'required select starts invalid');
  assert(single.input.getAttribute('role') === 'combobox', 'combobox semantics');
  assert(single.input.getAttribute('aria-controls') === single.list.id, 'listbox association');
  assert(single.list.getAttribute('role') === 'listbox', 'listbox semantics');
  single.input.focus();
  await pause();
  assert(single.results.length === 4, 'static search loads options');
  assert(single.list.querySelector('img') === null, 'labels never parsed as HTML');
  assert(!window.modularSelectXss, 'no injected JS executed');
  assert(single.list.textContent.includes(evilLabel), 'special chars rendered literally');
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  assert(single.activeIndex === 1, 'ArrowDown moves active option');
  assert(single.input.getAttribute('aria-activedescendant')?.endsWith('-option-1'), 'active option announced');
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  assert(single.activeIndex === 0, 'ArrowUp moves to previous option');
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  assert(single.activeIndex === 2, 'keyboard skips disabled option');
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  assert(!single.opened && single.input.getAttribute('aria-expanded') === 'false', 'Escape closes dropdown');
  single.open();
  await pause();
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  assert(single.getValue() === '1', 'Enter selects active option');
  assert(single.input.checkValidity(), 'selected required value valid');
  assert(single.root.querySelector('input[type=hidden][name=kind]').value === '1', 'native field matches selected ID');
  assert(single.input.getAttribute('aria-describedby').includes('-backspace-hint'), 'combobox describes Backspace removal');
  const removeSingle = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' });
  single.input.dispatchEvent(removeSingle);
  assert(removeSingle.defaultPrevented && single.getValue() === null, 'Backspace removes single selection');
  assert(single.announcement.textContent === 'Removed Alpha.', 'Backspace removal announced');
  assert(single.root.querySelectorAll('input[type=hidden]').length === 0, 'Backspace updates native field');
  single.setValue('2');
  assert(single.getSelectedItems()[0].label === 'Bravo', 'static label resolves by ID');
  single.open();
  await pause();
  const singleOption = single.list.querySelector('[data-index="0"]');
  const singlePointer = new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'mouse', button: 0
  });
  singleOption.dispatchEvent(singlePointer);
  assert(singlePointer.defaultPrevented, 'pointerdown prevents mouse focus loss on option');
  singleOption.click();
  assert(single.getValue() === '1', 'pointer selection works');
  assert(!single.opened && single.options.closeOnSelect, 'single selection closes menu');
  single.clear();
  assert(single.getValue() === null, 'clear removes selection');
  assert(single.root.querySelectorAll('input[type=hidden]').length === 0, 'clear removes submitted field');
  single.input.focus();
  await pause();
  single.input.value = 'Disabled';
  single.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await pause(300);
  assert(single.results.length === 1 && single.results[0].disabled, 'search includes disabled results');
  single.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  assert(single.getValue() === null, 'disabled option cannot be selected');
  single.close();

  const multi = new ModularSelect('#multiple', {
    label: 'Many', multiple: true, name: 'things[]',
    items: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }],
    value: ['a']
  }).init();
  assert(multi.getSelectedItems()[0].label === 'Apple', 'initial value resolves to static label');
  multi.input.focus();
  await pause();
  const multiOption = multi.list.querySelector('[data-index="1"]');
  const multiPointer = new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'mouse', button: 0
  });
  multiOption.dispatchEvent(multiPointer);
  assert(multiPointer.defaultPrevented, 'multi uses the same pointer interaction');
  multiOption.click();
  assert(JSON.stringify(multi.getValue()) === '["a","b"]', 'multi selects multiple values');
  assert(multi.opened && !multi.options.closeOnSelect, 'multi stays open by default');
  assert(multi.list.querySelector('[data-index="1"]').getAttribute('aria-selected') === 'true',
    'multi options expose selected state');
  const touchPointer = new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerType: 'touch', button: 0
  });
  multi.list.querySelector('[data-index="0"]').dispatchEvent(touchPointer);
  assert(!touchPointer.defaultPrevented, 'touch options keep native scrolling');
  multi.list.querySelector('[data-index="0"]').click();
  assert(JSON.stringify(multi.getValue()) === '["b"]', 'touch can toggle selected value');
  assert(multi.root.querySelectorAll('input[name="things[]"]').length === 1, 'multi fields mirror selected IDs');
  assert(multi.list.getAttribute('aria-multiselectable') === 'true', 'multi listbox semantics');
  const removeMulti = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' });
  multi.input.dispatchEvent(removeMulti);
  assert(removeMulti.defaultPrevented && JSON.stringify(multi.getValue()) === '[]', 'Backspace removes last multi chip');
  multi.setValue(['b']);
  multi.root.querySelector('.mselect-chip-remove').click();
  assert(JSON.stringify(multi.getValue()) === '[]', 'named chip button removes selection');
  multi.setValue(['a', 'b']);
  multi.setDisabled(true);
  assert(multi.input.disabled && [...multi.root.querySelectorAll('input[type=hidden]')].every((field) => field.disabled),
    'disabled state prevents form submission');
  multi.setDisabled(false);

  const pending = [];
  const remote = new ModularSelect('#remote', {
    label: 'Async', limit: 2, debounceMs: 0,
    async source(args) { return new Promise((resolve) => pending.push({ ...args, resolve })); }
  }).init();
  remote.input.focus();
  assert(pending.length === 0, 'remote source not called for blank search');
  remote.input.value = 'first';
  remote.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  assert(pending.length === 1 && pending[0].query === 'first', 'remote query forwarded');
  remote.input.value = 'second';
  remote.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  assert(pending.length === 2 && pending[0].signal.aborted, 'stale query aborted');
  pending[1].resolve({ items: [
    { value: 7, label: 'Second option' },
    { value: 8, label: 'Second second' }
  ], hasMore: true });
  await pause();
  pending[0].resolve({ items: [{ value: 99, label: 'STALE' }] });
  await pause();
  assert(remote.results.length === 2 && !remote.list.textContent.includes('STALE'), 'late stale result ignored');
  assert(!remote.moreButton.hidden, 'next-page button shown');
  remote.moreButton.focus();
  const nextPage = remote.loadMore();
  assert(pending.length === 3 && pending[2].offset === 2, 'remote offset advances by loaded items');
  pending[2].resolve({ items: [{ value: '9', label: 'Third option' }], hasMore: false });
  await nextPage;
  assert(remote.results.length === 3 && remote.moreButton.hidden, 'pagination appends and stops');
  assert(document.activeElement === remote.input, 'focus restored after final page');
  remote.list.querySelector('[data-index="2"]').click();
  assert(remote.getValue() === '9', 'remote option can be selected');
  remote.input.focus();
  remote.input.value = 'pending';
  remote.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  assert(pending.length === 4, 'new remote request queued');
  remote.destroy();
  pending[3].resolve({ items: [{ value: 'gone', label: 'Gone' }] });
  await pause();
  assert(!document.querySelector('#remote .mselect-root'), 'destroy removes the component');

  const fail = new ModularSelect('#error', {
    label: 'Error', debounceMs: 0,
    source: async () => { throw new Error('Backend details must not appear in UI'); }
  }).init();
  fail.input.focus();
  fail.input.value = 'foo';
  fail.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await pause();
  assert(fail.status.textContent === 'Options could not be loaded.', 'generic error shown');
  assert(!fail.status.textContent.includes('Backend details'), 'source errors not disclosed by UI');

  single.destroy();
  multi.destroy();
  fail.destroy();
}

async function runChecked() {
  try {
    await run();
    output.textContent = `PASS (${assertions} assertions)`;
    window.modularSelectSmoke = { ok: true, assertions };
  } catch (error) {
    output.textContent = `FAIL (${assertions} assertions): ${error.stack || error}`;
    window.modularSelectSmoke = { ok: false, error: String(error), assertions };
  }
}

void runChecked();
