export function processQueue(queue: Queue, config: ProcessConfig) {
  const batch: Item[] = [];
  const errors: Error[] = [];
  let processed = 0;

  while (queue.hasItems()) {
    const item = queue.dequeue();
    if (!item) break;

    try {
      const result = transform(item, config.rules);
      if (result.valid) {
        batch.push(result.data);
        processed++;
      } else {
        errors.push(new ValidationError(item.id, result.reason));
      }
    } catch (err) {
      errors.push(err as Error);
      if (errors.length > config.maxErrors) {
        throw new BatchError("Too many errors", errors);
      }
    }

    if (batch.length >= config.batchSize) {
      flush(batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    flush(batch);
  }

  return { processed, errors: errors.length };
}
