"""Real-browser regression for long labels and narrow ModularSelect controls.

Run: python3 tests/browser-smoke/layout-smoke.py
Requires Playwright/Chromium. Uses only local demo data, without HTTP requests.
"""

import base64
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
LONG_UNBROKEN = 'VeryLongUnbrokenOptionLabel_' * 26
LONG_SPACED = 'Very long descriptive option label with spaces ' * 14
assertions = 0


def check(value, explanation):
    global assertions
    assertions += 1
    if not value:
        raise AssertionError(f'{assertions}: {explanation}')


def module_url(source):
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()


def load(page):
    utility = module_url((ROOT / 'src/utils/options.js').read_text(encoding='utf-8'))
    component = module_url((ROOT / 'src/ModularSelect.js').read_text(encoding='utf-8').replace(
        "from './utils/options.js'", f"from '{utility}'"
    ))
    page.set_content('''<!doctype html><html lang="en"><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      </head><body style="margin:0;padding:0;font:14px system-ui,sans-serif">
      <main style="max-width:460px;margin:auto;padding:5px">
      <div id="single"></div><div id="multi"></div></main></body></html>''')
    page.add_style_tag(content=(ROOT / 'src/styles/modularselect.css').read_text(encoding='utf-8'))
    script = '''import { ModularSelect } from '__MODULE__';
    const unbroken = __UNBROKEN__;
    const spaced = __SPACED__;
    const options = [
      {value: 'unbroken', label: unbroken},
      {value: 'spaced', label: spaced},
      {value: 'short', label: 'Short'},
      {value: 'zebra', label: 'Zebra'}
    ];
    window.layoutSelects = {
      single: new ModularSelect('#single', {label: 'Single', name: 'single', items: options,
        value: 'unbroken'}).init(),
      multi: new ModularSelect('#multi', {label: 'Multiple', name: 'multi[]', multiple: true,
        items: options, value: ['unbroken', 'spaced', 'short']}).init()
    };'''.replace('__MODULE__', component)
    import json
    script = script.replace('__UNBROKEN__', json.dumps(LONG_UNBROKEN))
    script = script.replace('__SPACED__', json.dumps(LONG_SPACED))
    page.add_script_tag(type='module', content=script)
    page.locator('#multi .mselect-chip').nth(2).wait_for()


def geometry(page, selector):
    return page.evaluate('''selector => {
      const root = document.querySelector(selector + ' .mselect-root');
      const take = name => root.querySelector('.mselect-' + name);
      const rect = el => {const r = el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
          center:(r.top+r.bottom)/2};};
      const control = take('control');
      const chips = take('chips');
      const label = take('chip-label');
      return {control:rect(control), input:rect(take('input')),
        toggle:rect(take('toggle')), chips:rect(chips), label:rect(label),
        overflow: control.scrollWidth - control.clientWidth,
        chipsOverflow: chips.scrollWidth - chips.clientWidth,
        chipsScrollLeft: chips.scrollLeft,
        labelClipped:label.scrollWidth > label.clientWidth,
        labelEllipsis: getComputedStyle(label).textOverflow === 'ellipsis',
        fullLabel:label.textContent, tooltip:label.title,
        chipCount:chips.querySelectorAll('.mselect-chip').length};
    }''', selector)


def check_layout(page, width):
    page.set_viewport_size({'width': width, 'height': 720})
    for selector in ('#single', '#multi'):
        item = geometry(page, selector)
        check(item['control']['height'] < 46, f'{selector} stays one line at {width}px')
        check(abs(item['toggle']['center'] - item['input']['center']) < 2,
              f'{selector} toggle and input on same row at {width}px')
        check(item['toggle']['right'] <= item['control']['right'] + 1,
              f'{selector} toggle stays inside right edge at {width}px')
        check(item['input']['width'] >= 71, f'{selector} input remains usable at {width}px')
        check(item['overflow'] <= 1, f'{selector} no horizontal control overflow at {width}px')
        check(item['labelClipped'] and item['labelEllipsis'],
              f'{selector} long label uses ellipsis at {width}px')
        check(item['fullLabel'] == LONG_UNBROKEN and item['tooltip'] == LONG_UNBROKEN,
              f'{selector} full label remains available in DOM and tooltip at {width}px')
    multi = geometry(page, '#multi')
    check(multi['chipCount'] == 3, f'multi selections preserved at {width}px')
    check(multi['chipsOverflow'] > 0 and multi['chipsScrollLeft'] > 0,
          f'multi chips scroll instead of wrapping at {width}px')


