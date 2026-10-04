/** Runs jobs one at a time: the page and the history are shared state, so tool calls and background saves must not interleave. */
export class Exclusive {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
