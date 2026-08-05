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

## Inline helper functions

Handlers can use these `@` helpers:

| Helper | Behavior |
| --- | --- |
| `@dispatch(target, name, options)` | Dispatches `new CustomEvent(name, options)` on a selector or node. |
| `@fetch(target, url, options)` | Fetches `url` for `target` and handles the response as described below. |
| `@get(url, options)` | Alias for `@fetch(el, url, options)`, where `el` is the element containing the attribute. |
| `@listen(target, name, callback, options)` | Adds a listener and associates its cleanup with the element containing the attribute. |

For example:

```html
<button on:load on:click="@dispatch(document, 'saved', {detail: 'Done'})">
  Save
</button>

<output on:load="@listen(document, 'saved', evt => {el.textContent = evt.detail})"></output>

<button on:load on:click="$('.status').textContent = 'Updated'">
  <span class="status">Waiting</span>
</button>
```

`$()` is exposed on `window` (when that name is not already in use) and works
like `document.querySelector()`:

```html
<button on:load on:click="$('#status').textContent = 'Updated'">Update</button>
<output id="status"></output>
```

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

Modified or non-primary link clicks, links with a `target` or `download`
attribute, and cross-origin links use normal browser navigation.

`fetch()` also aborts an earlier request from the same target to the same URL. Response handling depends on `Content-Type`:

| Content-Type | Event |
| --- | --- |
| `text/html` | `sse-patch-elements` with `{data, url}` |
| a type containing `json` | `sse-message` with `{data, url}`; `data` is response text, not parsed JSON |
| `text/event-stream` (parameters allowed) | `sse-<event>` with `{data, url}` for each SSE message, or `sse-message` when no event is specified |
| anything else | `sse-unknown` with `{response, url}` |

Errors dispatch `sse-error` with `{error, options, url}`. The built-in retry listener retries only requests whose `options.method` is exactly `"GET"`.

### HTML patches

A full HTML document replaces the body (unless the response contains `data-swap` elements). A fragment updates elements by id, or can explicitly target an element with `data-swap`:

```html
<!-- Returned by the server -->
<div data-swap="replaceWith:#messages">
  <p>New message</p>
</div>

<!-- Also supported: replaceWith:#messages and morph:#messages -->
```

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
<meta name="batsignal-headers" content='"X-Request-ID": "example"'>
```

The content is evaluated as JavaScript. Only serve trusted documents.

## GitHub Pages

This repository's `index.html` is a client-side demo and can be served directly from GitHub Pages. Its overall functionality test exercises links, GET forms, and HTML partial patches using static files in `tests/`. Enable Pages from the repository root in **Settings → Pages**.

## Security

Attribute values and `batsignal-headers` are compiled with `new Function()`. Never put untrusted input into either location. Batsignal does not sanitize HTML received from the server; sanitize user-generated content before sending it in an HTML response.

## License

MIT. See [LICENSE](LICENSE).
