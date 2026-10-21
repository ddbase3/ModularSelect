# ModularSelect

ModularSelect is a small, accessible, domain-neutral **Vanilla JavaScript ES module**.
It renders a combobox/listbox for searching and selecting arbitrary options. It does not know about users, permissions, groups, database queries, or application routes. No external runtime dependency is needed.

## Repository and deployed layout

- `src/` is the only deployable runtime tree.
- `demos/` contains standalone browser examples.
- `tests/` contains node and browser smoke tests.
- `PRIVACY.md` describes source-observable processing and deployment responsibilities.

The development checkout belongs in `ClientStack/dev/ModularSelect/`. ClientStack intentionally ignores `dev/` checkouts. Deploy **only** the exact contents of `src/` to `ClientStack/assets/modularselect/` using `ClientStack/deploy-modular-select.sh`. This package bootstraps the folder locally; it does not fabricate a Git remote or register a non-existent repository in `local/libs.json`. When ModularSelect gains its own Git repository, maintain it there and keep the deployed `src/` copy in ClientStack.

## Static select

Include the CSS from the asset resolver and load the ES module (direct paths below are for this standalone repository):

```html
<link rel="stylesheet" href="./src/styles/modularselect.css">
<div id="status-select"></div>
<script type="module">
import { ModularSelect } from './src/index.js';
new ModularSelect('#status-select', {
  label: 'Status',
  name: 'status',
  items: [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed', disabled: true }
  ],
  value: 'open',
  onChange(value, selectedItems) { /* consume selection */ }
}).init();
</script>
```

Use a **resolved** `plugin/ClientStack/assets/modularselect/index.js` and `styles/modularselect.css` path when integrating with BASE3. The application owns CSS/JS loading and the surrounding authorization.

## Single-select and multi-select

Both modes use the **same** module, option format and data-source contract:

```js
// Single-select (default): one string ID or null, closes after selection.
const category = new ModularSelect('#category', {
  label: 'Category',
  name: 'category',
  items: [{ value: 'news', label: 'News' }, { value: 'events', label: 'Events' }],
  onChange(value) { console.log(value); }  // e.g. 'news'
}).init();

// Multi-select: array of string IDs, stays open after clicking an option.
const tags = new ModularSelect('#tags', {
  label: 'Tags',
  name: 'tags[]',
  multiple: true,
  value: ['news'],
  items: [{ value: 'news', label: 'News' }, { value: 'events', label: 'Events' }],
  onChange(values) { console.log(values); } // e.g. ['news', 'events']
}).init();
```

Mouse, touch and Enter commit the same selection. In multi-select, clicking an
already selected option deselects it; each selected chip also has a remove
button. The default `closeOnSelect` is `true` for single-select and `false` for
multi-select, and can be overridden. This works with **static or async** sources.
No special user/group/feature mode is required.

### Keyboard removal

After choosing an option with **Enter**, focus stays in the search field.
Press **Backspace** when that field is empty to remove the selected option
(single-select) or the **last selected** chip (multi-select). Repeated presses
remove earlier chips one at a time; holding the key does not bulk-delete them.
The search field is cleared after choosing an option in either mode, so
Backspace works immediately after Enter. Multi-select stays open and resets
its search results for the empty query; a remote source with `minChars: 1`
waits for new input rather than requesting an unrestricted directory.

When search text is present, Backspace edits that text normally and does not
remove any selection. The existing chip remove buttons remain available to
mouse, touch and keyboard users. Removal triggers the usual `onChange` event,
updates optional hidden form fields and announces the removed option to assistive
technology. The customizable `strings.backspaceHint` and `strings.removed`
are available for localization.

## Paged asynchronous select

A source receives exactly `{query, limit, offset, signal}`. It returns an array of options or `{items, hasMore}`. Its native backend must page results; the component never calls `getAllUsers()` or fetches a full dataset for browser-side filtering.

```js
const select = new ModularSelect('#person-picker', {
  label: 'Person',
  name: 'person_id',
  minChars: 2,
  limit: 20,
  debounceMs: 250,
  // Optional preselected labels avoid fetching user data just to display an ID.
  selectedItems: [{ value: '142', label: 'Anna Example (aexample)' }],
  value: '142',
  async source({ query, limit, offset, signal }) {
    const response = await fetch('/your-authorized-search-endpoint', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': '<token from host>' },
      body: JSON.stringify({ query, limit, offset }),
      signal
    });
    if (!response.ok) throw new Error('Search failed');
    return response.json(); // {items:[{value,label,description?,disabled?}],hasMore:boolean}
  }
}).init();
```

The example URL and CSRF placeholder are illustrative: the consuming host must provide its real route, CSRF protection, authorized user search, and field projection. Never put real credentials in shipped source. Disable GET query strings for sensitive search terms where appropriate; use same-origin authenticated requests and avoid caching sensitive responses.

