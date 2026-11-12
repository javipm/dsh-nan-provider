import test from 'node:test'
import assert from 'node:assert/strict'

// Minimal browser shell: the loader records the registration and the factory
// gets a fake `react` (registration only touches React.createElement at render
// time, which these tests never invoke).
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
}

await import('../client.js')

const fakeReact = {
  createElement: () => null,
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useCallback: fn => fn,
}

const moduleExports = registration.factory(specifier => {
  if (specifier === 'react') return fakeReact
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { Button: () => null }
  throw new Error(`unexpected external: ${specifier}`)
})

test('client module registers under the package id', () => {
  assert.equal(registration.id, 'dsh-nan-provider')
  assert.equal(moduleExports.name, 'nan-provider-client')
  assert.deepEqual(moduleExports.inject, ['slots'])
  assert.equal(typeof moduleExports.apply, 'function')
})

test('apply registers the settings section and its icon', () => {
  const registered = []
  const injected = []
  const ctx = {
    slots: {
      inject(name, factory) {
        injected.push(name)
        factory()
      },
      register(options, component) {
        registered.push({ options, component })
        return () => {}
      },
    },
  }

  moduleExports.apply(ctx)

  assert.deepEqual(injected, ['settings.section', 'conversation.composer.dock', 'settings.section.icon'])
  assert.equal(registered.length, 3)
  assert.equal(registered[0].options.name, 'settings.section')
  assert.equal(registered[0].options.id, 'nan-provider')
  assert.equal(registered[0].options.label(), 'NaN')
  assert.equal(typeof registered[0].component, 'function')
  assert.equal(registered[1].options.name, 'conversation.composer.dock')
  assert.equal(registered[1].options.id, 'nan-usage')
  assert.equal(typeof registered[1].component, 'function')
  assert.equal(registered[2].options.name, 'settings.section.icon')
})
