;(function ($w, $d, H, L) {
  'use strict';
  // $w: window, $d: document, H: history, L: location URL

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
      .replace(/\@(get|listen)\(/g, '__b.$1(el,')
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
   * @fires fetch - Dispatched when starting and ending a request
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
      const headers = new Headers(o.headers)
      for (const [name, value] of Object.entries($h ? compile($h, `return {${$h.content}}`)() : {})) {
        headers.append(name, value)
      }
      dispatch(el, 'fetch', {bubbles: true, detail: {options: o, headers, url: u}})
      const r = await $w.fetch(u, {...o, headers, signal: ac.signal})
      dispatch(el, 'fetch', {bubbles: true, detail: {response: r}})
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
            const line = buf.slice(0, i).replace(/\r$/, '')
            if (!line) {
              if (sse.data != undefined) dispatch(el, 'sse-' + (sse.event ?? 'message'), {bubbles: true, detail: {data: sse.data.slice(0, -1), url}})
              sse = {}
            } else if (!line.startsWith(':')) {
              const colon = line.indexOf(':')
              const [k, v] = colon < 0 ? [line, ''] : [line.slice(0, colon), line.slice(colon + 1).replace(/^ /, '')]
              if (k == 'data') sse.data = (sse.data ?? '') + v + '\n'
              else {
                sse[k] ??= ''
                sse[k] += v
              }
            }
            buf = buf.slice(i + 1)
          }
        }
      } else {
        dispatch(el, 'sse-unknown', {bubbles: true, detail: {response: r, url}})
      }

      return r
    } catch (error) {
      dispatch(el, 'fetch', {bubbles: true, detail: {error, options: o, url}})
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

      let load;
      for (const a of el.attributes) {
        const match = a.name.match(/^on:(.+)/)
        if (!match) continue;

        const event = match[1].split('|')
        const opt = event.slice(1).reduce((opt, n) => { opt[n] = true; return opt }, {})
        const handler = compile(el, a.value)
        if (event[0] == 'load') {
          load = handler
        } else if (event[0] == 'value') {
          if (el.tagName == 'SELECT' || el.type == 'checkbox' || el.type == 'radio') {
            listen(el, el, 'change', handler, opt)
          } else if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA') {
            listen(el, el, 'input', handler, opt)
          }

          listen(el, el, 'value', ({detail}) => {
            if (detail != undefined) el.value = detail
            handler()
          })

          handler()
        } else {
          listen(el, el, event[0], handler, opt)
        }
      }

      if (load) load()
    })
    dispatch($d, 'ready')
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

  // Retris failed fetch() requests after 3 seconds unless defaultPrevented is true
  listen($w, $w, 'fetch', ({detail, defaultPrevented, target}) => {
    if (defaultPrevented || !detail.error || detail.error.name == 'AbortError') return
    if (detail.options.method == 'GET') setTimeout(() => target.parentNode && fetch(target, detail.url, detail.options), 3000)
  })

  // Parses HTML responses and swaps elements in the DOM based on data-swap attributes.
  listen($w, $w, 'sse-patch-elements', ({detail: {data, url}}) => {
    if (!data) return

    const hasBody = data.indexOf('<body') != -1
    const dom = hasBody ? new DOMParser().parseFromString(data, 'text/html') : (() => {
      const t = $d.createElement('template')
      t.innerHTML = data
      return t.content
    })()

    $(dom, '[data-swap=ignore]', el => el.remove())
    $(dom, '[data-swap=keep]', b => {
      const a = b.id && $($d, `#${b.id}`)
      a ? b.replaceWith(a) : b.remove()
    })

    const [script, style] = ['script', 'style'].map(sel => $(dom, sel, el => [el, el.remove()][0]))
    hasBody
      ? $(dom, 'title', t => $($d, 'title').textContent = t.textContent)
      : Array.from(dom.children).forEach(el => el.id && !el.dataset.swap && (el.dataset.swap = `morph:#${el.id}`))
    $($d, '[data-owner]', el => (hasBody || (url && el.dataset.owner == url)) && el.remove())
    style.forEach(el => $d.head.appendChild([el, (el.dataset.owner = url || '')][0]))
    hasBody ? (swap(dom) || swapBody(dom)) : swap(dom)
    script.forEach(el => {
      const copy = $d.createElement('script')
      for (const {name, value} of el.attributes) copy.setAttribute(name, value)
      copy.dataset.owner = url || ''
      copy.textContent = el.textContent
      $d.head.appendChild(copy)
    })
    init()

    function destroy(el) {
      dispatch(el, 'destroy')
      $(el, '[on\\:load]', destroy)
      for (const k in el._C ?? {}) for (const c of el._C[k]) c()
      ;['_C', '_I'].forEach(k => delete el[k])
    }

    function swap(parsed) {
      return $(parsed, '[data-swap]', b => {
        const [m, sel] = b.dataset.swap.split(':', 2)
        if (m == 'keep') return false
        const a = $($d, sel || `#${b.id}`)
        if (m == 'remove') return a && (destroy(a), a.remove())
        if (m == 'morph' || m == 'replaceWith') destroy(a)
        m == 'morph' ? Idiomorph.morph(a, b) : a[m](b)
        return true
      }).filter(r => r).length > 0
    }

    function swapBody(parsed) {
      const [a, b] = [$d.body, $(parsed, 'body')]
      destroy(a)
      for (const {name} of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name)
      for (const {name, value} of b.attributes) a.setAttribute(name, value)
      a.replaceChildren(...b.childNodes)
      if (L.hash) $($d, L.hash, el => el.scrollIntoView({behavior: 'auto'}))
    }
  })

  // Listens for click events on links and intercepts them for SPA navigation.
  listen($w, $d, 'click', (evt) => {
    const el = evt.target?.closest('a[href], area[href]')
    if (!el || evt.defaultPrevented || evt.button != 0 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey || el.target || el.hasAttribute('download')) return

    const url = new URL(el.href || el.getAttribute('href'), L.href)
    if (url.origin != L.origin) return // Not the same site
    if (url.pathname == L.pathname && url.search == L.search && url.hash) return // link#anchor on same page

    const m = el.dataset.history || 'pushState'
    if (m != 'none') H[m]({}, null, url.pathname + url.search + url.hash)

    evt.preventDefault()
    fetch(el, url.pathname + url.search, {method: 'GET'})
  })

  // Listens for popstate events (back/forward navigation) and fetches the new page content.
  listen($w, $w, 'popstate', () => {
    const O = L
    L = new URL(location.href)
    if (O.pathname == L.pathname && O.search == L.search) return
    fetch($d.body, L.pathname + L.search, {})
  })

  // Listens for form submissions and intercepts them for SPA navigation.
  listen($w, $d, 'submit', (evt) => {
    const el = evt.target?.closest('form')
    if (!el || evt.defaultPrevented || el.target.startsWith('_')) return // _blank, _top, _self, ...

    const u = new URL(el.action || L.href)
    if (u.origin != L.origin) return // Not the same site

    const [b, r] = [new FormData(el), {method: el.method}]
    const $s = evt.submitter
    if ($s && $s.name) b.append($s.name, $s.value)

    const m = el.dataset.history || 'pushState'
    if (r.method.toLowerCase() == 'post') {
      const c = 'application/x-www-form-urlencoded'
      const t = el.enctype || c
      r.body = t == c ? new URLSearchParams(b) : b
    } else {
      for (const [k, v] of b.entries()) u.searchParams.append(k, v)
    }

    if (m != 'none') H[m]({}, null, u.toString())
    if ($s) $s.ariaBusy = 'true'
    evt.preventDefault()
    fetch(el, u.toString(), r).finally(() => {
      if ($s) $s.ariaBusy = 'false'
    })
  })

  // Monkey-patches history.pushState and history.replaceState so that `L` stays in sync regardless of which code calls them
  ;['pushState', 'replaceState'].forEach(m => {
    const o = H[m].bind(H)
    H[m] = (s, t, u) => { o(s, t, u); u && (L = new URL(u, L.href)) }
  })

  init()
})(window, document, history, new URL(location.href))
