/**
 * @format
 *
 * The television app renders, and says the right thing first.
 *
 * A shallow check, deliberately. What matters about this screen is
 * verified in sessions.test.ts against the engine; what matters here is
 * that the component mounts at all under the same module wiring Metro
 * uses. A sibling project shipped an app whose only test had never once
 * parsed, because the suite was not part of the root run and nothing
 * reported it. This one is.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-video', () => {
  const React2 = require('react');
  const Video = React2.forwardRef(() => null);
  Video.displayName = 'Video';
  return {__esModule: true, default: Video};
});

test('renders, and leads with what it noticed', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  const text = JSON.stringify(tree!.toJSON());

  expect(text).toContain('Earshot');
  // The offer, not a bare instruction to take a test.
  expect(text).toContain('Something worth a minute');
  expect(text).toContain('90 seconds');
  // And the sample-data warning, for the same reason the site has one.
  expect(text).toContain('sample data');
});

test('says there is no microphone, on the screen rather than only in a document', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  expect(JSON.stringify(tree!.toJSON())).toContain('no microphone');
});

test('offers to watch something, which is the loop it can actually run', async () => {
  /*
    The app cannot see what other applications play, so the home screen
    is honest that its history is sample data. It can measure its own
    playback, and this is the way in to that: real content, with a
    dialogue loudness the pipeline measured, recorded by the same code
    the model consumes.
  */
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  const text = JSON.stringify(tree!.toJSON());
  expect(text).toContain('Watch something');
});
