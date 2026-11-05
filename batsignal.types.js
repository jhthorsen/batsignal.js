/**
 * Types for batsignal integrations. Import these only in JSDoc comments; this
 * module does not load batsignal or expose any runtime helpers.
 * @module
 */

/**
 * Native fetch options plus batsignal's request and SSE settings.
 * The native signal option is accepted, but overridden internally.
 * @typedef {RequestInit & {
 *   search?: Record<string, unknown>,
 *   navigation?: boolean,
 *   isSSE?: boolean,
 *   lastEventId?: string,
 *   retry?: number
 * }} BatsignalFetchOptions
 * @property {Record<string, unknown>} [search] Query values are JSON-encoded,
 *   with surrounding quotes removed from strings.
 * @property {boolean} [navigation] Abort earlier pending navigation requests.
 * @property {boolean} [isSSE] Set internally when an SSE response is received.
 * @property {string} [lastEventId] Last SSE id, sent on reconnection.
 * @property {number} [retry] SSE reconnection delay in milliseconds (default 3000).
 */

/**
 * Fetch a relative or absolute URL with optional request settings.
 * Resolves to a Response, or null on failure or cancellation.
 * @typedef {BatsignalCoreContext['fetch']} BatsignalFetch
 */

/**
 * Fetch events have different detail shapes before a request, on receiving
 * response headers, and on failure. The starting URL is a URL object; the error
 * URL is the original string supplied to fetch.
 * @typedef {{options: BatsignalFetchOptions, headers: Headers, url: URL,
 *   response?: never, error?: never} |
 *   {response: Response, options?: never, headers?: never, url?: never,
 *   error?: never} |
 *   {error: unknown, options: BatsignalFetchOptions, url: string,
 *   response?: never, headers?: never}} BatsignalFetchEventDetail
 */

/**
 * HTML, JSON, and SSE payloads. JSON data is text, not a parsed object.
 * @typedef {{data: string, url: string}} BatsignalResponseDataDetail
 */

/**
 * A response with an unrecognized content type.
 * @typedef {{response: Response, url: string}} BatsignalUnknownResponseDetail
 */

/**
 * Standard DOM events and events emitted by batsignal. Other SSE event names
 * can use an explicitly annotated CustomEvent<BatsignalResponseDataDetail> callback.
 * @typedef {GlobalEventHandlersEventMap & WindowEventMap & DocumentEventMap & {
 *   fetch: CustomEvent<BatsignalFetchEventDetail>,
 *   'sse-patch-elements': CustomEvent<BatsignalResponseDataDetail>,
 *   'sse-message': CustomEvent<BatsignalResponseDataDetail>,
 *   'sse-unknown': CustomEvent<BatsignalUnknownResponseDetail>,
 *   ready: CustomEvent<Record<string, never>>,
 *   destroy: CustomEvent<Record<string, never>>
 * }} BatsignalEventMap
 */

/**
 * Listen with the owning element's lifecycle signal by default. Options can
 * supply a different signal. Known event names infer their event types; other
 * names accept an explicitly typed event callback or default to Event.
 * @typedef {BatsignalCoreContext['listen']} BatsignalListen
 */

/**
 * Dispatch a CustomEvent using the event name as-is. Detail defaults to an
 * empty object and takes precedence over options.detail. Options default to
 * bubbles: false. Returns false if a cancelable event was canceled.
 * @typedef {BatsignalCoreContext['dispatch']} BatsignalDispatch
 */

/**
 * Initialize a root and descendants with on:load. Root defaults to document.
 * @typedef {BatsignalCoreContext['init']} BatsignalInit
 */

/**
 * Built-in helpers passed to attribute handlers and plugin init hooks.
 * Fetch and listen use the owning element for cleanup tracking. Dispatch emits
 * a CustomEvent, and init initializes a root and descendants with on:load.
 * Signal is aborted when the owning element is removed or replaced by batsignal.
 * It is present for initialized elements, but absent when code is evaluated for
 * an uninitialized node, such as fetch-headers.
 * Method signatures let editors distinguish callable helpers from data fields.
 * @typedef {{
 *   fetch(url: string, options?: BatsignalFetchOptions): Promise<Response|null>,
 *   listen<K extends keyof BatsignalEventMap>(target: EventTarget, name: K,
 *     callback: ((event: BatsignalEventMap[K]) => void) | EventListenerObject,
 *     options?: AddEventListenerOptions): void,
 *   listen<E extends Event = Event>(target: EventTarget, name: string,
 *     callback: ((event: E) => void) | EventListenerObject,
 *     options?: AddEventListenerOptions): void,
 *   dispatch(target: EventTarget, name: string, detail?: unknown,
 *     options?: CustomEventInit<unknown>): boolean,
 *   init(root?: Document|Element|DocumentFragment): void,
 *   signal: AbortSignal|undefined
 * }} BatsignalCoreContext
 */

/**
 * Add plugin-defined helpers through Extensions. Built-in helpers take
 * precedence over plugin helpers with the same names.
 * @template {object} [Extensions={}]
 * @typedef {BatsignalCoreContext & Omit<Extensions, keyof BatsignalCoreContext>} BatsignalContext
 */

/**
 * Shared plugin registry passed to setup. Helpers may not be registered yet;
 * they are copied into each new context, not bound to an element.
 * @template {object} [Extensions={}]
 * @typedef {Record<string, unknown> & Partial<Extensions>} BatsignalHelpers
 */

/**
 * Optional plugin hooks. Both run with this set to the plugin object. Setup
 * runs once per plugin script, before init runs for newly initialized elements.
 * Intersect this type with your own state type for additional methods or fields.
 * @template {object} [Extensions={}]
 * @typedef {object} BatsignalPlugin
 * @property {(script: HTMLScriptElement, helpers: BatsignalHelpers<Extensions>) => void} [setup]
 * @property {(el: Element, ctx: BatsignalContext<Extensions>) => void} [init]
 */

/**
 * Signature for external functions called by attribute handlers with
 * (el, evt, ctx). Load and value initialization have no event.
 * @template {object} [Extensions={}]
 * @callback BatsignalHandler
 * @param {Element} el
 * @param {Event|undefined} evt
 * @param {BatsignalContext<Extensions>} ctx
 * @returns {unknown}
 */

/**
 * An attribute handler after batsignal binds its element and context.
 * @callback BatsignalCompiledHandler
 * @param {Event} [evt]
 * @returns {unknown}
 */

export {}
