import { useCallback, useMemo, useState } from 'react';

const REPEAT_SUFFIX_RE = /_r[12]$/;

export function stripRepeatSuffix(key: string): string {
  return key.replace(REPEAT_SUFFIX_RE, '');
}

function rotateFromIndex(
  durations: Record<string, number>,
  startIndex: number,
): Record<string, number> {
  const keys = Object.keys(durations);
  if (startIndex <= 0) return durations;

  const result: Record<string, number> = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[(startIndex + index) % keys.length];
    result[key] = durations[key];
  }
  return result;
}

function buildLockedDurations(key: string, duration: number): Record<string, number> {
  return { [`${key}_r1`]: duration, [`${key}_r2`]: duration };
}

export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);

  const durations = useMemo(() => {
    if (locked) {
      const key = sceneKeys[activeIndex];
      return buildLockedDurations(key, baseDurations[key]);
    }
    return rotateFromIndex(baseDurations, activeIndex);
  }, [activeIndex, baseDurations, locked, sceneKeys]);

  const onSceneChange = useCallback(
    (rawKey: string) => {
      const index = sceneKeys.indexOf(stripRepeatSuffix(rawKey));
      if (index >= 0) setActiveIndex(index);
      setTick((value) => value + 1);
    },
    [sceneKeys],
  );

  const jumpTo = useCallback((index: number) => {
    setLocked(false);
    setActiveIndex(index);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  const toggleLock = useCallback(() => {
    setLocked((value) => !value);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  return {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration: baseDurations[sceneKeys[activeIndex]] ?? 0,
    onSceneChange,
    jumpTo,
    toggleLock,
  };
}