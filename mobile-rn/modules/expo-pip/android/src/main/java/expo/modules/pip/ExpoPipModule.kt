package expo.modules.pip

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import android.util.Log
import android.util.Rational
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.lang.reflect.Method
import java.net.HttpURLConnection
import java.net.URL

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

    Events("onDownloadProgress")

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

    Function("setOrientationLandscape") {
      try {
        val activity = appContext.currentActivity ?: return@Function false
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to set landscape orientation", e)
        false
      }
    }

    Function("setOrientationPortrait") {
      try {
        val activity = appContext.currentActivity ?: return@Function false
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to set portrait orientation", e)
        false
      }
    }

    Function("unlockOrientation") {
      try {
        val activity = appContext.currentActivity ?: return@Function false
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to unlock orientation", e)
        false
      }
    }

    Function("installApk") { filePath: String ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity ?: return@Function false
        val file = File(filePath)
        if (!file.exists()) {
          Log.e("ExpoPipModule", "APK file not found: $filePath")
          return@Function false
        }
        val authority = "${context.packageName}.fileprovider"
        val apkUri = FileProvider.getUriForFile(context, authority, file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(apkUri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        Log.e("ExpoPipModule", "Failed to launch APK package installer", e)
        false
      }
    }

    AsyncFunction("downloadApk") { urlString: String, fileName: String, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        try {
          val context = appContext.reactContext ?: appContext.currentActivity ?: throw Exception("Context unavailable")
          val cacheDir = context.cacheDir
          val destinationFile = File(cacheDir, fileName)
          if (destinationFile.exists()) {
            destinationFile.delete()
          }

          var currentUrl = URL(urlString)
          var connection = currentUrl.openConnection() as HttpURLConnection
          connection.instanceFollowRedirects = true
          connection.connectTimeout = 20000
          connection.readTimeout = 45000
          connection.connect()

          var status = connection.responseCode
          var redirectCount = 0
          while ((status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == 307 || status == 308 || status == 302) && redirectCount < 10) {
            val newLocation = connection.getHeaderField("Location") ?: break
            currentUrl = URL(newLocation)
            connection.disconnect()
            connection = currentUrl.openConnection() as HttpURLConnection
            connection.connectTimeout = 20000
            connection.readTimeout = 45000
            connection.connect()
            status = connection.responseCode
            redirectCount++
          }

          if (status !in 200..299) {
            throw Exception("Download failed with HTTP status $status")
          }

          val totalLength = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            connection.contentLengthLong
          } else {
            connection.getHeaderField("Content-Length")?.toLongOrNull() ?: connection.contentLength.toLong()
          }

          val inputStream = BufferedInputStream(connection.inputStream)
          val outputStream = FileOutputStream(destinationFile)

          val buffer = ByteArray(32768)
          var totalBytesRead = 0L
          var bytesRead: Int
          var lastEmitTime = 0L

          try {
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
              outputStream.write(buffer, 0, bytesRead)
              totalBytesRead += bytesRead

              val now = System.currentTimeMillis()
              if (now - lastEmitTime > 150 || (totalLength > 0 && totalBytesRead == totalLength)) {
                lastEmitTime = now
                val progressPct = if (totalLength > 0) ((totalBytesRead * 100) / totalLength).toInt() else 0

                try {
                  sendEvent("onDownloadProgress", mapOf(
                    "progress" to progressPct,
                    "bytesDownloaded" to totalBytesRead.toDouble(),
                    "totalBytes" to totalLength.toDouble()
                  ))
                } catch (e: Exception) {
                  Log.e("ExpoPipModule", "Failed to send onDownloadProgress event", e)
                }
              }
            }
            outputStream.flush()
          } finally {
            try { outputStream.close() } catch (e: Exception) {}
            try { inputStream.close() } catch (e: Exception) {}
            try { connection.disconnect() } catch (e: Exception) {}
          }

          promise.resolve(destinationFile.absolutePath)
        } catch (e: Exception) {
          Log.e("ExpoPipModule", "Download failed", e)
          promise.reject("ERR_DOWNLOAD_FAILED", e.message ?: "Download failed", e)
        }
      }
    }
  }
}
