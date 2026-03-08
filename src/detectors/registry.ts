import type { Detector } from "./types";

const detectors = new Map<string, Detector>();

export const registerDetector = (detector: Detector): void => {
  detectors.set(detector.id, detector);
};

export const getDetectors = (): readonly Detector[] => {
  return [...detectors.values()];
};
