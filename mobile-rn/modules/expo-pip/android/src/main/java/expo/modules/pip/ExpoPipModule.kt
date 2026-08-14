package expo.modules.pip

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Log
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.reflect.Method

class ExpoPipModule : Module() {
  private var companionInstance: Any? = null
  private var updatePlaybackStateMethod: Method? = null
  private var syncPlaybackPositionMethod: Method? = null
  private var updateVideoMetadataMethod: Method? = null
  private var stopPlaybackMethod: Method? = null

  private fun getCompanion(): Any? {
    if (companionInstance != null) return companionInstance
    return try {
      val mainActivityClass = Class.forName("app.quietfeed.MainActivity")
      val companionField = mainActivityClass.getDeclaredField("Companion")
      companionField.isAccessible = true
      val instance = companionField.get(null)
      companionInstance = instance

      updatePlaybackStateMethod = instance.javaClass.getDeclaredMethod("updatePlaybackState", Boolean::class.java).apply { isAccessible = true }
      syncPlaybackPositionMethod = instance.javaClass.getDeclaredMethod("syncPlaybackPosition", Float::class.java, Float::class.java, Boolean::class.java).apply { isAccessible = true }
      updateVideoMetadataMethod = instance.javaClass.getDeclaredMethod("updateVideoMetadata", String::class.java, String::class.java, Float::class.java).apply { isAccessible = true }
      stopPlaybackMethod = instance.javaClass.getDeclaredMethod("stopPlayback").apply { isAccessible = true }

      instance
    } catch (e: Exception) {
      Log.e("ExpoPipModule", "Failed to cache MainActivity companion methods", e)
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoPip")

    Function("enterPip") { aspectRatioWidth: Int?, aspectRatioHeight: Int? ->
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val builder = PictureInPictureParams.Builder()
        if (aspectRatioWidth != null && aspectRatioHeight != null && aspectRatioWidth > 0 && aspectRatioHeight > 0) {
          builder.setAspectRatio(Rational(aspectRatioWidth, aspectRatioHeight))
        }
        activity.enterPictureInPictureMode(builder.build())
        true
      } else {
        false
      }
    }

    Function("isPipSupported") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val activity = appContext.currentActivity
        activity?.packageManager?.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE) ?: false
      } else {
        false
      }
    }

    Function("setShouldEnterPipOnLeave") { enabled: Boolean ->
      try {
        val companion = getCompanion() ?: return@Function false
        val setter = companion.javaClass.getDeclaredMethod("setShouldEnterPipOnLeave", Boolean::class.java)
        setter.isAccessible = true
        setter.invoke(companion, enabled)
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("isInPip") {
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        activity?.isInPictureInPictureMode ?: false
      } else {
        false
      }
    }

    Function("updateVideoMetadata") { title: String, channelTitle: String, durationSec: Float ->
      try {
        val companion = getCompanion() ?: return@Function false
        updateVideoMetadataMethod?.invoke(companion, title, channelTitle, durationSec)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to update video metadata", e)
        false
      }
    }

    Function("setPlaybackState") { playing: Boolean ->
      try {
        val companion = getCompanion() ?: return@Function false
        updatePlaybackStateMethod?.invoke(companion, playing)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to update playback state", e)
        false
      }
    }

    Function("syncPlaybackPosition") { positionSec: Float, durationSec: Float, playing: Boolean ->
      try {
        val companion = getCompanion() ?: return@Function false
        syncPlaybackPositionMethod?.invoke(companion, positionSec, durationSec, playing)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to sync playback position", e)
        false
      }
    }

    Function("stopPlayback") {
      try {
        val companion = getCompanion() ?: return@Function false
        stopPlaybackMethod?.invoke(companion)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to stop playback", e)
        false
      }
    }
  }
}
