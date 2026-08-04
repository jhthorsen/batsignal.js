# batsignal.js

A small browser script for declarative DOM events, navigation, forms, and
HTML/SSE responses.

```html
<script src="./batsignal.js"></script>
```

## Initialization

**An element must have an `on:load` attribute to be initialized.** This applies
to `on:value` and every other `on:*` handler too. A blank `on:load` is enough:

```html
<button on:load on:click="alert('Hello')">Hello</button>
```

`on:load` runs once when batsignal initializes the element. It also runs for
new elements after a response patches the page.

## Event handlers

Once initialized, `on:<event>` adds an event listener to the element. The
handler has `el` (the element) and `evt` (the event) in scope.

```html
<input on:load on:input="console.log(el.value)">
<button on:load on:click="el.disabled = true">Disable me</button>
```

### `on:value`

`on:value` runs immediately, then on `input` for text inputs and textareas, or
on `change` for selects, checkboxes, and radio buttons. It also listens for a
custom `value` event on the element. A defined `event.detail` is assigned to
`el.value` before the handler runs.

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

Links to the same origin and forms are intercepted. Links use `GET`; forms use
their declared method. `data-history` controls the history update:

```html
<a href="/account">Push a history entry</a>
<a href="/account" data-history="replaceState">Replace the current entry</a>
<a href="/account" data-history="none">Do not update history</a>
```

`fetch()` also aborts an earlier request from the same target to the same URL.
Response handling depends on `Content-Type`:

| Content-Type | Event |
| --- | --- |
| `text/html` | `sse-patch-elements` with `{data, url}` |
| a type containing `json` | `sse-message` with `{data, url}`; `data` is response text, not parsed JSON |
| exactly `text/event-stream` | `sse-<event>` with `{data, url}` for each SSE message |
| anything else | `sse-unknown` with `{response, url}` |

Errors dispatch `sse-error` with `{error, options, url}`. The built-in retry
listener retries only requests whose `options.method` is exactly `"GET"`.

### HTML patches

A full HTML document replaces the body (unless the response contains
`data-swap` elements). A fragment updates elements by id, or can explicitly
target an element with `data-swap`:

```html
<!-- Returned by the server -->
<div data-swap="innerHTML:#messages">
  <p>New message</p>
</div>

<!-- Also supported: replaceWith:#messages and morph:#messages -->
```

`morph` uses `window.Idiomorph` when it is available; otherwise it calls the
named DOM method. Use `data-swap="none"` to ignore a returned element.

Elements with `data-preserve` survive a full-document replacement.
`data-preserve="always"` additionally preserves the matching element while
applying a fragment.

### Headers

To add headers to every batsignal request, the meta tag content is inserted
inside an object literal. Use object entries, **without outer braces**:

```html
<meta name="batsignal-headers" content='"X-Request-ID": "example"'>
```

The content is evaluated as JavaScript. Only serve trusted documents.

## GitHub Pages

This repository's `index.html` is a client-side demo and can be served directly
from GitHub Pages. It does not demonstrate requests, patches, or SSE because
GitHub Pages has no application server. Enable Pages from the repository root
in **Settings → Pages**.

## Security

Attribute values and `batsignal-headers` are compiled with `new Function()`.
Never put untrusted input into either location. Batsignal does not sanitize
HTML received from the server; sanitize user-generated content before sending
it in an HTML response.

## License

MIT. See [LICENSE](LICENSE).
