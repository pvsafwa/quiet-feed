package expo.modules.pip

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Log
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoPipModule : Module() {
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
        val mainActivityClass = Class.forName("app.quietfeed.MainActivity")
        val companionField = mainActivityClass.getDeclaredField("Companion")
        companionField.isAccessible = true
        val companionInstance = companionField.get(null)
        
        val setter = companionInstance.javaClass.getDeclaredMethod("setShouldEnterPipOnLeave", Boolean::class.java)
        setter.isAccessible = true
        setter.invoke(companionInstance, enabled)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to set shouldEnterPipOnLeave via reflection", e)
        false
      }
    }

    Function("isInPip") {
      try {
        val mainActivityClass = Class.forName("app.quietfeed.MainActivity")
        val companionField = mainActivityClass.getDeclaredField("Companion")
        companionField.isAccessible = true
        val companionInstance = companionField.get(null)
        
        val isInNativePipField = companionInstance.javaClass.getDeclaredField("isInNativePip")
        isInNativePipField.isAccessible = true
        val result = isInNativePipField.getBoolean(companionInstance)
        
        val activity = appContext.currentActivity
        val activityPip = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          activity?.isInPictureInPictureMode ?: false
        } else {
          false
        }
        
        result || activityPip
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to check isInNativePip via reflection", e)
        val activity = appContext.currentActivity
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          activity?.isInPictureInPictureMode ?: false
        } else {
          false
        }
      }
    }

    Function("setPlaybackState") { playing: Boolean ->
      try {
        val mainActivityClass = Class.forName("app.quietfeed.MainActivity")
        val companionField = mainActivityClass.getDeclaredField("Companion")
        companionField.isAccessible = true
        val companionInstance = companionField.get(null)
        
        val setter = companionInstance.javaClass.getDeclaredMethod("updatePlaybackState", Boolean::class.java)
        setter.isAccessible = true
        setter.invoke(companionInstance, playing)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to update playback state via reflection", e)
        false
      }
    }

    Function("syncPlaybackPosition") { positionSec: Float, durationSec: Float, playing: Boolean ->
      try {
        val mainActivityClass = Class.forName("app.quietfeed.MainActivity")
        val companionField = mainActivityClass.getDeclaredField("Companion")
        companionField.isAccessible = true
        val companionInstance = companionField.get(null)
        
        val setter = companionInstance.javaClass.getDeclaredMethod("syncPlaybackPosition", Float::class.java, Float::class.java, Boolean::class.java)
        setter.isAccessible = true
        setter.invoke(companionInstance, positionSec, durationSec, playing)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to sync playback position via reflection", e)
        false
      }
    }
  }
}
