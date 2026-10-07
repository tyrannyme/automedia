/**
 * Thrown by code that also runs on codec workers, which load it without the
 * app's import aliases. Callers turn it into an AppError with the same code.
 */
export class CodecError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
