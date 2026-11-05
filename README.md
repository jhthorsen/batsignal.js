# 🦇 batsignal.js

[batsignal.js](https://jhthorsen.github.io/batsignal.js) is an alternative to [htmx](https://htmx.org) and [datastar](https://data-star.dev) that provides many of the same features, but focuses on plug-and-play interactions instead of requiring `x-` or `data-` attributes for common cases. Pairing batsignal.js with [pico.css](https://picocss.com/) makes HTML clean and easy to work with.

This project is especially suitable for backend developers who do not want to maintain a large full-stack Node.js framework, but still want to add interactivity to server-rendered pages without writing much JavaScript. Full-stack and frontend developers can also benefit from batsignal.js's simplicity and hackability, adapting it to their needs without extra bloat.

## Quick start

Place the selected scripts immediately before the closing `</body>` tag.

```html
<!-- Idiomorph is a required dependency -->
<script src="https://unpkg.com/idiomorph@0.7.4/dist/idiomorph.min.js"></script>
<!-- Development: main can contain breaking changes -->
<script src="https://cdn.jsdelivr.net/gh/jhthorsen/batsignal.js@main/batsignal.js"></script>
<!-- Or pin a revision until versioned releases are available:
<script src="https://cdn.jsdelivr.net/gh/jhthorsen/batsignal.js@be29cca/batsignal.js"></script>
-->
```

[Idiomorph](https://github.com/bigskysoftware/idiomorph) is a JavaScript library for morphing one DOM tree to another. It makes replacing nodes slower, but it makes the user experience much better: For example, text selection and focused input are remembered.

With batsignal.js loaded, this button is interactive and the same-origin link is fetched without a full reload; an HTML response patches the current document:

```html
<button on:load on:click="alert('Hello')">Hello</button>
<a href="/user/profile">View profile</a>
```

## Event handlers

### Plugins

Add a plugin as an inert `<script>` containing an object expression. The script
element itself is the plugin. Batsignal evaluates each script once, calls optional
`setup(script, C)` once when it first discovers the plugin, passing the plugin
`<script>` element and the shared helper registry. Plugins can add helpers to
`C` in `setup()`; batsignal includes those helpers in the `ctx` passed to
plugin `init()` hooks and attribute handlers. It calls optional `init(el, ctx)` for each newly initialized element with
`on:load`, before binding that element's `on:*` handlers. `ctx` has the same
helpers available to attribute handlers. Inside both hooks, `this` refers to
the plugin object.

```html
<script type="text/plain" data-batsignal-plugin="widget">
({
  setup(script) {
    console.log('Loaded plugin:', script.dataset.batsignalPlugin)
  },
  init(el, ctx) {
    if (el.matches('[data-widget]')) ctx.listen(el, 'click', handleWidgetClick)
  },
})
</script>
```

Either method may be omitted. `init` also runs for new elements added by HTML
patches:

Place plugin scripts before batsignal to run them during the initial page
initialization. Batsignal has no public `init` method. A plugin script added
later is picked up the next time Batsignal initializes elements, such as after
an HTML patch. Each script tag is an independent plugin; its
`data-batsignal-plugin` value is a label. Plugins can add shared helpers to
`C` from `setup()`:

```html
<script type="text/plain" data-batsignal-plugin="clipboard">
({
  setup(script, C) {
    C.copy = text => navigator.clipboard.writeText(text)
  },
})
</script>
<button on:load on:click="ctx.copy('Copied text')">Copy</button>
```

The added helpers are available to every plugin `init()` hook and attribute
handler. If plugins assign the same helper name, the later setup assignment
replaces the earlier one. Core context helpers such as `fetch` and `listen`
take precedence over plugin helpers.
Removing a script tag means it won't run for elements initialized afterward.

Listen for events with the `on:<event>` syntax. In addition to standard events such as `click` and `submit`, batsignal.js provides the special events listed below.

### `on:load`

**An element must have an `on:load` attribute to be initialized.** This applies to `on:value` and every other `on:*` handler too. A blank `on:load` is enough:

```html
<button on:load on:click="alert('Hello')">Hello</button>
```

`on:load` runs once for each DOM node when batsignal initializes it. It also runs for new elements after a response patches the page, but not again when Idiomorph retains an existing element during a `morph` swap.

### `on:destroy`

`on:destroy` runs immediately before batsignal removes or replaces the element during an HTML patch. Use it to clean up resources that are not managed by batsignal, such as timers or third-party widgets. It does not run when other code removes the element from the DOM.

```html
<div on:load="el.timer = setInterval(refresh, 1000)" on:destroy="clearInterval(el.timer)">
  Refreshing…
</div>
```

Once initialized, `on:<event>` adds an event listener to the element. The handler has `el` (the element) and `evt` (the event) in scope.

```html
<input on:load on:input="console.log(el.value)">
<button on:load on:click="el.disabled = true">Disable me</button>
```

### `on:value`

`on:value` runs immediately, then on `input` for text inputs and textareas, or on `change` for selects, checkboxes, and radio buttons. It also listens for a custom `value` event on the element. A defined `event.detail` is assigned to `el.value` before the handler runs.

```html
<input on:load on:value="store.name = el.value">

<script>
  window.store = new Proxy({}, {
    set(object, key, value) {
      document.querySelector('#name').textContent = value;
      return Reflect.set(object, key, value);
    },
  });
</script>
<output id="name"></output>
```

## Handler bindings

Attribute handlers receive `el` (the element), `evt` (the event), and `ctx`.
`ctx` contains helpers bound to the element:

| Helper | Behavior |
| --- | --- |
| `ctx.fetch(url, options)` | Fetches `url` for `el` and handles the response as described below. |
| `ctx.listen(target, name, callback, options)` | Adds a listener using the element lifecycle signal by default. |
| `ctx.dispatch(target, name, detail, options)` | Dispatches a `CustomEvent` on `target`. |
| Chart plugin: `ctx.chart(target)` | Returns the same mutable chart state object for `target` across chart handlers and plugins. |
| `ctx.init(root)` | Initializes `root` and its descendants that have `on:load`. |
| `ctx.signal` | Aborts when batsignal removes or replaces `el`. |

For example:

```html
<button on:load on:click="ctx.dispatch(document, 'saved', 'Done')">
  Save
</button>

<output on:load="ctx.listen(document, 'saved', evt => {el.textContent = evt.detail})"></output>

<button on:load on:click="$('.status').textContent = 'Updated'">
  <span class="status">Waiting</span>
</button>
```

Use `ctx.init()` to initialize elements created in JavaScript. Append the root
before calling it so `on:load` handlers run with the element in its final DOM
context:

```js
const child = document.createElement('button')
child.setAttribute('on:load', "el.textContent = 'Ready'")
document.body.append(child)
ctx.init(child)
```

`$()` is exposed on `window` (when that name is not already in use) and works
like `document.querySelector()`:

```html
<button on:load on:click="$('#status').textContent = 'Updated'">Update</button>
<output id="status"></output>
```

### Using types in external libraries

[batsignal.types.js](batsignal.types.js) provides reusable JSDoc types for
`BatsignalContext`, `BatsignalFetchOptions`, `BatsignalPlugin`, `BatsignalHelpers`,
`BatsignalHandler`, and event details. All exported types use the `Batsignal` prefix.
Copy this file into your library (for example, `vendor/batsignal.types.js`),
then import its types **inside JSDoc comments** using a relative local path:

```js
// @ts-check
/** @typedef {import('./vendor/batsignal.types.js').BatsignalContext} BatsignalContext */

/**
 * @param {HTMLElement} el
 * @param {BatsignalContext} ctx
 */
function initializeWidget(el, ctx) {
  ctx.listen(el, 'click', () => ctx.fetch('/widget', {
    search: {expanded: true},
  }))
}
```

These imports provide autocomplete in JavaScript editors; `// @ts-check` also
enables type checking in editors that support TypeScript. They do not load or
execute either JavaScript file. Do not add a runtime import or a `<script>` tag
for the types module. Keep using the normal batsignal script for browser behavior.
Use a local file path, not a CDN URL, for type resolution.

For functions called from attributes such as `on:click="handleClick(el, evt, ctx)"`,
use `BatsignalHandler`, or annotate the parameters individually. The `evt` parameter can
be undefined for `on:load` and the initial `on:value` call. `ctx.signal` is present
for initialized elements, but can be undefined in code evaluated for an
uninitialized node, such as `fetch-headers`.

Pass your own helper types as a generic argument when a plugin extends `ctx`:

```js
/** @typedef {{copy: (text: string) => Promise<void>}} ClipboardHelpers */
/** @typedef {import('./vendor/batsignal.types.js').BatsignalContext<ClipboardHelpers>} ClipboardContext */

/** @satisfies {import('./vendor/batsignal.types.js').BatsignalPlugin<ClipboardHelpers>} */
const clipboardPlugin = {
  setup(script, helpers) {
    helpers.copy = text => navigator.clipboard.writeText(text)
  },
  init(el, ctx) {
    ctx.listen(el, 'click', () => ctx.copy(el.textContent ?? ''))
  },
}
```

This describes the plugin object; register it through the inert plugin script
mechanism described above. Helpers in `setup` are optional until registered;
only include helpers your integration requires in the context extension.
Built-in helper names always take precedence over plugin-defined names.
For plugins with their own state or methods, intersect the plugin type with
your state type, for example `BatsignalPlugin<ClipboardHelpers> & {initialized: number}`.

`ctx.listen` infers standard DOM events and built-in batsignal event details.
Annotate callbacks for application-specific events explicitly:

```js
/** @param {CustomEvent<{message: string}>} evt */
function showMessage(evt) {
  console.log(evt.detail.message)
}
// Inside a function receiving ctx:
// ctx.listen(document, 'app-message', showMessage)
```

Use `CustomEvent<import('./vendor/batsignal.types.js').BatsignalResponseDataDetail>` for
custom `sse-*` events. `BatsignalFetchEventDetail` describes the request-start,
response, and error variants of the `fetch` event; `BatsignalResponseDataDetail` and
`BatsignalUnknownResponseDetail` describe response payloads.

### Checking the types

With Node.js and TypeScript installed, run the integration type checks and
editor regression tests from the repository root:

```sh
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module ESNext --lib ES2022,DOM tests/types.js
NODE_PATH="$(npm root -g)" node --test tests/type-completions.cjs
```

The `NODE_PATH` setting lets Node find a globally installed TypeScript module;
it can be omitted when TypeScript is installed locally. The editor tests check
that context helpers appear as methods, `signal` remains a field, and both
`listen` overloads are available for plain and plugin-extended contexts.

## Requests and responses

Links and forms targeting the same origin are intercepted. A form without an
`action` submits to the current page, as it would without batsignal.js.
Cross-origin forms use normal browser submission. Links use `GET`; forms use
their declared method. `data-history` controls the history update:

```html
<a href="/account">Push a history entry</a>
<a href="/account" data-history="replaceState">Replace the current entry</a>
<a href="/account" data-history="none">Do not update history</a>
```

Submitting controls can override a form's `action`, `method`, or `enctype`
with the standard `formaction`, `formmethod`, and `formenctype` attributes.
Forms or submitting controls with a `target` use normal browser submission.
Forms with `method="dialog"` retain their native dialog behavior.

Modified or non-primary link clicks, links or forms with a `target`, links with
a `download` attribute, and cross-origin links use normal browser navigation.

Requests run concurrently by default. Set `navigation: true` to abort an
earlier pending navigation request before starting a browser-style navigation:
`fetch('/account', {navigation: true})`. Response handling depends on
`Content-Type`:

| Content-Type | Event |
| --- | --- |
| `text/html` | `sse-patch-elements` with `{data, url}` |
| a type containing `json` | `sse-message` with `{data, url}`; `data` is response text, not parsed JSON |
| `text/event-stream` (parameters allowed) | `sse-<event>` with `{data, url}` for each SSE message, or `sse-message` when no event is specified |
| anything else | `sse-unknown` with `{response, url}` |

SSE connections reconnect after a read failure, but not after a graceful stream
close, matching `EventSource`. The default delay is 3000 ms; a server-sent
`retry:` field replaces it. A received `id:` is sent as `Last-Event-ID` on the
next connection.

`fetch()` dispatches a bubbling `fetch` event on the target before making the
request with `{options, headers, url}`, after receiving a response with
`{response}`, and on an error with `{error, options, url}`. To retry a safe
request, add an `on:fetch` handler to the element that started it. This example
retries a failed request at most three times, with a three-second delay:

```html
<a href="/account" on:load on:fetch="
  if (evt.detail.response) { el.retryCount = 0; return }
  if (!evt.detail.error || evt.detail.error.name == 'AbortError' || !el.isConnected) return
  if ((el.retryCount ?? 0) >= 3) return
  el.retryCount = (el.retryCount ?? 0) + 1
  setTimeout(() => el.isConnected && ctx.fetch(evt.detail.url, evt.detail.options), 3000)
">
  View account
</a>
```

### HTML patches

A full HTML document replaces the body (unless the response contains `data-swap` elements). A fragment updates elements by id, or can explicitly target an element with `data-swap`:

```html
<!-- Returned by the server -->
<div data-swap="replaceWith:#messages">
  <p>New message</p>
</div>

<!-- Also supported: replaceWith:#messages and morph:#messages -->
```

When a swap target does not exist, or its requested mode is unsupported,
batsignal logs a warning and ignores that response element.

Fragments are parsed through a `<template>`, so partials can contain elements
that require a specific parent context, such as a table row:

```html
<tr data-swap="append:#orders tbody">
  <td>New order</td>
</tr>
```

`morph` uses the required `window.Idiomorph` dependency. The following modes control a response element without inserting it:

```html
<!-- Discard the returned element without changing the current DOM. -->
<div data-swap="ignore"></div>

<!-- Retain the current element with the same id. -->
<div id="editor" data-swap="keep"></div>

<!-- Remove the selected current element. -->
<template data-swap="remove:#messages"></template>
```

For a full-document response, `keep` moves the current element into the incoming document. For a fragment response, it discards the incoming element.

### Headers

To add headers to every batsignal request, the meta tag content is inserted inside an object literal. Use object entries, **without outer braces**:

```html
<meta name="fetch-headers" content='"X-Request-ID": "example"'>
```

The content is evaluated as JavaScript. Only serve trusted documents.

## GitHub Pages

This repository's `index.html` is a client-side demo and can be served directly from GitHub Pages. Its overall functionality test exercises links, GET forms, and HTML partial patches using static files in `tests/`. Enable Pages from the repository root in **Settings → Pages**.

## Security

Attribute values and `fetch-headers` are compiled with `new Function()`. Never put untrusted input into either location. Batsignal does not sanitize HTML received from the server; sanitize user-generated content before sending it in an HTML response.

## License

MIT. See [LICENSE](LICENSE).
