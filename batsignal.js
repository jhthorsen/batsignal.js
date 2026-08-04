;(function ($w, $d, H, I, L) {
  'use strict';
  // $w: window, $d: document, H: history, I: Idiomorph, L: location URL

  /**
   * Monkey-patches history.pushState and history.replaceState so that `L`
   * (the last-fetched URL) stays in sync regardless of which code calls them,
   * including third-party libraries.
   */
  ;['pushState', 'replaceState'].forEach(m => {
    const o = H[m].bind(H)
    H[m] = (s, t, u) => { o(s, t, u); u && (L = new URL(u, L.href)) }
  })

  /**
   * DOM node selector utility. Will use querySelectorAll() if a callback
   * is provided, otherwise querySelector().
   * @param {Element} parent - Parent element to search within.
   * @param {string} selector - CSS selector string.
   * @param {Function} [callback] - Callback for each matched element (Optional)
   * @returns {Element|Array<*>} - Single element if no callback, array of
   *   callback results otherwise.
   */
  const $ = ($p, s, cb) => !cb ? (s ? $p : $d).querySelector(s ?? $p) : Array.from($p.querySelectorAll(s), cb)
  if (!$w.$) $w.$ = $

  /**
   * Compiles a string into an executable function with access to batsignal APIs.
   * The compiled function receives: el (target node), evt (event object).
   * Available in the function body: el, evt, and batsignal APIs via @ prefix:
   *   @dispatch(target, name, options), @fetch(target, url, options),
   *   @get(url, options), @listen(target, name, callback).
   * @get and @listen receive el as their first argument automatically.
   *
   * @param {Node} el - The target DOM node.
   * @param {string} body - JavaScript code string to compile.
   * @returns {Function} A function that takes an event and executes the compiled code.
   */
  function compile(el, body) {
    body = body
      .replace(/\@(get|listen|\$)\(/g, '__b.$1(el,')
      .replace(/\@(dispatch|fetch)\b/g, '__b.$1')

    try {
      const batsignal = {dispatch, fetch, get: fetch, listen};
      const handler = new Function('el', '__b', 'evt', body)
      return (evt) => handler(el, batsignal, evt)
    } catch (error) {
      console.error(error, el, body)
    }
  }

  /**
   * Dispatches a custom event on a given node.
   * @param {Node|string} el - The target DOM node or CSS selector.
   * @param {string} eventName - The event name (emitted as 'sse-{eventName}').
   * @param {Object} [options={}] - Additional CustomEvent options (detail, etc).
   * @returns {void}
   */
  const dispatch = (el, eventName, options = {}) => {
    if (typeof el === 'string') el = $d.querySelector(el)
    el.dispatchEvent(new CustomEvent(eventName, {bubbles: false, ...options}))
  };

  /**
   * Fetches a resource and dispatches appropriate events based on content type.
   * A window-level error listener retries requests with options.method === 'GET'.
   *
   * Headers can be injected via: <meta name="batsignal-headers" content='"X-Foo": "bar"'>
   * Tracks pending requests per URL and aborts previous requests to the same URL.
   *
   * @param {Node} el - The target DOM node (for cleanup tracking).
   * @param {string} url - A relative or absolute URL to fetch.
   * @param {Object} [options={}] - Fetch options (method, headers, body, search, etc).
   *   The 'signal' option is managed internally and will be overridden.
   * @returns {Promise<Response|null>} - The fetch Response, or null on error.
   *
   * @fires sse-patch-elements - Dispatched when content-type is text/html
   * @fires sse-message - Dispatched when content-type contains "json"
   * @fires sse-{event} - Dispatched for each SSE event when content-type is text/event-stream
   * @fires sse-unknown - Dispatched for unrecognized content types
   * @fires sse-error - Dispatched on fetch error (unless default prevented)
   */
  async function fetch(el, url, o = {}) {
    function toParams(i, o = new FormData()) {
      for (const k in i ?? {}) o.append(k, JSON.stringify(i[k]).replace(/^"|"$/g, ''))
      return o
    }

    try {
      for (const c of (el._C ??= {})[url] ?? []) c()
      const ac = new AbortController()
      el._C[url] = [() => ac.abort()]

      const u = new URL(url.replace(/\#.*/, ''), L.href)
      if (o.search) toParams(o.search, u.searchParams)

      const $h = $($d.head, 'meta[name=batsignal-headers]')
      const headers = toParams($h ? compile($h, `return {${$h.content}}`)() : {}, o.headers ?? new Headers())
      const r = await $w.fetch(u, {...o, headers, signal: ac.signal})
      const ct = r.headers.get('content-type') ?? ''
      if (ct.startsWith('text/html')) {
        dispatch(el, 'sse-patch-elements', {bubbles: true, detail: {data: await r.text(), url}})
      } else if (ct.match(/\bjson\b/)) {
        dispatch(el, 'sse-message', {bubbles: true, detail: {data: await r.text(), url}})
      } else if (ct.startsWith('text/event-stream')) {
        const decoder = new TextDecoder('utf-8'), reader = r.body.getReader()
        let buf = '', sse = {}
        for (;;) {
          const {done, value} = await reader.read()
          if (done) break
          buf += decoder.decode(value, {stream: true})
          for (let i; (i = buf.indexOf('\n')) >= 0;) {
            if (i) {
              const [k, v] = buf.replace(/\r/g, '').slice(0, i).split(/:\s/, 2)
              sse[k] ??= ''
              sse[k] += v
            } else {
              dispatch(el, 'sse-' + sse.event, {bubbles: true, detail: {data: sse.data, url}})
              sse = {}
            }
            buf = buf.slice(i + 1)
          }
        }
      } else {
        dispatch(el, 'sse-unknown', {bubbles: true, detail: {response: r, url}})
      }

      return r
    } catch (error) {
      if (error.name != 'AbortError') dispatch(el, 'sse-error', {bubbles: true, detail: {error, options: o, url}})
      return null
    }
  }

  /*
   * Initializes event listeners on all elements with batsignal attributes.
   * Called automatically on page load and after patching with sse-patch-elements.
   *
   * Supported attributes:
   *   on:load       - Executes code once when element is initialized
   *   on:click      - Executes code on click event
   *   on:input      - Executes code on input events
   *   on:value      - Runs for input/change events and external 'value' events
   *   on:{event}    - Executes code on any DOM event
   *
   * Each element is initialized only once (tracked via _I property).
   */
  function init() {
    $($d, '[on\\:load]', (el) => {
      if (el._I) return
      el._I = true

      for (const attr of el.attributes) {
        const name = attr.name.replace(/^on:/, '')
        if (attr.name == 'on:load') {
          compile(el, attr.value)()
        } else if (attr.name == 'on:value') {
          const handler = compile(el, attr.value)
          if (el.tagName == 'SELECT' || el.type == 'checkbox' || el.type == 'radio') {
            listen(el, el, 'change', handler)
          } else if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA') {
            listen(el, el, 'input', handler)
          }

          listen(el, el, 'value', ({detail}) => {
            if (detail != undefined) el.value = detail
            handler()
          })

          handler()
        } else if (name != attr.name) {
          listen(el, el, name, compile(el, attr.value))
        }
      }
    })
  }

  /**
   * Adds an event listener and automatically tracks it for cleanup.
   * Cleanup functions are stored in the storage node's _C property by event name.
   *
   * @param {Node} storageNode - The DOM node to store cleanup function references on
   *   (typically the event target or its parent; used for cleanup tracking).
   * @param {Node|string} target - The event target node or CSS selector.
   * @param {string} eventName - The name of the event to listen for.
   * @param {Function} handler - Callback function to execute when event fires.
   * @param {Object} [options={}] - Additional addEventListener options (capture, once, etc).
   * @returns {Function} - A cleanup function that removes the listener and unregisters itself.
   */
  function listen(storageNode, target, eventName, handler, options = {}) {
    if (typeof target === 'string') target = $d.querySelector(target)
    target.addEventListener(eventName, handler, options)
    const cleanup = () => { target.removeEventListener(eventName, handler); storageNode._C[eventName].delete(cleanup) }
    ;((storageNode._C ??= {})[eventName] ??= new Set()).add(cleanup)
    return cleanup
  }

  listen($w, $w, 'sse-error', ({detail: {options: o, url}, defaultPrevented: d, target}) => {
    if (!d && o.method == 'GET') setTimeout(() => target.parentNode && fetch(target, url, o), 3000)
  })

  listen($w, $w, 'sse-patch-elements', ({detail: {data, url}}) => {
    function destroy(el) {
      if (el.dataset.preserve != undefined) return
      $(el, '[on\\:load]', destroy)
      for (const k in el._C ?? {}) for (const c of el._C[k]) c()
      ;['_C'].forEach(k => delete el[k])
    }

    function swapElements(parent) {
      $(parent, '[data-swap]', (newEl) => {
        if (newEl.dataset.swap == 'none') return
        const swap = newEl.dataset.swap.split(':', 2)
        const oldEl = $($d, swap[1])
        if (swap[0] == 'morph' || swap[0] == 'replaceWith') destroy(oldEl)
        I && swap[0] == 'morph' ? I.morph(oldEl, newEl) : oldEl[swap[0]](newEl)
      })
    }

    function scriptAndStyle(parent, url) {
      $(parent, 'style, script', (node) => {
        const el = $d.createElement(node.tagName)
        el.nonce = node.nonce
        el.dataset.owner = url || el.nonce
        el.textContent = node.textContent
        $d.head.appendChild(el)
        node.remove()
      })
    }

    if (!I) I = $w.Idiomorph
    if (!data) return
    if (data.lastIndexOf('<body', 4096) != -1) {
      const parsed = new DOMParser().parseFromString(data, 'text/html')
      $($d, '[data-owner]', (el) => el.remove())
      destroy($d.body)
      scriptAndStyle(parsed, url)
      $($d, '[data-preserve]', (el) => $(parsed, `#${el.id}`, (newEl) => newEl.replaceWith(el.cloneNode(true))))
      let titleEl
      if ((titleEl = $(parsed, 'title'))) $($d, 'title', (oldEl) => oldEl.textContent = titleEl.textContent)
      if ($(parsed, '[data-swap]')) return swapElements(parsed)
      if ((titleEl = $(parsed, 'body'))) $d.body.innerHTML = titleEl.innerHTML
      if (L.hash) $($d, L.hash, el => el.scrollIntoView({behavior: 'auto'}))
    } else {
      const fragment = $d.createRange().createContextualFragment(data)
      if (url.length) $($d, `[data-owner="${url}"]`, (el) => el.remove())
      scriptAndStyle(fragment, url)
      $($d, '[data-preserve=always]', (el) => $(fragment, `#${el.id}`, (newEl) => newEl.replaceWith(el.cloneNode(true))))
      swapElements(fragment)
      for (const el of fragment.children) {
        if (el.dataset.swap == 'none') continue
        const oldEl = el.id && $($d, `#${el.id}`)
        if (oldEl) {
          destroy(oldEl)
          I ? I.morph(oldEl, el) : oldEl.replaceWith(el)
        } else {
          console.warn("Can't swap unknown element", el, fragment)
        }
      }
    }

    init()
  })

  listen($w, $d, 'click', (evt) => {
    const el = evt.target?.closest('[href]')
    if (evt.defaultPrevented || !el || el.target.startsWith('_')) return // _blank, _top, _self, ...

    const url = new URL(el.href || el.getAttribute('href'), L.href)
    if (url.origin != L.origin) return // Not the same site
    if (url.pathname == L.pathname && url.search == L.search && url.hash) return // link#anchor on same page

    const m = el.dataset.history || 'pushState'
    if (m != 'none') H[m]({}, null, url.pathname + url.search + url.hash)

    evt.preventDefault()
    fetch($d.body, url.pathname + url.search, {})
  })

  listen($w, $w, 'popstate', () => {
    const O = L
    L = new URL(location.href)
    if (O.pathname == L.pathname && O.search == L.search) return
    fetch($d.body, L.pathname + L.search, {})
  })

  listen($w, $d, 'submit', (evt) => {
    const el = evt.target?.closest('form')
    if (evt.defaultPrevented || !el || el.target.startsWith('_')) return // _blank, _top, _self, ...

    const [u, b, r] = [new URL(el.getAttribute('action'), L.href), new FormData(el), {method: el.method}]
    const $s = evt.submitter
    if ($s.name) b.append($s.name, $s.value)

    const m = el.dataset.history || 'pushState'
    if (r.method.toLowerCase() == 'post') {
      const c = 'application/x-www-form-urlencoded'
      const t = el.enctype || c
      r.headers = new Headers()
      r.headers.append('content-type', t)
      r.body = t == c ? new URLSearchParams(b) : b
    } else {
      for (const [k, v] of b.entries()) u.searchParams.append(k, v)
    }

    if (m != 'none') H[m]({}, null, u.toString())
    if ($s) $s.ariaBusy = 'true'
    evt.preventDefault()
    fetch($d.body, u.toString(), r).finally(() => {
      el.ariaBusy = 'false'
      if ($s) $s.ariaBusy = 'false'
    })
  })

  init()
})(window, document, history, window.Idiomorph, new URL(location.href))
