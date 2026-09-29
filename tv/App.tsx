import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  defaultOfferOptions,
  drift,
  explain,
  listeningLevelDb,
  shouldOffer,
  type OfferDecision,
  type Session,
} from '@earshot/core';
import {
  DEFAULT_LENGTH,
  interpret,
  LENGTHS,
  lengthFor,
  Screen,
  type Interpretation,
  type ScreenResult,
} from 'digits-in-noise';
import {TripletPlayer, type TripletPlayerHandle} from './src/audio';
import {HISTORY, SAMPLE} from './src/sessions';
import {DeviceSessionStore, PERSISTENCE_AVAILABLE} from './src/store';
import {Watch} from './src/watch';

/**
 * Earshot on a television.
 *
 * The same engine as the web reader, driven by a remote instead of a
 * keypad. The package does not know the difference, which is why the
 * accuracy figures measured against the simulation describe this too.
 *
 * What only the television can do is the half that comes before the
 * test. A browser cannot know how loud you have your set, or that you
 * turned the subtitles on in March, or that you go back to hear a line
 * four times an hour. The living room is where the evidence is, and this
 * is the app that can see it.
 *
 * The home screen therefore shows what was noticed and why, in
 * sentences with the numbers in them, before offering anything. A
 * television that says "take a hearing test" with no account of itself
 * is a television that gets unplugged.
 */

const COLOURS = {
  bg: '#101114',
  surface: '#191c21',
  raised: '#232830',
  ink: '#f4f3f1',
  muted: '#a9aeb6',
  line: '#2d323b',
  primary: '#7aa2ff',
  primaryInk: '#0e1016',
  warn: '#e0b45c',
};

type Stage = 'home' | 'watch' | 'level' | 'playing' | 'answering' | 'result';

