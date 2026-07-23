package app.mytube

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class AudioForegroundService : android.app.Service() {
  override fun onBind(intent: android.content.Intent?): android.os.IBinder? = null
  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
    try {
      app.mytube.MainActivity.Companion.currentNotification?.let {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
          startForeground(1001, it, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
          startForeground(1001, it)
        }
      }
      if (intent?.getBooleanExtra("stop", false) == true) {
        stopForeground(true)
        stopSelf()
      }
    } catch (e: Exception) {
      android.util.Log.e("AudioService", "Error in AudioService", e)
    }
    return START_STICKY
  }
}

class MainActivity : ReactActivity() {
  companion object {
    var isPlaying = false
    var currentNotification: android.app.Notification? = null
    private var activityRef: java.lang.ref.WeakReference<MainActivity>? = null
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private var mediaSession: android.media.session.MediaSession? = null
    private var currentPositionSec = 0f
    private var currentDurationSec = 0f

    fun setMainActivity(activity: MainActivity) {
      activityRef = java.lang.ref.WeakReference(activity)
    }

    fun updatePlaybackState(playing: Boolean) {
      isPlaying = playing
      activityRef?.get()?.let { activity ->
        activity.updateNotificationAndWakeLock(playing)
        if (playing) {
          activity.keepWebViewsResumed()
        }
      }
    }

    fun syncPlaybackPosition(positionSec: Float, durationSec: Float, playing: Boolean) {
      currentPositionSec = positionSec
      currentDurationSec = durationSec
      activityRef?.get()?.let { activity ->
        if (isPlaying != playing) {
          updatePlaybackState(playing)
        } else if (playing) {
          activity.updateNotificationAndWakeLock(true)
        }
      }
    }
  }

  private val playbackReceiver = object : android.content.BroadcastReceiver() {
    override fun onReceive(context: android.content.Context, intent: android.content.Intent) {
      if (intent.action == "app.mytube.ACTION_PLAY_PAUSE") {
        val nextPlaying = !isPlaying
        isPlaying = nextPlaying
        updateNotificationAndWakeLock(nextPlaying)
        togglePlaybackNatively(nextPlaying)
        if (nextPlaying) {
          keepWebViewsResumed()
        }
        
        val reactApplication = application as? com.facebook.react.ReactApplication
        val reactContext = reactApplication?.reactHost?.currentReactContext ?: reactApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
        if (reactContext != null) {
          reactContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onPipPlayPause", null)
        }
      } else if (intent.action == "app.mytube.ACTION_STOP") {
        isPlaying = false
        togglePlaybackNatively(false)
        val serviceIntent = android.content.Intent(context, AudioForegroundService::class.java)
        serviceIntent.putExtra("stop", true)
        context.startService(serviceIntent)
        
        val reactApplication = application as? com.facebook.react.ReactApplication
        val reactContext = reactApplication?.reactHost?.currentReactContext ?: reactApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
        if (reactContext != null) {
          reactContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onPipPlayPause", null)
        }
      }
    }
  }

  fun keepWebViewsResumed() {
    val decorView = window?.decorView ?: return
    fun findAndResume(view: android.view.View) {
      if (view is android.webkit.WebView) {
        view.post {
          view.onResume()
          view.resumeTimers()
        }
      } else if (view is android.view.ViewGroup) {
        for (i in 0 until view.childCount) {
          findAndResume(view.getChildAt(i))
        }
      }
    }
    findAndResume(decorView)
  }

  fun togglePlaybackNatively(playing: Boolean) {
    val decorView = window?.decorView ?: return
    val webViews = ArrayList<android.webkit.WebView>()
    
    fun findWebViews(view: android.view.View) {
      if (view is android.webkit.WebView) {
        webViews.add(view)
      } else if (view is android.view.ViewGroup) {
        for (i in 0 until view.childCount) {
          findWebViews(view.getChildAt(i))
        }
      }
    }
    
    findWebViews(decorView)
    
    val eventName = if (playing) "playVideo" else "pauseVideo"
    val jsCommand = "window.dispatchEvent(new MessageEvent('message', { data: '$eventName' }));"
    
    for (wv in webViews) {
      wv.post {
        wv.evaluateJavascript(jsCommand, null)
        if (playing) {
          wv.onResume()
          wv.resumeTimers()
        }
      }
    }
  }

