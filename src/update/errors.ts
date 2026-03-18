/** Base class for all repo-scanner update errors. */
class UpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class UpdateFetchError extends UpdateError {}
export class UpdateChecksumError extends UpdateError {}
export class UpdateDownloadError extends UpdateError {}
export class UpdateExtractionError extends UpdateError {}
export class UpdatePlatformError extends UpdateError {}
export class UpdateConfigError extends UpdateError {}
