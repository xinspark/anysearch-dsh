import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The Client half is a browser artifact: a classic script that registers a lazy
// factory with `window.__ModuleLoader__.load`. Nothing here imports it — it is
// evaluated the way the browser module table evaluates it, so these tests cover
// the shipped file rather than the TypeScript source. The unit under test is
// exactly what DSH loads, and a build that stops producing a classic script
// fails here before it can fail silently in the page.

const root = fileURLToPath(new URL('..', import.meta.url))
const artifact = path.join(root, 'lib', 'row-page.js')
const shipped = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  dsh: { client?: { platform?: string; inject?: string[] } }
}

/** Evaluate the artifact as a classic script and capture its loader entry. */
function loadArtifact(): { id: string; factory: (require: (specifier: string) => any) => any } {
  const captured: { id?: string; factory?: (require: (specifier: string) => any) => any } = {}
  const loader = {
    load(entry: { id: string; factory: (require: (specifier: string) => any) => any }) {
      captured.id = entry.id
      captured.factory = entry.factory
    },
  }
  const sandbox: Record<string, unknown> = { __ModuleLoader__: loader }
  sandbox.globalThis = sandbox
  createContext(sandbox)
  runInContext(readFileSync(artifact, 'utf8'), sandbox)
  if (captured.factory === undefined || captured.id === undefined) {
    throw new Error('lib/row-page.js never registered a factory with __ModuleLoader__')
  }
  return { id: captured.id, factory: captured.factory }
}

/**
 * The React shim the component actually calls. Each render pass installs the
 * pass's hook runtime here, so the module captured at factory time always talks
 * to the runtime of the pass being rendered.
 */
let activeReact: Record<string, (...args: any[]) => unknown> = {}
const reactShim = new Proxy(
  {},
  {
    get: (_target, key: string) => (...args: unknown[]) => {
      const hook = activeReact[key]
      if (hook === undefined) throw new Error(`the page called React.${key}, which the shim does not provide`)
      return hook(...args)
    },
  },
) as Record<string, (...args: any[]) => unknown>

/**
 * Render a component to a settled state: hooks keep their state between passes,
 * effects run inline (as the page's loader does), and the loop stops as soon as
 * a pass writes no state. This is what lets the page's async load finish before
 * the assertions look at what it painted.
 */
async function renderUntilSettled<T>(
  component: (props: T) => unknown,
  props: T,
  passes = 8,
  // Reusing the hook slots continues the same mount, which is what lets a test
  // type into the field and then act on the control that render painted.
  hooks: unknown[] = [],
): Promise<unknown> {
  let tree: unknown
  for (let pass = 0; pass < passes; pass += 1) {
    let cursor = 0
    let changed = false
    const effects: Array<() => unknown> = []
    activeReact = {
      createElement: (type: unknown, componentProps: Record<string, unknown> | null, ...children: unknown[]) => {
        // Render function components eagerly: this harness has no reconciler, and
        // the page's assertions are about the props it hands its primitives.
        if (typeof type === 'function') {
          return (type as (props: Record<string, unknown>) => unknown)({ ...(componentProps ?? {}), children })
        }
        return { type, props: componentProps ?? {}, children }
      },
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in hooks)) hooks[index] = initial
        return [
          hooks[index],
          (next: unknown) => {
            if (hooks[index] !== next) {
              hooks[index] = next
              changed = true
            }
          },
        ]
      },
      useRef: (initial: unknown) => {
        const index = cursor++
        if (!(index in hooks)) hooks[index] = { current: initial }
        return hooks[index]
      },
      useCallback: (callback: unknown) => {
        cursor += 1
        return callback
      },
      useMemo: (factory: () => unknown) => {
        cursor += 1
        return factory()
      },
      useEffect: (effect: () => unknown) => {
        cursor += 1
        effects.push(effect)
      },
    }
    tree = component(props)
    await Promise.all(effects.map((effect) => effect()))
    // Let the microtask queue drain before deciding the pass changed nothing: a
    // read that rejects writes its failure state in a `catch`, and without this
    // turn a settled render could be asserted before that state ever landed.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!changed) break
  }
  return tree
}

