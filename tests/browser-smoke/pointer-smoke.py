"""Real keyboard, mouse and touch browser regression for ModularSelect (optional Playwright).

Run: python3 tests/browser-smoke/pointer-smoke.py
Requires the Python Playwright package and Chromium; makes no HTTP requests.
"""

import base64
from pathlib import Path
import os
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
assertions = 0


def load_demo(page, kind):
    """Serve the module as data URLs so CI/browser restrictions need no localhost."""
    def read(path):
        return (ROOT / path).read_text(encoding='utf-8')

    def as_module(text):
        return 'data:text/javascript;base64,' + base64.b64encode(text.encode()).decode()

    utility_url = as_module(read('src/utils/options.js'))
    module_url = as_module(read('src/ModularSelect.js').replace(
        "from './utils/options.js'", f"from '{utility_url}'"
    ))
    html = read(f'demos/{kind}/index.html')
    html = html.replace('<link rel="stylesheet" href="../../src/styles/modularselect.css">', '')
    html = html.replace('<script type="module" src="./main.js"></script>', '')
    script = read(f'demos/{kind}/main.js').replace("from '../../src/index.js'", f"from '{module_url}'")
    page.set_content(html)
    page.add_style_tag(content=read('src/styles/modularselect.css'))
    page.add_script_tag(type='module', content=script)
    page.locator('.mselect-root').first.wait_for()


def values(page):
    import json
    return json.loads(page.locator('#output').inner_text())


def check(condition, description):
    global assertions
    assertions += 1
    if not condition:
        raise AssertionError(f'Assertion {assertions}: {description}')


def wait_result(page, prefix, text):
    row = page.locator(f'{prefix} .mselect-option').filter(has_text=text).first
    row.wait_for()
    return row


def inject_host_focusout(page, root):
    """Emulate an external UI shifting focus while an option is pressed.

    The older code removed the option on focusout, before the click could
    commit it. The guard must preserve the option until pointer activation.
    """
    page.evaluate('''root => {
        const list = document.querySelector(root + ' .mselect-list');
        let outside = document.querySelector('#external-focus');
        if (!outside) {
            outside = document.createElement('button');
            outside.id = 'external-focus';
            outside.textContent = 'Outside control';
            document.body.appendChild(outside);
        }
        list.addEventListener('pointerdown', event => {
            if (!event.target.closest('.mselect-option')) return;
            const input = document.querySelector(root + ' .mselect-input');
            input.dispatchEvent(new FocusEvent('focusout', {
                bubbles: true, relatedTarget: outside
            }));
        }, {once: true});
    }''', root)


