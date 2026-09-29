package com.earshottv

import android.content.Context
import android.media.AudioManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The volume the set itself is at, read from AudioManager.
 *
 * React Native exposes no way to read it, so without this the player had
 * to own its own level and say so on screen. With it, the level a viewer
 * settles on is the player's gain times the set's own volume, on any
 * device where the set's volume is the one the remote drives: a Fire TV
 * Edition television, or a Cube driving a television it can hear. On a
 * stick the remote's volume keys go to the television over HDMI and the
 * stick is not told the result, so there the set's volume stays at its
 * maximum and the player's gain is the whole measurement, as before.
 *
 * A promise rather than a synchronous call, because the reading is cheap
 * but the bridge is not the place to block on it.
 */
class SystemVolumeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SystemVolume"

  @ReactMethod
  fun get(promise: Promise) {
    val audio = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val map = Arguments.createMap()
    map.putInt("index", audio.getStreamVolume(AudioManager.STREAM_MUSIC))
    map.putInt("max", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
    promise.resolve(map)
  }
}