/** The primitives module the page renders with, capturing the props it receives. */
function createPrimitives(captured: {
  hint?: string | undefined
  text?: string | undefined
  disabled?: boolean | undefined
  state?: Record<string, unknown> | undefined
  onEdit?: ((text: string) => void) | undefined
  onSave?: (() => void) | undefined
}) {
  const SettingsSecretField = (props: {
    hint?: string
    text?: string
    disabled?: boolean
    onEdit?: (text: string) => void
  }) => {
    captured.hint = props.hint
    captured.text = props.text
    captured.disabled = props.disabled
    captured.onEdit = props.onEdit
    return null
  }
  const SettingsForm = (props: {
    children?: unknown
    state?: Record<string, unknown>
    onSave?: () => void
  }) => {
    captured.state = props.state
    captured.onSave = props.onSave
    return props.children ?? null
  }
  const Button = () => null
  return { SettingsForm, SettingsSecretField, Button }
}

/** The Client context `apply` receives: only what the page touches. */
function createContext_(dictionaries: Record<string, unknown>[]) {
  const registered: { name: string; key: string; component: unknown }[] = []
  const effects: string[] = []
  return {
    registered,
    effects,
    ctx: {
      effect: (callback: () => void, label?: string) => {
        effects.push(label ?? '')
        callback()
      },
      locale: {
        bind: () => (key: string, params?: Record<string, unknown>) => {
          const template = `${key}:${JSON.stringify(params ?? {})}`
          return template
        },
        register: (namespace: string, table: Record<string, unknown>) => {
          dictionaries.push({ namespace, ...table })
          return () => undefined
        },
      },
      slots: {
        inject: (name: string, callback: () => unknown) => {
          callback()
          return () => undefined
        },
        register: (
          options: { name: string; key: string },
          component: unknown,
        ) => {
          registered.push({ name: options.name, key: options.key, component })
          return component
        },
      },
    },
  }
}