def desktop(browser):
    page = browser.new_page(viewport={'width': 850, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    load_demo(page, 'basic')
    single_input = page.locator('#single .mselect-input')
    single_input.fill('Alpha')
    wait_result(page, '#single', 'Alpha').click()  # Real pointer, not element.click().
    check(values(page)['single'] == 'one', 'mouse single: selected value must change')
    check(page.locator('#single .mselect-popup').is_hidden(), 'mouse single: closes dropdown')
    check(page.locator('#single .mselect-chip-label').inner_text() == 'Alpha', 'mouse single: label visible')
    check(page.locator('#single input[name=item]').input_value() == 'one', 'mouse single: hidden input')
    check(single_input.evaluate('(e) => document.activeElement === e'), 'mouse single: focus remains on combobox')

    single_input.fill('Bravo')
    wait_result(page, '#single', 'Bravo').click()
    check(values(page)['single'] == 'two', 'mouse single: replaces prior value')
    check(page.locator('#single .mselect-chip').count() == 1, 'mouse single: one chip')
    check(page.locator('#single input[name=item]').input_value() == 'two', 'mouse single: form replacement')

    single_input.fill('Alpha')
    inject_host_focusout(page, '#single')
    wait_result(page, '#single', 'Alpha').click()
    check(values(page)['single'] == 'one', 'mouse single: premature host focusout must not lose click')
    check(page.locator('#single .mselect-popup').is_hidden(), 'mouse single: closes after host focusout')

    multi_input = page.locator('#multiple .mselect-input')
    multi_input.fill('Alpha')
    wait_result(page, '#multiple', 'Alpha').click()
    check(values(page)['multi'] == ['two', 'one'], 'mouse multi: second value appended')
    check(page.locator('#multiple .mselect-popup').is_visible(), 'mouse multi: dropdown stays open')
    check(multi_input.evaluate('(e) => document.activeElement === e'), 'mouse multi: input keeps focus')
    check(page.locator('#multiple input[name="items[]"]').count() == 2, 'mouse multi: two form fields')

    multi_input.fill('Bravo')
    inject_host_focusout(page, '#multiple')
    wait_result(page, '#multiple', 'Bravo').click()
    check(values(page)['multi'] == ['one'], 'mouse multi: selected item toggled off')
    check(page.locator('#multiple .mselect-popup').is_visible(), 'mouse multi: host focusout keeps dropdown open')
    multi_input.fill('Alpha')
    wait_result(page, '#multiple', 'Alpha').click()
    check(values(page)['multi'] == [], 'mouse multi: second item toggled off')
    check(page.locator('#multiple input[name="items[]"]').count() == 0, 'mouse multi: no stale hidden fields')

    multi_input.fill('Bravo')
    wait_result(page, '#multiple', 'Bravo')
    multi_input.press('Enter')
    check(values(page)['multi'] == ['two'], 'multi: keyboard selection after pointer toggling')
    page.locator('#multiple .mselect-chip-remove').click()
    check(values(page)['multi'] == [], 'multi: chip removal')

    # Async data source: real pointer selection and pagination remain usable.
    load_demo(page, 'async')
    remote_input = page.locator('#select .mselect-input')
    remote_input.fill('item 1')
    wait_result(page, '#select', 'Example item 10').click()
    check(values(page) == ['25', '10'], 'mouse async multi: selection appended')
    check(page.locator('#select .mselect-popup').is_visible(), 'mouse async multi: stays open')
    remote_input.fill('item')
    page.locator('#select .mselect-more').click()
    page.wait_for_function("() => document.querySelectorAll('#select .mselect-option').length >= 12")
    wait_result(page, '#select', 'Example item 08').click()
    check(values(page) == ['25', '10', '8'], 'mouse async multi: paginated option selected')
    check(errors == [], f'no JavaScript errors: {errors}')
    page.close()


def touch(browser):
    context = browser.new_context(has_touch=True, is_mobile=True, viewport={'width': 390, 'height': 780})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    load_demo(page, 'basic')
    page.locator('#single .mselect-input').fill('Alpha')
    wait_result(page, '#single', 'Alpha').tap()
    check(values(page)['single'] == 'one', 'touch single: item selected')
    check(page.locator('#single .mselect-popup').is_hidden(), 'touch single: popup closes')
    page.locator('#multiple .mselect-input').fill('Alpha')
    wait_result(page, '#multiple', 'Alpha').tap()
    check(values(page)['multi'] == ['two', 'one'], 'touch multi: append item')
    check(page.locator('#multiple .mselect-popup').is_visible(), 'touch multi: popup stays open')
    page.locator('#multiple .mselect-input').fill('Bravo')
    wait_result(page, '#multiple', 'Bravo').tap()
    check(values(page)['multi'] == ['one'], 'touch multi: toggles selected item')
    check(errors == [], f'no JavaScript errors on touch: {errors}')
    context.close()

def keyboard(browser):
    page = browser.new_page(viewport={'width': 850, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    load_demo(page, 'basic')

    single = page.locator('#single .mselect-input')
    single.fill('Alpha')
    wait_result(page, '#single', 'Alpha')
    single.press('Enter')
    check(values(page)['single'] == 'one', 'keyboard single: Enter selects the option')
    check(single.input_value() == '', 'keyboard single: selection clears search text')
    check(single.evaluate('(el) => document.activeElement === el'), 'keyboard single: focus remains on input')
    single.press('Backspace')
    check(values(page)['single'] is None, 'keyboard single: Backspace deselects')
    check(page.locator('#single .mselect-chip').count() == 0, 'keyboard single: chip removed')
    check(page.locator('#single input[name=item]').count() == 0, 'keyboard single: form field removed')
    check('Removed Alpha.' in page.locator('#single [aria-live="polite"]').all_text_contents(),
          'keyboard single: removal is announced')
    check(single.evaluate('(el) => document.activeElement === el'), 'keyboard single: focus preserved after removal')

    multi = page.locator('#multiple .mselect-input')
    multi.fill('Alpha')
    wait_result(page, '#multiple', 'Alpha')
    multi.press('Enter')
    check(values(page)['multi'] == ['two', 'one'], 'keyboard multi: Enter appends selected option')
    check(multi.input_value() == '', 'keyboard multi: selection clears typed search')
    check(page.locator('#multiple .mselect-popup').is_visible(), 'keyboard multi: dropdown remains open')
    multi.press('Backspace')
    check(values(page)['multi'] == ['two'], 'keyboard multi: Backspace removes last selection')
    check(page.locator('#multiple input[name="items[]"]').count() == 1, 'keyboard multi: form fields follow removal')
    multi.press('Backspace')
    check(values(page)['multi'] == [], 'keyboard multi: second Backspace removes preceding selection')
    multi.press('Backspace')
    check(values(page)['multi'] == [], 'keyboard multi: empty selection remains empty')

    multi.fill('Bravo')
    wait_result(page, '#multiple', 'Bravo')
    multi.press('Enter')
    check(values(page)['multi'] == ['two'], 'keyboard multi: selection can be re-added')
    multi.fill('Al')
    multi.press('Backspace')
    check(values(page)['multi'] == ['two'] and multi.input_value() == 'A',
          'keyboard multi: Backspace edits search text first')
    multi.press('Backspace')
    check(values(page)['multi'] == ['two'] and multi.input_value() == '',
          'keyboard multi: deleting final search character keeps selection')
    result = multi.evaluate('''el => {
        const repeated = new KeyboardEvent('keydown', {
            key: 'Backspace', bubbles: true, cancelable: true, repeat: true
        });
        el.dispatchEvent(repeated);
        return repeated.defaultPrevented;
    }''')
    check(result and values(page)['multi'] == ['two'], 'keyboard multi: key repeat does not erase several chips')
    result = multi.evaluate('''el => {
        const composing = new KeyboardEvent('keydown', {
            key: 'Backspace', bubbles: true, cancelable: true, isComposing: true
        });
        el.dispatchEvent(composing);
        return composing.defaultPrevented;
    }''')
    check(not result and values(page)['multi'] == ['two'], 'keyboard multi: IME composition not intercepted')
    multi.press('Backspace')
    check(values(page)['multi'] == [], 'keyboard multi: empty search Backspace removes last chip')
    check(page.locator('#multiple input[name="items[]"]').count() == 0,
          'keyboard multi: native form value removed')

    load_demo(page, 'async')
    remote = page.locator('#select .mselect-input')
    remote.fill('item 1')
    wait_result(page, '#select', 'Example item 10')
    remote.press('Enter')
    check(values(page) == ['25', '10'], 'keyboard async multi: Enter adds remote option')
    check(remote.input_value() == '', 'keyboard async multi: search cleared after selection')
    remote.press('Backspace')
    check(values(page) == ['25'], 'keyboard async multi: removes last remote selection')
    check(errors == [], f'keyboard: no JavaScript errors: {errors}')
    page.close()


def main():
    with sync_playwright() as playwright:
        chromium = os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if chromium:
            launch['executable_path'] = chromium
        browser = playwright.chromium.launch(**launch)
        try:
            desktop(browser)
            touch(browser)
            keyboard(browser)
            print(f'PASS: {assertions} real mouse/touch/keyboard browser checks')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