  fun updateNotificationAndWakeLock(playing: Boolean) {
    try {
      val pm = getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
      val am = getSystemService(android.content.Context.AUDIO_SERVICE) as? android.media.AudioManager
      
      if (playing) {
        if (wakeLock == null || wakeLock?.isHeld != true) {
          wakeLock = pm?.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "MyTube::AudioWakeLock")
          wakeLock?.acquire(30 * 60 * 1000L)
        }
      } else {
        if (wakeLock?.isHeld == true) {
          try { wakeLock?.release() } catch (e: Exception) {}
        }
      }

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
        if (mediaSession == null) {
          mediaSession = android.media.session.MediaSession(this, "MyTubeMediaSession").apply {
            setCallback(object : android.media.session.MediaSession.Callback() {
              override fun onPlay() {
                updatePlaybackState(true)
                togglePlaybackNatively(true)
              }
              override fun onPause() {
                updatePlaybackState(false)
                togglePlaybackNatively(false)
              }
            })
            setFlags(android.media.session.MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or android.media.session.MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
          }
        }

        val stateBuilder = android.media.session.PlaybackState.Builder()
          .setActions(
            android.media.session.PlaybackState.ACTION_PLAY or
            android.media.session.PlaybackState.ACTION_PAUSE or
            android.media.session.PlaybackState.ACTION_PLAY_PAUSE or
            android.media.session.PlaybackState.ACTION_SEEK_TO
          )
          .setState(
            if (playing) android.media.session.PlaybackState.STATE_PLAYING else android.media.session.PlaybackState.STATE_PAUSED,
            if (currentPositionSec > 0) (currentPositionSec * 1000).toLong() else android.media.session.PlaybackState.PLAYBACK_POSITION_UNKNOWN,
            1.0f
          )

        mediaSession?.setPlaybackState(stateBuilder.build())
        
        if (currentDurationSec > 0) {
          val metaBuilder = android.media.MediaMetadata.Builder()
            .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, (currentDurationSec * 1000).toLong())
          mediaSession?.setMetadata(metaBuilder.build())
        }

        mediaSession?.isActive = playing
      }

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        val channelId = "mytube_audio"
        val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channel = android.app.NotificationChannel(
          channelId,
          "My Tube Audio",
          android.app.NotificationManager.IMPORTANCE_LOW
        )
        notificationManager.createNotificationChannel(channel)

        val intent = android.content.Intent("app.mytube.ACTION_PLAY_PAUSE")
        intent.setPackage(packageName)
        val pendingIntent = android.app.PendingIntent.getBroadcast(
          this,
          1,
          intent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val deleteIntent = android.content.Intent("app.mytube.ACTION_STOP")
        deleteIntent.setPackage(packageName)
        val pendingDeleteIntent = android.app.PendingIntent.getBroadcast(
          this,
          3,
          deleteIntent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val mediaStyle = android.app.Notification.MediaStyle()
          .setShowActionsInCompactView(0)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP && mediaSession != null) {
          mediaStyle.setMediaSession(mediaSession?.sessionToken)
        }

        val iconRes = if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
        val actionTitle = if (playing) "Pause" else "Play"

        val notification = android.app.Notification.Builder(this, channelId)
          .setContentTitle("My Tube")
          .setContentText(if (playing) "Playing Audio" else "Paused")
          .setSmallIcon(android.R.drawable.ic_media_play)
          .setOngoing(playing)
          .setStyle(mediaStyle)
          .setVisibility(android.app.Notification.VISIBILITY_PUBLIC)
          .setDeleteIntent(pendingDeleteIntent)
          .addAction(
            android.app.Notification.Action.Builder(
              android.graphics.drawable.Icon.createWithResource(this, iconRes),
              actionTitle,
              pendingIntent
            ).build()
          )
          .build()

        currentNotification = notification
        
        val serviceIntent = android.content.Intent(this, AudioForegroundService::class.java)
        if (playing) {
          startForegroundService(serviceIntent)
        } else {
          startForegroundService(serviceIntent)
          notificationManager.notify(1001, notification)
        }
      }
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Failed to update notification or wake lock", e)
    }
  }

  override fun onPause() {
    super.onPause()
    if (isPlaying) {
      try {
        val reactApplication = application as? com.facebook.react.ReactApplication
        reactApplication?.reactHost?.onHostResume(this)
        reactApplication?.reactNativeHost?.reactInstanceManager?.onHostResume(this, this)
        keepWebViewsResumed()
      } catch (e: Exception) {
        android.util.Log.e("MainActivity", "Failed to force host resume in onPause", e)
      }
    }
  }

  override fun onStop() {
    super.onStop()
    if (isPlaying) {
      keepWebViewsResumed()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    setMainActivity(this)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(
          playbackReceiver,
          android.content.IntentFilter("app.mytube.ACTION_PLAY_PAUSE"),
          android.content.Context.RECEIVER_EXPORTED
        )
      } else {
        registerReceiver(
          playbackReceiver,
          android.content.IntentFilter("app.mytube.ACTION_PLAY_PAUSE")
        )
      }
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
