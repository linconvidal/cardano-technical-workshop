import assert from "node:assert/strict"
import test from "node:test"

import { StatusPoller } from "./status-poller.js"

const controlledClock = () => {
  let nextId = 0
  const callbacks = new Map<number, TimerHandler>()
  const clock = {
    setTimeout: ((handler: TimerHandler) => {
      const id = ++nextId
      callbacks.set(id, handler)
      return id
    }) as Window["setTimeout"],
    clearTimeout: ((id: number | undefined) => {
      if (id !== undefined) callbacks.delete(id)
    }) as Window["clearTimeout"],
  }
  const runNext = async () => {
    const next = callbacks.entries().next().value as [number, TimerHandler] | undefined
    assert.ok(next, "a poll must be scheduled")
    callbacks.delete(next[0])
    if (typeof next[1] === "function") next[1]()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { clock, callbacks, runNext }
}

test("status polling honors the attempt budget and continues after a handled action rejection", async () => {
  const { clock, callbacks, runNext } = controlledClock()
  const poller = new StatusPoller(clock)
  let attempts = 0

  poller.schedule(async () => {
    attempts += 1
    if (attempts === 1) throw new Error("temporary lookup failure")
  }, () => true, 3, 1)

  await runNext()
  await runNext()
  await runNext()
  assert.equal(attempts, 3)
  assert.equal(callbacks.size, 0)
})

test("status polling stops when the state changes or the timer is cancelled", async () => {
  const { clock, callbacks, runNext } = controlledClock()
  const poller = new StatusPoller(clock)
  let active = true
  let attempts = 0

  poller.schedule(async () => {
    attempts += 1
    active = false
  }, () => active, 4, 1)
  await runNext()
  assert.equal(attempts, 1)
  assert.equal(callbacks.size, 0)

  active = true
  let finishInFlight = () => {}
  poller.schedule(() => new Promise<void>((resolve) => { finishInFlight = resolve }), () => active, 4, 1)
  await runNext()
  poller.stop()
  finishInFlight()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(callbacks.size, 0)

  poller.schedule(async () => { attempts += 1 }, () => active, 4, 1)
  poller.stop()
  assert.equal(callbacks.size, 0)
})
