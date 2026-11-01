/** The upload as a whole is unusable (as opposed to one bad row, which becomes a candidate). */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
