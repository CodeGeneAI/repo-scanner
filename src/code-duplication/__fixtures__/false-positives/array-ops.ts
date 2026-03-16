// These functions look structurally similar but have different control flow
// They should NOT be detected as clones

export function sumPositive(numbers: number[]): number {
  let total = 0;
  for (const num of numbers) {
    if (num > 0) {
      total += num;
    }
  }
  return total;
}

export function countNegative(numbers: number[]): number {
  let count = 0;
  for (const num of numbers) {
    if (num < 0) {
      count++;
    }
  }
  return count;
}

export function findMax(numbers: number[]): number | undefined {
  let max: number | undefined;
  for (const num of numbers) {
    if (max === undefined || num > max) {
      max = num;
    }
  }
  return max;
}
