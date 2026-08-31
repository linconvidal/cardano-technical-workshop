type PollerClock = Pick<Window, "setTimeout" | "clearTimeout">

export class StatusPoller {
  private timer?: number
  private generation = 0

  constructor(private readonly clock: PollerClock = window) {}

  schedule(
    action: () => Promise<void>,
    shouldContinue: () => boolean,
    attemptsRemaining: number,
    delayMs = 4_000,
  ) {
    this.stop()
    this.scheduleNext(action, shouldContinue, attemptsRemaining, delayMs, this.generation)
  }

  stop() {
    this.generation += 1
    if (this.timer === undefined) return
    this.clock.clearTimeout(this.timer)
    this.timer = undefined
  }

  private scheduleNext(
    action: () => Promise<void>,
    shouldContinue: () => boolean,
    attemptsRemaining: number,
    delayMs: number,
    generation: number,
  ) {
    if (generation !== this.generation || attemptsRemaining <= 0 || !shouldContinue()) return
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined
      const reschedule = () => {
        if (generation !== this.generation || !shouldContinue()) return
        this.scheduleNext(action, shouldContinue, attemptsRemaining - 1, delayMs, generation)
      }
      void Promise.resolve().then(action).then(reschedule, reschedule)
    }, delayMs)
  }
}
