export class UpdateFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateFetchError";
  }
}

export class UpdateChecksumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateChecksumError";
  }
}

export class UpdateDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateDownloadError";
  }
}

export class UpdateExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateExtractionError";
  }
}
