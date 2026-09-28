import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View, useTVEventHandler} from 'react-native';
import Video, {type VideoRef} from 'react-native-video';
import {
  listeningLevelDb,
  SessionRecorder,
  type ProgrammeAudio,
  type Session,
} from '@earshot/core';

/**
 * Watching something, and measuring the listening while it happens.
 *
 * This is the mechanism running for real rather than being described.
 * The programme's dialogue loudness is not a guess: the pipeline
 * measured it from this exact file with Amazon Transcribe locating the
 * speech and ffmpeg measuring the loudness over those stretches and
 * nowhere else. The volume is not a guess either, because this player
 * owns it.
 *
 * That second point is the honest limitation and the reason the volume
 * control is on screen. A React Native app cannot read the system
 * volume that the remote's own volume keys set; that needs a native
 * module around AudioManager. So the player has its own level, the
 * viewer sets it with left and right, and the app knows exactly what
 * they chose. For playback the app owns, that is the whole measurement.
 *
 * For playback the app does not own, nothing here is possible at all,
 * which is friction log entry 12 and the reason the history on the home
 * screen is sample data.
 */

const SINTEL = require('../assets/sintel.mp4');
const ANALYSIS = require('../assets/sintel.analysis.json') as {
  id: string;
  dialogueLufs: number;
  speechSeconds: number;
  durationSec: number;
  gatingDifferenceDb: number;
};

const PROGRAMME: ProgrammeAudio = {
  id: ANALYSIS.id,
  dialogueLufs: ANALYSIS.dialogueLufs,
  speechSeconds: ANALYSIS.speechSeconds,
};

const COLOURS = {
  ink: '#f4f3f1',
  muted: '#a9aeb6',
  line: '#2d323b',
  primary: '#7aa2ff',
  primaryInk: '#0e1016',
  panel: 'rgba(16,17,20,0.82)',
};

const STEP = 0.05;

export function Watch({
  onDone,
}: {
  onDone: (session: Session | null) => void;
}) {
  const video = useRef<VideoRef | null>(null);
  const recorder = useRef<SessionRecorder | null>(null);
  const position = useRef(0);

  const [volume, setVolume] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [watched, setWatched] = useState(0);
  const [rehears, setRehears] = useState(0);

  if (recorder.current === null) {
    recorder.current = new SessionRecorder(
      PROGRAMME,
      new Date().toISOString().slice(0, 10),
      0.5,
      false,
      // A demonstration cannot ask for five minutes before it records
      // anything, so this one accepts a shorter sitting and says so.
      {minWatchedSec: 10},
    );
  }

  const adjust = useCallback((by: number) => {
    setVolume(current => {
      const next = Math.min(1, Math.max(0.05, Number((current + by).toFixed(2))));
      recorder.current?.volumeChanged(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setLevel(
      listeningLevelDb({
        startedAt: '',
        programme: PROGRAMME,
        volume,
        watchedSeconds: 0,
        captionsOn: false,
        rehearSeeks: 0,
      }),
    );
  }, [volume]);

  /*
    The remote, rather than only the on-screen buttons. Left and right
    are the volume, because that is the control this screen is about;
    rewind is the "what did he say" jump the model counts.
  */
  useTVEventHandler(event => {
    switch (event?.eventType) {
      case 'right':
        adjust(STEP);
        break;
      case 'left':
        adjust(-STEP);
        break;
      case 'playPause':
        setPaused(p => !p);
        break;
      case 'rewind':
        rehear();
        break;
      default:
        break;
    }
  });

  const rehear = useCallback(() => {
    const from = position.current;
    const to = Math.max(0, from - 8);
    video.current?.seek(to);
    recorder.current?.seeked(from, to);
    setRehears(r => r + 1);
  }, []);

  const finish = useCallback(() => {
    onDone(recorder.current?.finish() ?? null);
  }, [onDone]);

  return (
    <View style={styles.screen}>
      <Video
        ref={video}
        source={SINTEL}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused}
        volume={volume}
        onProgress={({currentTime}) => {
          position.current = currentTime;
          recorder.current?.tick(currentTime);
          setWatched(recorder.current?.seconds ?? 0);
        }}
        onEnd={finish}
      />

      <View style={styles.panel}>
        <Text style={styles.title}>
          Sintel, Blender Foundation, CC BY 3.0
        </Text>
        <Text style={styles.body}>
          Dialogue in this film measures {ANALYSIS.dialogueLufs} LUFS, taken
          over the {Math.round(ANALYSIS.speechSeconds)} seconds where somebody
          is actually speaking. Nothing here is estimated.
        </Text>

        <View style={styles.row}>
          <Text style={styles.figureLabel}>Volume</Text>
          <Text style={styles.figure}>{Math.round(volume * 100)}%</Text>
          <Text style={styles.figureLabel}>Listening level</Text>
          <Text style={styles.figure}>
            {level === null ? '-' : `${level.toFixed(1)} dB`}
          </Text>
          <Text style={styles.figureLabel}>Watched</Text>
          <Text style={styles.figure}>{Math.round(watched)}s</Text>
          <Text style={styles.figureLabel}>Went back</Text>
          <Text style={styles.figure}>{rehears}</Text>
        </View>

        <Text style={styles.hint}>
          Left and right change the volume. Rewind goes back eight seconds,
          which is the jump the model counts. This player owns its own level
          because an app cannot read the one the remote sets.
        </Text>

        <View style={styles.buttons}>
          <Button label="Quieter" onPress={() => adjust(-STEP)} />
          <Button label="Louder" onPress={() => adjust(STEP)} preferred />
          <Button
            label="Hear that again"
            onPress={rehear}
          />
          <Button
            label={captions ? 'Subtitles off' : 'Subtitles on'}
            onPress={() => {
              setCaptions(c => {
                recorder.current?.captionsChanged(!c);
                return !c;
              });
            }}
          />
          <Button label="Stop watching" onPress={finish} />
        </View>
      </View>
    </View>
  );
}

function Button({
  label,
  onPress,
  preferred,
}: {
  label: string;
  onPress: () => void;
  preferred?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferred ?? false}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.button, focused && styles.buttonFocused]}>
      <Text style={[styles.buttonText, focused && {color: COLOURS.primaryInk}]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#000'},
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: '5%',
    paddingVertical: 24,
    backgroundColor: COLOURS.panel,
  },
  title: {color: COLOURS.ink, fontSize: 20, fontWeight: '600'},
  body: {color: COLOURS.muted, fontSize: 18, lineHeight: 26, marginTop: 8, maxWidth: 1100},
  row: {flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14, flexWrap: 'wrap'},
  figureLabel: {color: COLOURS.muted, fontSize: 16},
  figure: {color: COLOURS.ink, fontSize: 24, fontWeight: '700', marginRight: 18},
  hint: {color: COLOURS.muted, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 1100},
  buttons: {flexDirection: 'row', gap: 12, marginTop: 16, flexWrap: 'wrap'},
  button: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLOURS.line,
    backgroundColor: '#1f222a',
  },
  buttonFocused: {borderColor: COLOURS.primary, backgroundColor: COLOURS.primary},
  buttonText: {color: COLOURS.muted, fontSize: 18, fontWeight: '600'},
});