def interaction(page):
    # Keyboard replacement/Backspace must keep the layout and hidden fields valid.
    single = page.locator('#single .mselect-input')
    single.fill('Zebra')
    page.locator('#single .mselect-option').filter(has_text='Zebra').wait_for()
    single.press('Enter')
    check(page.evaluate('window.layoutSelects.single.getValue()') == 'zebra', 'single Enter replaces long label')
    check(geometry(page, '#single')['control']['height'] < 46, 'single remains one line after Enter')
    single.press('Backspace')
    check(page.evaluate('window.layoutSelects.single.getValue()') is None, 'Backspace clears selection')
    check(page.locator('#single input[name="single"]').count() == 0, 'hidden field removed')

    # Newly added multi chips should become visible without moving the toggle.
    multi = page.locator('#multi .mselect-input')
    multi.fill('Zebra')
    page.locator('#multi .mselect-option').filter(has_text='Zebra').wait_for()
    multi.press('Enter')
    check(page.evaluate('window.layoutSelects.multi.getValue()') ==
          ['unbroken', 'spaced', 'short', 'zebra'], 'multi Enter appends new value')
    metrics = page.evaluate('''() => {
      const chips = document.querySelector('#multi .mselect-chips');
      const last = chips.lastElementChild;
      const a = chips.getBoundingClientRect(); const b = last.getBoundingClientRect();
      return {visible: b.left >= a.left - 1 && b.right <= a.right + 1,
        scroll:chips.scrollLeft, width:chips.scrollWidth - chips.clientWidth};
    }''')
    check(metrics['visible'] and metrics['scroll'] > 0 and metrics['width'] > 0,
          'newest multi chip auto-scrolls into view')
    check(geometry(page, '#multi')['control']['height'] < 46, 'multi remains one line after Enter')
    check(page.locator('#multi input[name="multi[]"]').count() == 4, 'multi hidden fields retained')

    # Shift+Tab still reaches the last remove button in the horizontally scrolled area.
    multi.press('Shift+Tab')
    check(page.locator('#multi .mselect-chip-remove').last.evaluate(
        '(el) => document.activeElement === el'), 'keyboard reaches latest remove button')
    page.keyboard.press('Enter')
    check(page.evaluate('window.layoutSelects.multi.getValue()') ==
          ['unbroken', 'spaced', 'short'], 'latest chip removable with keyboard')

    # Earlier chips are reachable and removable via horizontal scrolling with a mouse.
    first = page.locator('#multi .mselect-chip-remove').first
    first.click()
    check(page.evaluate('window.layoutSelects.multi.getValue()') ==
          ['spaced', 'short'], 'earlier overflowed chip remains pointer accessible')
    check(geometry(page, '#multi')['control']['height'] < 46, 'multi stays one line after deletion')


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox']
        )
        page = browser.new_page(viewport={'width': 850, 'height': 720})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        load(page)
        for width in (850, 490, 360, 240):
            check_layout(page, width)
        # Both page zoom and enlarged UI text must preserve the toggle's row.
        page.set_viewport_size({'width': 360, 'height': 720})
        page.evaluate("document.body.style.zoom = '2'")
        for selector in ('#single', '#multi'):
            item = geometry(page, selector)
            check(abs(item['toggle']['center'] - item['input']['center']) < 2,
                  f'{selector} retains the toggle row at 200% zoom')
            check(item['toggle']['right'] <= item['control']['right'] + 1 and item['overflow'] <= 1,
                  f'{selector} fits the available width at 200% zoom')
        page.evaluate("document.body.style.zoom = '1'")
        page.add_style_tag(content='.mselect-root { font-size: 26px !important; }')
        for selector in ('#single', '#multi'):
            item = geometry(page, selector)
            check(abs(item['toggle']['center'] - item['input']['center']) < 2,
                  f'{selector} retains the toggle row with enlarged text')
            check(item['toggle']['right'] <= item['control']['right'] + 1 and item['overflow'] <= 1,
                  f'{selector} does not overflow with enlarged text')
        page.add_style_tag(content='.mselect-root { font-size: 13px !important; }')
        interaction(page)
        check(not errors, f'no JavaScript errors: {errors}')
        print(f'PASS ({assertions} layout and interaction assertions)')
        browser.close()


if __name__ == '__main__':
    main()
