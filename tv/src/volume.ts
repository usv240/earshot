import {NativeModules} from 'react-native';

/**
 * The set's own volume, when the platform will say.
 *
 * The native side is forty lines around AudioManager in
 * android/app/src/main/java/com/earshottv/SystemVolumeModule.kt. It is
 * absent under Jest and on any build that did not include it, and the
 * player then owns its level alone, which is what it did before this
 * existed. The flag lets the screen say which of the two it is doing.
 */

export interface SetVolume {
  index: number;
  max: number;
  /** index over max, so the model's 0 to 1 volume can carry it. */
  fraction: number;
}

interface Native {
  get(): Promise<{index: number; max: number}>;
}

const native = (NativeModules as {SystemVolume?: Native}).SystemVolume;

export const SYSTEM_VOLUME_AVAILABLE = typeof native?.get === 'function';

export async function readSetVolume(): Promise<SetVolume | null> {
  if (!native) {
    return null;
  }
  try {
    const {index, max} = await native.get();
    if (!(max > 0)) {
      return null;
    }
    return {index, max, fraction: index / max};
  } catch {
    return null;
  }
}

/** What the viewer is actually hearing: this player's gain, on the set's volume. */
export function effectiveVolume(player: number, set: SetVolume | null): number {
  return set ? player * set.fraction : player;
}
