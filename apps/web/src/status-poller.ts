export class StatusPoller {
  private timer?: number

  schedule(
    action: () => Promise<void>,
    shouldContinue: () => boolean,
    attemptsRemaining: number,
    delayMs = 4_000,
  ) {
    if (attemptsRemaining <= 0 || !shouldContinue()) return
    this.stop()
    this.timer = window.setTimeout(() => {
      void action().finally(() => {
        if (shouldContinue()) this.schedule(action, shouldContinue, attemptsRemaining - 1, delayMs)
      })
    }, delayMs)
  }

  stop() {
    if (this.timer === undefined) return
    window.clearTimeout(this.timer)
    this.timer = undefined
  }
}
