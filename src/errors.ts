export class PictomancerError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`pictomancer: HTTP ${status}: ${detail}`);
    this.name = "PictomancerError";
    this.status = status;
    this.detail = detail;
  }
}
