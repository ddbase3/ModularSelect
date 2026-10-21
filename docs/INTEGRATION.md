# ModularSelect Integration Guide

## Ownership

ModularSelect owns only the browser input, rendering, keyboard interaction, selection state and async request cancellation. It is not a user directory, API layer or authorization component. Use it for product lists, tags, categories, permissions UI targets, users and any other option source, without domain-specific branches inside this repository.

## Data source contract

An option is `{value: string|number, label: string, description?: string, disabled?: boolean}`. All values are normalized to strings. The async `source({query,limit,offset,signal})` returns `{items,hasMore}` or just `items` (in which case more pages are assumed when the returned page fills the limit).

`query` is literal free text. No SQL, expression language or JSON query is parsed by the frontend. Do not rely on the client to constrain search fields, enforce paging limits or authorize resource disclosure. Server-side results must have stable ordering for offset pagination.

Data should be projected to the minimal fields necessary for display. The browser need not receive role information, personal email addresses or host-specific metadata merely to populate a select. The current component does not proactively resolve selected IDs: supply `selectedItems` with already authorized labels, or set the value after an explicitly authorized lookup.

## Lifecycle in AJAX administration pages

Create the instance only after its target container exists:

```js
const picker = new ModularSelect(container, {
  ariaLabel: 'Choose an item',
  source,
  value: currentId,
  selectedItems: [{ value: currentId, label: currentLabel }],
  onChange(value) { /* update your existing form state */ }
}).init();

// Before replacing the row or unloading the tab:
picker.destroy();
```

Use the existing host-side authorization before providing a search response. Do not create a second permission engine or source-specific authorization rules in ModularSelect. Programmatic updates use `setValue(value, {silent: true})` where re-saving is not intended.

Use the same component for single- and multi-select. Without `multiple`, the
value is a string ID or `null`; the dropdown closes after selection. With
`multiple: true`, `getValue()` and `onChange(value)` return an array of IDs,
clicking an option toggles membership, and the menu stays open by default.
For native form submission, use a repeated field name such as `name: 'tags[]'`.
The server must validate each submitted ID. `closeOnSelect` explicitly overrides
the default in either mode. No separate component or endpoint is needed.

## Localization and keyboard behavior

Override `strings` with the host's translations, including `backspaceHint`
and `removed` for keyboard instructions and the live removal announcement.
Provide a visible `label` or `labelledBy` wherever possible. The field responds
to focus, arrows, Enter, Escape, Tab, Backspace and pointer clicks. When the
search field is empty, Backspace removes the only selected chip in single mode
or the most recent one in multi mode. After a selection the search text is
cleared, so Backspace works immediately after Enter. When the field has text,
Backspace only edits the text. A held key does not remove multiple chips.
The named chip remove buttons remain available. Verify navigation and labeling
with the actual screen readers used in the host platform before shipping an
integrated UI.

Do not dismiss the editor or replace its DOM on `pointerdown` inside the
option list. ModularSelect preserves focus while an option is clicked, and
commits that selection through the existing `onChange` callback. The optional
`tests/browser-smoke/pointer-smoke.py` checks real mouse/touch selection and
simulates a parent UI focusout event for regression coverage.

If a surrounding element applies `overflow: hidden`, the dropdown may be clipped; the consumer must adapt its containing layout. The module intentionally does not relocate its popover to `document.body` or attach global styling to other UI controls.

## Compact layout with long labels

Selected labels can be arbitrarily long; the select keeps its input and dropdown
button in one row while the chip label uses an ellipsis. Hovering a truncated
label reveals the full source text. Assistive technology still receives the
untruncated text, including in the remove button's accessible name. For
multi-select, the chip area is horizontally scrollable so all individual remove
buttons remain usable without increasing the control's height. Newly selected
chips are brought into view. Do not apply host CSS that re-enables flex wrapping
on `.mselect-control` or removes the chip area's horizontal scrolling.

The responsive behavior is tested in `tests/browser-smoke/layout-smoke.py`,
including keyboard and pointer interaction, 200% zoom and enlarged text.

## Deployment

1. Develop and test in the independently maintained `dev/ModularSelect` source directory.
2. Run `ClientStack/deploy-modular-select.sh` to replace only `assets/modularselect` with a copy of `dev/ModularSelect/src`.
3. Commit/publish the separate module repository when it exists, and commit the deployed assets/scripts/docs in ClientStack.
4. When including in PHP displays, resolve paths through the BASE3 asset resolver, never through hardcoded URLs.
