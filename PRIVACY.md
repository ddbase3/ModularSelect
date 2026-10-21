# ModularSelect Privacy and Data Processing

> Source review: 2026-10-21, initial ModularSelect ES-module implementation delivered inside ClientStack. This is a technical inventory, not a deployment-specific privacy notice or legal assessment.

## Component, roles and purpose

ModularSelect is a generic browser-side combobox. It displays and searches caller-provided option records with string/number IDs, labels, optional descriptions and disabled flags. These fields may identify people **if the consuming application uses a person directory**, but the module does not require personal data. The host/operator determines the legal purpose, controller/processor roles, access policy and applicable notices.

The module does not itself authenticate users, authorize requests or choose a tenant boundary. Selection values supplied by a browser are untrusted and must be validated and authorized by the backend that processes the form or AJAX action.

## Collection and flow

- **Static mode:** the host passes option data and initial selection into the constructor in the same browser page. Search filtering is entirely in browser memory.
- **Async mode:** the consumer's configured `source({query,limit,offset,signal})` receives the typed query and pagination data. The consumer implements its own network request, if any, and must enforce authorization, confidentiality, CSRF protection and result minimization. There are no fixed remote endpoints or hosts in ModularSelect.
- **UI output:** visible labels, descriptions, typed text and selected string IDs appear in the page DOM. When configured with `name`, the selected IDs are placed into hidden form fields and can be submitted using the containing form's own submission mechanism. `onChange`, `onError` and `modularselect:change` pass data to caller-owned handlers.
- **Selection modes:** single-select holds zero or one ID; multi-select may hold several IDs and exposes one hidden form input per selected ID when configured. Mouse, touch and keyboard selection use the same in-memory selection data. Backspace removes the final selected ID when search is empty, updates the form fields and emits the existing change event. A visually hidden live region announces the selected label being removed. Neither keyboard removal nor this announcement adds persistent storage, new recipients or new backend operations.
- Long selected labels are visually truncated with an ellipsis to keep the control one line. The full label still exists in the DOM and in the native hover tooltip; truncation does **not** remove personal data from the page. Multi-select chips scroll horizontally but retain their values and named remove buttons. This changes only presentation, not data transmission or persistence.
- The provided demos use local example values and a simulated in-memory async source, with no remote API calls.

## Storage, retention and deletion

The source defines no database tables, migrations, files, caches, indexed data, cookies, localStorage, sessionStorage, telemetry services, queues, persistent logs, metrics, vectors, backups or external SDKs. Option pages, queries and selected values are kept in instance memory and DOM while the component exists. `destroy()` removes component DOM, unregisters listeners and invalidates/aborts active searches. Selection data may remain in caller-owned callbacks, browser form history, network layers, app state or server records **outside** the module's control. The module cannot delete that external state.

An abort signal only requests cancellation. A server may already have received a query and may log or retain it. Backend log, cache, backup, correction, export and deletion responsibilities remain with the host and its data processors.

## Recipients, security and transfers

ModularSelect itself does not send data to any recipient or call `fetch`; the only potential transfer is through a **consumer-supplied** source or form submission. Recipients, geographical transfers and processor terms depend entirely on that deployment. Build/deploy copying of local `src` requires no network connection; cloning an eventual upstream repository is a separate developer action.

The component writes supplied label/description data via `textContent`, never by evaluating HTML. It aborts stale requests and suppresses stale results. This does not replace host-side validation, authorization, server-side sanitization or transport security. Consumers should limit response payloads to necessary fields, avoid exposing complete directories, avoid accidental query logging, set appropriate cache headers and configure Content Security Policy.

## Rights, verification and known gaps

Data-subject access, rectification, deletion, objection and export require the host's actual data owner and persistence mechanisms; ModularSelect has no individual-user record store or rights API. The module does not know backend retention, processors, backup schedules or country of operation. These remain explicit production deployment checks.

Related source: `src/ModularSelect.js`, `src/utils/options.js`, `tests/`, and `README.md`. Browser and node smoke tests exercise in-memory behavior, abort semantics and DOM safety; they do not establish legal compliance or test actual server-side data deletion.
