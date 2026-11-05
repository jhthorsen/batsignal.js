// Editor regression checks. Requires the TypeScript module to be resolvable.
// Run: node --test tests/type-completions.cjs
const assert = require('node:assert/strict')
const path = require('node:path')
const {test} = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const file = path.join(__dirname, 'type-completions.fixture.js')
const methods = ['fetch', 'listen', 'dispatch', 'init']
const body = `
  ctx.fetch
  ctx.listen
  ctx.dispatch
  ctx.init
  ctx.signal
  ctx.listen(document, 'click', evt => evt.clientX)
  ctx.listen(document, 'app-message', onMessage)
`
const prefix = `
/** @param {CustomEvent<{message: string}>} evt */
function onMessage(evt) { return evt.detail.message }
`
const fixtures = [
  ['plain context', `
    /** @param {import('../batsignal.types.js').BatsignalContext} ctx */
    function inspect(ctx) { ${body} }
  `],
  ['extended context with conflicting helper names', `
    /** @param {import('../batsignal.types.js').BatsignalContext<{
     *   copy: (text: string) => Promise<void>, fetch: number, listen: number
     * }>} ctx */
    function inspect(ctx) { ${body} ctx.copy('Hello') }
  `],
  ['inferred plugin context', `
    /** @satisfies {import('../batsignal.types.js').BatsignalPlugin<{
     *   copy: (text: string) => Promise<void>
     * }>} */
    const plugin = {init(el, ctx) { ${body} ctx.copy('Hello') }}
  `],
]

for (const [name, fixture] of fixtures) {
  test(name, () => {
    const source = prefix + fixture
    const options = {
      allowJs: true, checkJs: true, strict: true, noEmit: true, types: [],
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    }
    const readFile = name => name === file ? source : ts.sys.readFile(name)
    const service = ts.createLanguageService({
      ...ts.sys,
      readFile,
      fileExists: name => name === file || ts.sys.fileExists(name),
      getCompilationSettings: () => options,
      getScriptFileNames: () => [file],
      getScriptVersion: () => '0',
      getScriptSnapshot: name => {
        const text = readFile(name)
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
      },
      getCurrentDirectory: () => root,
      getDefaultLibFileName: settings => ts.getDefaultLibFilePath(settings),
    })

    try {
      const diagnostics = [
        ...service.getSyntacticDiagnostics(file),
        ...service.getSemanticDiagnostics(file),
      ]
      assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: name => name,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }))

      const position = source.indexOf('ctx.fetch') + 'ctx.'.length
      const completions = service.getCompletionsAtPosition(file, position, {})
      assert.ok(completions, 'Context member completions are available')
      for (const member of [...methods, 'signal']) {
        const kind = member === 'signal'
          ? ts.ScriptElementKind.memberVariableElement
          : ts.ScriptElementKind.memberFunctionElement
        const entry = completions.entries.find(entry => entry.name === member)
        assert.equal(entry?.kind, kind, `${member} completion kind`)
        const hoverPosition = source.indexOf(`ctx.${member}`) + 'ctx.'.length
        const info = service.getQuickInfoAtPosition(file, hoverPosition)
        assert.equal(info?.kind, kind, `${member} hover kind`)
      }

      const call = 'ctx.listen(document, '
      const signaturePosition = source.indexOf(call) + call.length
      const signatures = service.getSignatureHelpItems(file, signaturePosition, undefined)
      assert.equal(signatures?.items.length, 2, 'Both listen overloads remain available')
    } finally {
      service.dispose()
    }
  })
}
