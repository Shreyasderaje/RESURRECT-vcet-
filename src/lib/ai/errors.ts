export class GeminiClientError extends Error {
  public readonly code:
    | "MISSING_API_KEY"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MODEL_ERROR"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE";
  public readonly statusCode: number;

  constructor(
    code: GeminiClientError["code"],
    message: string,
    statusCode = 500
  ) {
    super(message);
    this.name = "GeminiClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}