The `source` function controls network access. ModularSelect itself does not call `fetch`, define endpoints, persist results, or enforce authorization. The host must authorize **each** AJAX request before returning data. In BASE3, `IUsermanager::searchUsers()` is the intended user-search backend. The frontend only sees projected `{value, label}` options.

## Options and API

```js
new ModularSelect(target, {
  items: [],             // static {value,label,description?,disabled?} or scalar array
  source: null,          // async ({query,limit,offset,signal}) => items | {items,hasMore}
  multiple: false,       // true for an array of selected IDs and repeatable options
  value: null,           // selected ID or ID array
  selectedItems: [],     // known {value,label} records for initial IDs, especially remote
  label: '',             // visible label generated by the component
  labelledBy: '',        // id of an external visible label; alternative to label
  ariaLabel: '',         // only for cases without a visible label
  name: '',              // optional native form field name (repeat name='ids[]' for multiple)
  required: false,
  disabled: false,
  closeOnSelect: true,   // defaults to !multiple; override when needed
  minChars: 1,           // default 0 for static, 1 for remote
  limit: 20,
  debounceMs: 250,
  strings: {},           // localize all messages, including backspaceHint/removed
  className: '',         // custom root classes
  onChange(value, selectedItems) {},
  onError(error) {}      // optional; only called for failed sources
}).init();
```

Instance methods:

- `init()` and `destroy()` manage DOM and listeners. `destroy()` aborts pending requests.
- `open()`, `close()`, `refresh()`, and `loadMore()` control the option list.
- `getValue()` returns a string or `null` (single) or string array (multiple).
- `getSelectedItems()` returns a copy of selected option objects.
- `setValue(value, { selectedItems, silent })` accepts IDs or option objects. Unknown IDs are displayed as their string value; seed `selectedItems` to display a friendly label for remote records.
- `setItems(items)` updates a **static** source; remote sources are refreshed via `refresh()`.
- `setDisabled(boolean)` and `clear()` modify interaction or selection.

When a selection changes, `onChange` runs and the widget dispatches a bubbling `modularselect:change` event on its root (`event.detail = {value, items}`). Initial values do not trigger a change event. Optional hidden form fields contain **only string IDs**, never labels. A cleared single select submits no field. Multiple field names are supplied by the integrator, e.g. `name: 'assignees[]'`. The server must validate received values independently of the UI.

Source search uses literal text. Static search matches label, description and value case-insensitively. Server-side source matching is defined by the owning backend. The widget does not interpret SQL, JSON query languages or regular expressions from the user.

## Long labels and one-line layout

The selection control keeps its search input and dropdown toggle on the **same row**
regardless of label length. Overlong selected labels display an ellipsis; their
complete text remains in the DOM, accessible to assistive technology, and is
also available as a native hover tooltip. The remove button retains its full
accessible name.

In multi-select, chips stay on one horizontal line. When they exceed the
available space, the chip area scrolls horizontally rather than wrapping the
control or moving the dropdown toggle. New selections scroll into view;
previously selected chips remain reachable by horizontal scrolling, keyboard
focus and their individual remove buttons. The search input and toggle do
not scroll away. This behavior applies to both static and async options.

## Accessibility

The search input is a WAI-ARIA combobox with an associated listbox. Arrow keys move the active option, Enter selects it, Escape dismisses, Tab retains native focus movement, and Backspace removes the last selected chip when the input is empty. Selection chips have named remove buttons; live status announces search progress, results and keyboard removal. Disabled options cannot be selected. Required selection uses the browser's constraint-validation API. Contrast, visible focus, high-contrast mode and responsive layout are handled in the CSS.

Pointer activation preserves the input focus until the option click has been
processed, so closing the menu does not discard the clicked value or reopen
the menu immediately. Touch scrolling is not blocked by cancelling pointer
defaults. In multi-select the menu intentionally remains open until dismissed.

An actual application still needs manual keyboard and screen-reader testing under its host CSS/layout and user locale. The module makes no blanket compliance or assistive-technology compatibility guarantee.

## Verification

```bash
npm run smoke
python3 tests/browser-smoke/pointer-smoke.py
python3 tests/browser-smoke/layout-smoke.py
python3 -m http.server 8000
```

Open `http://localhost:8000/demos/basic/`, `/demos/async/` and `/tests/browser-smoke/` from the standalone module root.

The optional `pointer-smoke.py` uses Python Playwright and Chromium to exercise
**real** mouse clicks, touch taps and Backspace after Enter in both selection
modes, as well as form fields, focus changes and async pagination. The separate
`layout-smoke.py` exercises extremely long labels, horizontal multi-chip
scrolling, 200% zoom, enlarged text, pointer removal and keyboard selection. It makes no network requests; set
`CHROMIUM_BIN` if Chromium is not on `PATH`. Unlike programmatic `element.click()`
tests, this catches pointerdown/focusout event ordering regressions.

No build step or external npm install is needed. The `src` deploy is a byte-for-byte copy, not a separate fork.

## License

GPL-3.0; see `LICENSE`.
