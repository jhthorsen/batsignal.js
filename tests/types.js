// Type-only integration checks. Do not load this file in the browser.
// Run: tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module ESNext --lib ES2022,DOM tests/types.js

/** @typedef {import('../batsignal.types.js').BatsignalContext} BatsignalContext */
/** @typedef {{copy: (text: string) => Promise<void>}} ClipboardHelpers */

/**
 * @param {HTMLElement} el
 * @param {BatsignalContext} ctx
 */
export function initializeWidget(el, ctx) {
  const request = ctx.fetch('/widget', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: 'widget'}),
    search: {expanded: true, page: 2, filter: ['a', 'b']},
    navigation: true,
    retry: 1000,
    isSSE: true,
    lastEventId: '42',
    signal: new AbortController().signal,
  })
  /** @type {Promise<Response|null>} */
  const response = request
  ctx.listen(el, 'click', evt => evt.clientX, {once: true})
  ctx.listen(window, 'keydown', evt => evt.key)
  ctx.listen(window, 'popstate', evt => evt.state)
  ctx.listen(window, 'message', evt => evt.data)
  ctx.listen(el, 'fetch', evt => {
    if (evt.detail.response) evt.detail.response.status
    else if (evt.detail.headers) evt.detail.url.searchParams.get('page')
    else if (evt.detail.error instanceof Error) evt.detail.error.message
  })
  ctx.listen(el, 'sse-message', evt => evt.detail.data.toUpperCase())
  ctx.listen(el, 'sse-unknown', evt => evt.detail.response.status)
  ctx.listen(document, 'ready', evt => evt.detail)
  ctx.listen(el, 'destroy', () => {})
  ctx.listen(el, 'custom', evt => evt.type)
  ctx.listen(el, 'custom', {handleEvent(evt) { evt.type }})
  ctx.listen(el, 'app-message', showMessage)
  ctx.listen(el, 'sse-update', receiveUpdate)
  ctx.signal?.addEventListener('abort', () => {})
  ctx.init()
  ctx.init(document)
  ctx.init(el)
  ctx.init(document.createDocumentFragment())
  /** @type {boolean} */
  const dispatched = ctx.dispatch(el, 'saved', 'Done', {cancelable: true})
  ctx.dispatch(document, 'ready')
  ctx.dispatch(window, 'changed', {count: 1}, {bubbles: true})

  // Context methods also retain their standalone helper types.
  /** @type {import('../batsignal.types.js').BatsignalFetch} */
  const fetch = ctx.fetch
  /** @type {import('../batsignal.types.js').BatsignalListen} */
  const listen = ctx.listen
  /** @type {import('../batsignal.types.js').BatsignalDispatch} */
  const dispatch = ctx.dispatch
  /** @type {import('../batsignal.types.js').BatsignalInit} */
  const init = ctx.init
  fetch('/widget', {navigation: true})
  listen(el, 'click', evt => evt.clientX)
  listen(el, 'app-message', showMessage)
  dispatch(el, 'saved', 'Done')
  init(el)

  // @ts-expect-error Unknown context helpers require an explicit extension.
  ctx.copy('text')
  // @ts-expect-error Navigation must be a boolean.
  ctx.fetch('/widget', {navigation: 'yes'})
  // @ts-expect-error Retry is a delay in milliseconds.
  ctx.fetch('/widget', {retry: 'soon'})
  // @ts-expect-error Built-in event payloads are checked.
  ctx.listen(el, 'sse-message', evt => evt.detail.missing)
  // @ts-expect-error Native event properties are checked.
  ctx.listen(el, 'click', evt => evt.missing)
  // @ts-expect-error Standalone listeners preserve event inference too.
  listen(el, 'click', evt => evt.missing)
  // @ts-expect-error Listener options must be an object, not a capture boolean.
  ctx.listen(el, 'click', () => {}, true)
  // @ts-expect-error Init requires a DOM root.
  ctx.init(window)
  return {response, dispatched}
}

/** @param {CustomEvent<{message: string}>} evt */
function showMessage(evt) {
  console.log(evt.detail.message)
}

/** @param {CustomEvent<import('../batsignal.types.js').BatsignalResponseDataDetail>} evt */
function receiveUpdate(evt) {
  console.log(evt.detail.data, evt.detail.url)
}

/** @satisfies {import('../batsignal.types.js').BatsignalPlugin<ClipboardHelpers> & {initialized: number}} */
export const clipboardPlugin = {
  initialized: 0,
  setup(script, helpers) {
    console.log(script.dataset.batsignalPlugin)
    // @ts-expect-error Helpers can be absent before registration.
    helpers.copy('not registered yet')
    helpers.copy = text => navigator.clipboard.writeText(text)
  },
  init(el, ctx) {
    this.initialized++
    ctx.listen(el, 'click', () => ctx.copy(el.textContent ?? ''))
    // @ts-expect-error Plugin helper arguments are checked.
    ctx.copy(42)
  },
}

/** @type {import('../batsignal.types.js').BatsignalHandler<ClipboardHelpers>} */
export const handleClick = (el, evt, ctx) => {
  console.log(evt?.type)
  return ctx.copy(el.textContent ?? '')
}

/** @type {import('../batsignal.types.js').BatsignalCompiledHandler} */
const compiled = evt => evt?.type
compiled()
compiled(new Event('click'))

/** @type {import('../batsignal.types.js').BatsignalDispatch} */
const dispatch = (target, name, detail = {}, options = {}) =>
  target.dispatchEvent(new CustomEvent(name, {...options, detail}))
dispatch(document, 'message', {text: 'Hello'})
dispatch(document, 'message', 'Hello')

/**
 * @param {import('../batsignal.types.js').BatsignalContext<{fetch: number}>} ctx
 */
export function coreHelpersWin(ctx) {
  return ctx.fetch('/widget')
}