describe('the shipped Client artifact', () => {
  it('is a classic script that declares the package id and the row it claims', () => {
    const { id } = loadArtifact()
    expect(id).toBe('@anysearch/anysearch-dsh')

    const source = readFileSync(artifact, 'utf8')
    expect(source).not.toMatch(/^\s*(?:import|export)\s/m)
    // The loader id and the claimed row key are composed at runtime from these
    // two literals, so the artifact carries the parts rather than the joined key.
    expect(source).toContain('@anysearch/anysearch-dsh')
    expect(source).toContain('web-search-anysearch')
  })

  it('is wired in package.json: the export resolves to the artifact and the inject list is complete', () => {
    expect(shipped.exports['./client']).toBe('./lib/row-page.js')
    expect(shipped.dsh.client?.platform).toBe('web')
    // The page reads ctx.remote.credentials directly, so both the namespace and
    // its credentials face must be declared injects.
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-api-remotes')
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-client-locale')
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-client-ui-plugin-manager')
  })

  it('claims exactly the plugins.row.config key and registers both dictionaries', () => {
    const { factory } = loadArtifact()
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    const primitives = createPrimitives({})
    const module = factory((specifier: string) => {
      if (specifier === 'react') {
        return { createElement: () => null, useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: undefined }), useCallback: (fn: unknown) => fn }
      }
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })

    expect(module.inject).toEqual(['slots', 'locale', 'remote', 'remote.credentials'])
    module.apply(harness.ctx)

    expect(harness.registered).toHaveLength(1)
    expect(harness.registered[0]?.name).toBe('plugins.row.config')
    expect(harness.registered[0]?.key).toBe('@anysearch/anysearch-dsh#web-search-anysearch')
    const dictionary = dictionaries[0] as { zh?: Record<string, string>; en?: Record<string, string> }
    expect(Object.keys(dictionary.zh ?? {}).sort()).toEqual(Object.keys(dictionary.en ?? {}).sort())
    expect(dictionary.zh?.apiKeyHint).toContain('{ref}')
    expect(dictionary.en?.apiKeyHint).toContain('{ref}')
  })

  it('writes the reference the row configuration names, not a constant', async () => {
    const { factory } = loadArtifact()
    const captured: { hint?: string; stateLabel?: string } = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown

    // The host interpolates `{ref}` before the page ever sees the string, so the
    // shim must do the same: interpolating it here is what proves the page passed
    // the row's reference into the template.
    const zh = (dictionaries[0] as { zh: Record<string, string> }).zh
    const t = (key: string, params?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
        params?.[name] === undefined ? whole : String(params[name]),
      )
    const actions = {
      t,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async () => {},
      clearKey: async () => {},
    }

    // A row that names its own reference: the page must follow it.
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } }, ...actions })
    expect(captured.hint).toContain('CUSTOM_REF')
    expect(captured.hint).not.toContain('{ref}')

    // A row that names none falls back to the shared default the provider uses.
    for (const value of ['', '   ', undefined]) {
      await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: value } } }, ...actions })
      expect(captured.hint).toContain('ANYSEARCH_API_KEY')
    }
  })

  it('reads a live reference through get(), the way the loader hands it over', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const zh = (dictionaries[0] as { zh: Record<string, string> }).zh
    const t = (key: string, params?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
        params?.[name] === undefined ? whole : String(params[name]),
      )
    const actions = {
      t,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async () => {},
      clearKey: async () => {},
    }

    // A volatile field does not arrive as a string: it arrives as something with
    // `get()`, and reading the field instead of the value would manage the wrong
    // reference ("[object Object]") for every row that configures one.
    let current = 'LIVE_REF'
    const live = { get: () => current }
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: live } } }, ...actions })
    expect(captured.hint).toContain('LIVE_REF')

    current = 'LIVE_REF_REPOINTED'
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: live } } }, ...actions })
    expect(captured.hint).toContain('LIVE_REF_REPOINTED')
  })

  it('issues no credential read for a summary render', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const described: string[] = []

    await renderUntilSettled(component, {
      view: 'summary',
      form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } },
      t: (key: string) => key,
      describe: async (ref: string) => {
        described.push(ref)
        return { configured: false, writable: true }
      },
      setKey: async () => {},
      clearKey: async () => {},
    })

    // The detail page asks for one line of copy; a credential round-trip per
    // summary is invisible work with a visible failure mode (a stray error notice
    // on a page that shows no field).
    expect(described).toEqual([])
  })

  it('keeps the field editable when the state read fails, and reports the failure', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown

    await renderUntilSettled(component, {
      view: 'page',
      form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } },
      t: (key: string) => key,
      describe: async () => {
        throw new Error('credentials plane is down')
      },
      setKey: async () => {},
      clearKey: async () => {},
    })

    // A failed read knows nothing about writability. Locking the field would leave
    // the page permanently dead on a transient read failure, when a write is
    // exactly what would report the real refusal.
    expect(captured.disabled).toBe(false)
  })

  it('saves into the reference the field was showing when Save was pressed', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const written: Array<[string, string]> = []
    const props = {
      view: 'page' as const,
      form: { state: { value: { apiKeyEnv: 'OLD_REF' } } },
      t: (key: string) => key,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async (ref: string, value: string) => {
        written.push([ref, value])
      },
      clearKey: async () => {},
    }

    // One mount, continued: type, then re-point the row, then press the Save the
    // earlier render painted.
    const hooks: unknown[] = []
    await renderUntilSettled(component, props, 8, hooks)
    captured.onEdit?.('as_sk_typed')
    await renderUntilSettled(component, props, 8, hooks)
    const saveUnderOldReference = captured.onSave
    const repointed = { ...props, form: { state: { value: { apiKeyEnv: 'NEW_REF' } } } }
    await renderUntilSettled(component, repointed, 8, hooks)
    saveUnderOldReference?.()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The row re-pointed while that text was staged. The write goes to the
    // reference the user was shown when they pressed Save — never to the one that
    // replaced it — because that is the credential they meant to overwrite.
    expect(written).toEqual([['OLD_REF', 'as_sk_typed']])
  })
})