function TvButton({
  label,
  onPress,
  primary,
  preferred,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  preferred?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferred ?? false}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.button,
        primary && {backgroundColor: COLOURS.primary, borderColor: COLOURS.primary},
        focused && styles.buttonFocused,
        disabled && styles.buttonDisabled,
      ]}>
      <Text
        style={[
          styles.buttonText,
          primary && {color: COLOURS.primaryInk},
          focused && !primary && {color: COLOURS.ink},
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function App(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('home');
  const [entered, setEntered] = useState<number[]>([]);
  const [progress, setProgress] = useState({done: 0, total: 0});
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [reading, setReading] = useState<Interpretation | null>(null);
  const [declined, setDeclined] = useState(false);
  const [trials, setTrials] = useState<number>(DEFAULT_LENGTH);
  /*
    Sittings this app recorded itself, from its own player, against a
    dialogue loudness the pipeline measured. They sit alongside the
    sample history rather than replacing it, because the model needs
    months and a demonstration has minutes.
  */
  const [recorded, setRecorded] = useState<Session[]>([]);
  const store = useRef(new DeviceSessionStore());

  /*
    Sittings survive the app being closed, which is not a nicety. The
    model needs months before it has anything to say, so a history that
    forgets on restart is a product that can never reach its own
    threshold for speaking.
  */
  useEffect(() => {
    void store.current.all().then(setRecorded);
  }, []);

  const run = useRef<Screen | null>(null);
  const audio = useRef<TripletPlayerHandle | null>(null);

  /*
    What the player saw. Computed once: it is a fixed history here, and
    in a shipped app it changes only when a sitting ends, never while
    somebody is looking at this screen.
  */
  const decision: OfferDecision = useMemo(
    () =>
      shouldOffer(
        [...HISTORY, ...recorded],
        {declines: declined ? 2 : 0, completed: false},
        new Date().toISOString().slice(0, 10),
        true,
        defaultOfferOptions(),
      ),
    [declined, recorded],
  );
  const listening = useMemo(() => drift([...HISTORY, ...recorded]), [recorded]);

  const present = useCallback(async () => {
    const screen = run.current;
    if (!screen || !audio.current) {
      return;
    }
    if (screen.finished) {
      const finished = screen.result();
      setResult(finished);
      setReading(interpret(finished));
      setStage('result');
      return;
    }
    setStage('playing');
    setEntered([]);
    const trial = screen.current();
    setProgress(screen.progress);
    await audio.current.playTriplet(trial.digits, trial.snrDb);
    setStage('answering');
  }, []);

  const startRun = useCallback(() => {
    run.current = new Screen({trials}, Date.now() % 100000);
    setResult(null);
    setReading(null);
    void present();
  }, [present, trials]);

  const press = useCallback(
    (digit: number) => {
      if (stage !== 'answering') {
        return;
      }
      setEntered(current => {
        if (current.length >= 3) {
          return current;
        }
        const next = [...current, digit];
        if (next.length === 3) {
          // Deferred, so the state update is not doing two jobs.
          setTimeout(() => {
            run.current?.submit(next);
            void present();
          }, 0);
        }
        return next;
      });
    },
    [stage, present],
  );

  if (stage === 'watch') {
    return (
      <Watch
        onDone={session => {
          if (session) {
            void store.current.append(session);
            setRecorded(current => [...current, session]);
          }
          setStage('home');
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <TripletPlayer ref={audio} />

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.wordmark}>Earshot</Text>

        {stage === 'home' && (
          <View>
            {decision.offer ? (
              <View>
                <Text style={styles.heading}>Something worth a minute</Text>
                <Text style={styles.body}>{explain(decision.reasons)}</Text>
                <View style={styles.row}>
                  <TvButton
                    label="Check it, a minute or two"
                    primary
                    preferred
                    onPress={() => {
                      audio.current?.playNoise();
                      setStage('level');
                    }}
                  />
                  <TvButton label="Not now" onPress={() => setDeclined(true)} />
                  <TvButton label="Watch something" onPress={() => setStage('watch')} />
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.heading}>Nothing to report</Text>
                <Text style={styles.body}>
                  {decision.waitingFor.length > 0
                    ? `Waiting on: ${decision.waitingFor.join(' ')}`
                    : 'Nothing has changed in how this television is being listened to.'}
                </Text>
                <View style={styles.row}>
                  <TvButton
                    label="Watch something"
                    primary
                    preferred
                    onPress={() => setStage('watch')}
                  />
                  <TvButton
                    label="Check my hearing anyway"
                    onPress={() => {
                      audio.current?.playNoise();
                      setStage('level');
                    }}
                  />
                </View>
              </View>
            )}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>What a television could watch for</Text>
              <Text style={styles.panelBody}>
                How loud a programme&apos;s dialogue actually is, against the
                volume chosen for it. Not whether it was turned up, but how
                far past the programme it is being listened to.
              </Text>
              {listening && (
                <Text style={styles.figure}>
                  {listening.driftDb >= 0 ? '+' : ''}
                  {listening.driftDb.toFixed(1)} dB over {listening.spanDays} days,
                  across {listening.baselineCount + listening.recentCount} sittings
                </Text>
              )}
              <Text style={styles.panelBody}>
                There is no microphone in this app and no camera. Nothing about
                how you watch leaves this device.
              </Text>
              {recorded.length > 0 && !PERSISTENCE_AVAILABLE && (
                <Text style={styles.warn}>
                  Sittings are not being saved on this build, so they will be
                  lost when the app closes. A household needs months of
                  history before the model says anything, so the app says so
                  rather than appearing to work.
                </Text>
              )}
              {recorded.length > 0 && (
                <Text style={styles.figure}>
                  {recorded.length} sitting{recorded.length === 1 ? '' : 's'} recorded by
                  this app, at a listening level of{' '}
                  {listeningLevelDb(recorded[recorded.length - 1]!).toFixed(1)} dB
                </Text>
              )}
              {SAMPLE && (
                <Text style={styles.warn}>
                  The viewing history on this screen is sample data, and this
                  app is not collecting the real thing. No app on Fire TV can:
                  reading what another app is playing needs a permission Amazon
                  does not grant to third parties, so only the platform could
                  produce this signal. The check itself is real and the result
                  below it is yours.
                </Text>
              )}
            </View>
          </View>
        )}

        {stage === 'level' && (
          <View>
            <Text style={styles.heading}>Set the volume</Text>
            <Text style={styles.body}>
              That is the background noise on its own. Set the television to
              where you normally have it. Comfortable, not quiet, and nowhere
              near uncomfortable.
            </Text>
            <Text style={styles.body}>
              {trials} rounds, {lengthFor(trials).minutes}.
              {lengthFor(trials).recommended ? ' Recommended.' : ''}
            </Text>
            <View style={styles.row}>
              <TvButton
                label="Change length"
                onPress={() => {
                  // Cycle through the lengths the engine offers. The
                  // short ones exist in the table with their reasons but
                  // are not reachable from here.
                  const offered = LENGTHS.filter(l => l.offered).map(l => l.trials);
                  const at = offered.indexOf(trials);
                  setTrials(offered[(at + 1) % offered.length]!);
                }}
              />
              <TvButton label="Play it again" onPress={() => audio.current?.playNoise()} />
              <TvButton label="Begin" primary preferred onPress={startRun} />
            </View>
          </View>
        )}

        {(stage === 'playing' || stage === 'answering') && (
          <View>
            <Text style={styles.heading}>
              {stage === 'playing' ? 'Listen' : 'What did you hear?'}
            </Text>
            <Text style={styles.body}>
              {progress.done + 1} of {progress.total}
              {stage === 'answering' ? '. Guess if you are not sure.' : ''}
            </Text>

            <View style={styles.slots}>
              {[0, 1, 2].map(slot => (
                <View key={slot} style={styles.slot}>
                  <Text style={styles.slotText}>{entered[slot] ?? ''}</Text>
                </View>
              ))}
            </View>

            <View style={styles.keypad}>
              {[1, 2, 3, 4, 5, 6, 8, 9].map((digit, i) => (
                <TvButton
                  key={digit}
                  label={String(digit)}
                  preferred={i === 0}
                  disabled={stage !== 'answering'}
                  onPress={() => press(digit)}
                />
              ))}
            </View>
          </View>
        )}

        {stage === 'result' && result && reading && (
          <View>
            <Text style={styles.heading}>{reading.headline}</Text>
            {result.valid ? (
              <Text style={styles.figure}>
                Speech reception threshold {result.srtDb.toFixed(1)} dB signal to noise
              </Text>
            ) : (
              result.problems.map(problem => (
                <Text key={problem} style={styles.body}>
                  {problem}
                </Text>
              ))
            )}
            <Text style={styles.body}>{reading.nextStep}</Text>
            <Text style={styles.footnote}>
              Compared against: {reading.reference.label}
            </Text>
            <View style={styles.row}>
              <TvButton label="Done" primary preferred onPress={() => setStage('home')} />
              <TvButton label="Again" onPress={startRun} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: COLOURS.bg},
  page: {paddingHorizontal: '6%', paddingVertical: '4%'},
  wordmark: {color: COLOURS.ink, fontSize: 26, fontWeight: '700', marginBottom: 28},
  heading: {color: COLOURS.ink, fontSize: 44, fontWeight: '600', marginBottom: 18},
  body: {color: COLOURS.muted, fontSize: 24, lineHeight: 36, maxWidth: 1100, marginBottom: 14},
  figure: {color: COLOURS.ink, fontSize: 26, fontWeight: '600', marginVertical: 12},
  footnote: {color: COLOURS.muted, fontSize: 18, marginTop: 10},
  warn: {color: COLOURS.warn, fontSize: 18, lineHeight: 28, marginTop: 14, maxWidth: 1000},
  row: {flexDirection: 'row', gap: 16, marginTop: 22, flexWrap: 'wrap'},
  panel: {
    marginTop: 40,
    padding: 28,
    borderRadius: 16,
    backgroundColor: COLOURS.surface,
    borderWidth: 1,
    borderColor: COLOURS.line,
  },
  panelTitle: {color: COLOURS.ink, fontSize: 22, fontWeight: '600', marginBottom: 12},
  panelBody: {color: COLOURS.muted, fontSize: 20, lineHeight: 30, maxWidth: 1000},
  slots: {flexDirection: 'row', gap: 18, marginVertical: 26},
  slot: {
    width: 104,
    height: 120,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLOURS.line,
    backgroundColor: COLOURS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {color: COLOURS.ink, fontSize: 52, fontWeight: '600'},
  keypad: {flexDirection: 'row', flexWrap: 'wrap', gap: 14, maxWidth: 900},
  button: {
    paddingHorizontal: 30,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLOURS.line,
    backgroundColor: COLOURS.raised,
    minWidth: 92,
    alignItems: 'center',
  },
  buttonFocused: {borderColor: COLOURS.primary, backgroundColor: COLOURS.primary},
  buttonDisabled: {opacity: 0.35},
  buttonText: {color: COLOURS.muted, fontSize: 26, fontWeight: '600'},
});
