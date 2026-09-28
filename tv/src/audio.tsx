import React, {useCallback, useImperativeHandle, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Video, {type VideoRef} from 'react-native-video';

/**
 * Playing a triplet in noise on a television.
 *
 * On the web this is four lines of Web Audio: one buffer source for the
 * noise, three for the digits, a gain node on each, done. React Native
 * has no equivalent. There is no mixing graph, no sample-accurate
 * scheduling, and no way to say "start this at exactly that moment".
 *
 * What there is: a video component with a `volume` prop and a `repeat`
 * prop. So the noise loops on one player at full volume, the digits play
 * one after another on a second player, and the ratio is set on the
 * second player's volume. Both files are levelled to the same figure by
 * the pipeline, so that volume is exactly the signal-to-noise ratio the
 * procedure asked for.
 *
 * What this costs, stated plainly because it is a real limitation rather
 * than a detail: the gap between digits is whatever the player takes to
 * swap sources, which is a few tens of milliseconds and not constant.
 * The published procedure does not require a fixed gap, and the digits
 * themselves are unaffected, so the measurement stands. It is still the
 * part of this app most worth replacing with a native module, and it is
 * in the friction log as a gap in the platform.
 *
 * The noise starts before the digits and stops after them. Noise that
 * begins with the speech tells a listener exactly when to attend, which
 * turns a test of hearing into a test of reaction.
 */

export interface TripletPlayerHandle {
  /** Play the noise alone, for setting a comfortable level. */
  playNoise(): void;
  /** Play one triplet at a ratio; resolves when the noise has stopped. */
  playTriplet(digits: number[], snrDb: number): Promise<void>;
  stop(): void;
}

/*
  Metro resolves a bundled asset to a numeric id at bundle time. The
  component's typings describe a source object, so the ids are cast
  once here rather than at every use.
*/
type AssetSource = Parameters<typeof Video>[0]['source'];
const NOISE = require('../assets/noise.wav') as AssetSource;

/** Bundled by Metro as numeric asset ids, so they cannot be built by name. */
const DIGIT_SOURCES: Record<number, AssetSource> = {
  1: require('../assets/digit-1.wav'),
  2: require('../assets/digit-2.wav'),
  3: require('../assets/digit-3.wav'),
  4: require('../assets/digit-4.wav'),
  5: require('../assets/digit-5.wav'),
  6: require('../assets/digit-6.wav'),
  8: require('../assets/digit-8.wav'),
  9: require('../assets/digit-9.wav'),
};

/** Seconds of noise before the first digit and after the last. */
const LEAD_IN = 900;
const LEAD_OUT = 500;

export const TripletPlayer = React.forwardRef<TripletPlayerHandle>((_props, ref) => {
  const [noisePlaying, setNoisePlaying] = useState(false);
  const [speechSource, setSpeechSource] = useState<AssetSource | null>(null);
  const [speechVolume, setSpeechVolume] = useState(1);
  const speechRef = useRef<VideoRef | null>(null);
  const queue = useRef<number[]>([]);
  const onDigitEnd = useRef<(() => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) {
      clearTimeout(t);
    }
    timers.current = [];
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    queue.current = [];
    onDigitEnd.current = null;
    setSpeechSource(null);
    setNoisePlaying(false);
  }, [clearTimers]);

  useImperativeHandle(
    ref,
    () => ({
      playNoise() {
        stop();
        setNoisePlaying(true);
        timers.current.push(setTimeout(() => setNoisePlaying(false), 4000));
      },

      playTriplet(digits, snrDb) {
        stop();
        // Both files are levelled to the same figure, so the ratio is
        // exactly this gain. Capped at one because a player cannot make
        // a file louder than itself without distorting it, and a ratio
        // above zero is outside what this test presents anyway.
        setSpeechVolume(Math.min(1, Math.pow(10, snrDb / 20)));
        setNoisePlaying(true);

        return new Promise<void>(resolve => {
          queue.current = [...digits];

          const next = () => {
            const digit = queue.current.shift();
            if (digit === undefined) {
              timers.current.push(
                setTimeout(() => {
                  setNoisePlaying(false);
                  setSpeechSource(null);
                  resolve();
                }, LEAD_OUT),
              );
              return;
            }
            // Setting the same source twice in a row would not restart
            // it, and a triplet never repeats a digit, so this is safe.
            setSpeechSource(DIGIT_SOURCES[digit] ?? null);
          };

          onDigitEnd.current = next;
          timers.current.push(setTimeout(next, LEAD_IN));
        });
      },

      stop,
    }),
    [stop],
  );

  return (
    <View style={styles.hidden} pointerEvents="none">
      <Video
        source={NOISE}
        repeat
        paused={!noisePlaying}
        volume={1}
        style={styles.hidden}
      />
      {speechSource !== null && (
        <Video
          ref={speechRef}
          source={speechSource}
          paused={false}
          volume={speechVolume}
          style={styles.hidden}
          onEnd={() => onDigitEnd.current?.()}
        />
      )}
    </View>
  );
});

TripletPlayer.displayName = 'TripletPlayer';

const styles = StyleSheet.create({
  hidden: {width: 0, height: 0, opacity: 0},
});
