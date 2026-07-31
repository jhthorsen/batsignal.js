;(function ($w, $d, H, I, L) {
  'use strict';

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
   * @param {Element} $p - Parent element.
   * @param {string} s - Selector string.
   * @param {Function} [cb] - Callback for each element (Optional)
   * @returns {Element|Array} - Array of callback results if callback is
   *   provided, otherwise a single element.
   */
  const $ = ($p, s, cb) => !cb ? (s ? $p : $d).querySelector(s ?? $p) : Array.from($p.querySelectorAll(s), cb)
  if (!$w.$) $w.$ = $

  /**
   * Dispatches a custom event on a given node.
   * @param {Node} $n - The target DOM node.
   * @param {string} e - The event name.
   * @param {Object} [o={}] - Additional `CustomEvent` options.
   * @returns {boolean} - True if event dispatched.
   */
  const dispatch = ($n, e, o = {}) => {
    if (typeof $n === 'string') $n = $d.querySelector($n)
    $n.dispatchEvent(new CustomEvent(e, {bubbles: false, ...o}))
  };

  /**
   * Fetches a resource and handles SSE, HTML, or errors.
   * A special element `<meta name="batsignal-headers" content='"X-foo": "bar"'>`
   * can be used to include headers in the request, defined as a JSON
   * object in the content attribute.
   * @param {Node} $n - The target DOM node.
   * @param {string} url - A relative URL.
   * @param {Object} [o={}] - Fetch options, excluding signal which is
   *   managed internally.
   * @returns {Promise<Response|null>}
   */
  async function fetch($n, url, o = {}) {
    function toParams(i, o = new FormData()) {
      for (const k in i ?? {}) o.append(k, JSON.stringify(i[k]).replace(/^"|"$/g, ''))
      return o
    }

    try {
      for (const c of ($n._C ??= {})[url] ?? []) c()
      const ac = new AbortController()
      $n._C[url] = [() => ac.abort()]

      const u = new URL(url.replace(/\#.*/, ''), L.href)
      if (o.search) toParams(o.search, u.searchParams)

      const $h = $($d.head, 'meta[name=batsignal-headers]')
      const headers = toParams($h ? fn($h, `return {${$h.content}}`)() : {}, o.headers ?? new Headers())
      const r = await $w.fetch(u, {...o, headers, signal: ac.signal})
      const ct = r.headers.get('content-type') ?? ''
      if (ct.startsWith('text/html')) {
        dispatch($n, 'sse-patch-elements', {bubbles: true, detail: {data: await r.text(), url}})
      } else if (ct.match(/\bjson\b/)) {
        dispatch($n, 'sse-message', {bubbles: true, detail: {data: await r.text(), url}})
      } else if (ct == 'text/event-stream') {
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
              dispatch($n, 'sse-' + sse.event, {bubbles: true, detail: {data: sse.data, url}})
              sse = {}
            }
            buf = buf.slice(i + 1)
          }
        }
      } else {
        dispatch($n, 'sse-unknown', {bubbles: true, detail: {response: r, url}})
      }

      return r
    } catch (error) {
      if (error.name != 'AbortError') dispatch($n, 'sse-error', {bubbles: true, detail: {error, options: o, url}})
      return null
    }
  }

  /**
   * Compiles a string into a function, with store and event context.
   * The function body has access to `el` (the target DOM node), `evt`
   * (the event object), `store` (the current store), and `$()`.
   * @param {Node} $n - The target DOM node.
   * @param {string} b - Function body string.
   * @param {Function} [t=(b)=>b] - Transform function.
   * @returns {Function|undefined} - Generated function.
   */
  function fn($n, b) {
    b = b
      .replace(/\@(get|listen|\$)\(/g, '__b.$1(el,')
      .replace(/\@(dispatch|fetch)\b/g, '__b.$1')

    try {
      const batsignal = {dispatch, fetch, get: fetch, listen};
      const cb = new Function('el', '$', '__b', 'evt', b)
      return (evt) => cb($n, $, batsignal, evt)
    } catch (error) {
      console.error(error, $n, b)
    }
  }

  /*
   * Initizles the event listeners for elements with `on:load` attribute and
   * any "on:xxx" event name. Also supports `on:value` for input elements,
   * which listens for changes and updates the value accordingly.
   */
  function init() {
    $($d, '[on\\:load]', ($n) => {
      if ($n._I) return
      $n._I = true

      for (const attr of $n.attributes) {
        const name = attr.name.replace(/^on:/, '')
        if (attr.name == 'on:load') {
          fn($n, attr.value)()
        } else if (attr.name == 'on:value') {
          const cb = fn($n, attr.value)
          if ($n.tagName == 'SELECT' || $n.type == 'checkbox' || $n.type == 'radio') {
            listen($n, $n, 'change', cb)
          } else if ($n.tagName == 'INPUT' || $n.tagName == 'TEXTAREA') {
            listen($n, $n, 'input', cb)
          }

          listen($n, $n, 'value', ({detail}) => {
            if (detail != undefined) $n.value = detail
            cb()
          })

          cb()
        } else if (name != attr.name) {
          listen($n, $n, name, fn($n, attr.value))
        }
      }
    })
  }

  /**
   * Adds an event listener and tracks it for cleanup.
   * @param {Node} $n - The DOM node to store the cleanup function
   *   reference on. Typically the same as $t or the parent of $t.
   * @param {EventTarget} $t - The target DOM node.
   * @param {string} e - Event name.
   * @param {Function} cb - Callback to be called when the event is
   *   triggered.
   * @param {Object} [o={}] - Additional `addEventListener` options.
   * @returns {Function} - Cleanup function.
   */
  function listen($n, $t, e, cb, o = {}) {
    if (typeof $t === 'string') $t = $d.querySelector($t)
    $t.addEventListener(e, cb, o)
    const u = () => { $t.removeEventListener(e, cb); $n._C[e].delete(u) }
    ;(($n._C ??= {})[e] ??= new Set()).add(u)
    return u
  }

  listen($w, $w, 'sse-error', ({detail: {options: o, url}, defaultPrevented: d, target}) => {
    if (!d && o.method == 'GET') setTimeout(() => target.parentNode && fetch(target, url, o), 3000)
  })

  listen($w, $w, 'sse-patch-elements', ({detail: {data, url}}) => {
    function destroy($n) {
      if ($n.dataset.preserve != undefined) return
      $($n, '[on\\:load]', destroy)
      for (const k in $n._C ?? {}) for (const c of $n._C[k]) c()
      ;['_C'].forEach(k => delete $n[k])
    }

    function swapElements($p) {
      $($p, '[data-swap]', ($c) => {
        if ($c.dataset.swap == 'none') return
        const s = $c.dataset.swap.split(':', 2)
        const $o = $($d, s[1])
        if (s[0] == 'morph' || s[0] == 'replaceWith') destroy($o)
        I && s[0] == 'morph' ? I.morph($o, $c) : $o[s[0]]($c)
      })
    }

    function scriptAndStyle($p, url) {
      $($p, 'style, script', ($c) => {
        const $s = $d.createElement($c.tagName)
        $s.nonce = $c.nonce
        $s.dataset.owner = url || $s.nonce
        $s.textContent = $c.textContent
        $d.head.appendChild($s)
        $c.remove()
      })
    }

    if (!I) I = $w.Idiomorph
    if (!data) return
    if (data.lastIndexOf('<body', 4096) != -1) {
      const $p = new DOMParser().parseFromString(data, 'text/html')
      let $c
      $($d, '[data-owner]', ($c) => $c.remove())
      destroy($d.body)
      scriptAndStyle($p, url)
      $($d, '[data-preserve]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      if (($c = $($p, 'title'))) $($d, 'title', ($o) => $o.textContent = $c.textContent)
      if ($($p, '[data-swap]')) return swapElements($p)
      if (($c = $($p, 'body'))) $d.body.innerHTML = $c.innerHTML
      if (L.hash) $($d, L.hash, el => el.scrollIntoView({behavior: 'auto'}))
    } else {
      const $p = $d.createRange().createContextualFragment(data)
      if (url.length) $($d, `[data-owner="${url}"]`, ($c) => $c.remove())
      scriptAndStyle($p, url)
      $($d, '[data-preserve=always]', ($c) => $($p, `#${$c.id}`, ($i) => $i.replaceWith($c.cloneNode(true))))
      swapElements($p)
      for (const $c of $p.children) {
        if ($c.dataset.swap == 'none') continue
        const $o = $c.id && $($d, `#${$c.id}`)
        if ($o) {
          destroy($o)
          I ? I.morph($o, $c) : $o.replaceWith($c)
        } else {
          console.warn("Can't swap unknown element", $c, $p)
        }
      }
    }

    init()
  })

  listen($w, $d, 'click', (evt) => {
    const $n = evt.target?.closest('[href]')
    if (evt.defaultPrevented || !$n || $n.target.startsWith('_')) return // _blank, _top, _self, ...

    const url = new URL($n.href || $n.getAttribute('href'), L.href)
    if (url.origin != L.origin) return // Not the same site
    if (url.pathname == L.pathname && url.search == L.search && url.hash) return // link#anchor on same page

    const m = $n.dataset.history || 'pushState'
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
    const $n = evt.target?.closest('form')
    if (evt.defaultPrevented || !$n || $n.target.startsWith('_')) return // _blank, _top, _self, ...

    const [u, b, r] = [new URL($n.getAttribute('action'), L.href), new FormData($n), {method: $n.method}]
    const $s = evt.submitter
    if ($s.name) b.append($s.name, $s.value)

    const m = $n.dataset.history || 'pushState'
    if (r.method.toLowerCase() == 'post') {
      const c = 'application/x-www-form-urlencoded'
      const t = $n.enctype || c
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
      $n.ariaBusy = 'false'
      if ($s) $s.ariaBusy = 'false'
    })
  })

  init()
})(window, document, history, window.Idiomorph, new URL(location.href))
