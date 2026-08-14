const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withMainActivity, withDangerousMod } = require('@expo/config-plugins');

function withFileProviderXml(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-cache-path name="external_cache" path="." />
    <cache-path name="internal_cache" path="." />
    <files-path name="files" path="." />
    <external-files-path name="external_files" path="." />
</paths>`;
      fs.writeFileSync(path.join(xmlDir, 'file_paths.xml'), xmlContent, 'utf8');
      return config;
    }
  ]);
}

function withAndroidPipManifest(config) {
  return withAndroidManifest(config, async (config) => {
    // 1. Add required permissions for foreground service and app update installer
    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }
    const permissions = config.modResults.manifest['uses-permission'];
    const requiredPerms = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.WAKE_LOCK',
      'android.permission.REQUEST_INSTALL_PACKAGES',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE'
    ];
    requiredPerms.forEach((perm) => {
      if (!permissions.some((p) => p && p.$ && p.$['android:name'] === perm)) {
        permissions.push({ $: { 'android:name': perm } });
      }
    });

    // 2. Add AudioForegroundService
    const application = config.modResults.manifest.application[0];
    if (!application.service) {
      application.service = [];
    }
    const hasService = application.service.some(s => s.$['android:name'] === '.AudioForegroundService');
    if (!hasService) {
      application.service.push({
        $: {
          'android:name': '.AudioForegroundService',
          'android:foregroundServiceType': 'mediaPlayback',
          'android:exported': 'false'
        }
      });
    }

    // 3. Add FileProvider for in-app APK installer
    if (!application.provider) {
      application.provider = [];
    }
    const hasFileProvider = application.provider.some(p => p.$['android:name'] === 'androidx.core.content.FileProvider');
    if (!hasFileProvider) {
      application.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': 'app.quietfeed.fileprovider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true'
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/file_paths'
            }
          }
        ]
      });
    }

    return config;
  });
}

function withAndroidPipMainActivity(config) {
  return withMainActivity(config, async (config) => {
    let src = config.modResults.contents;

    if (!src.includes("class AudioForegroundService")) {
      const audioServiceDeclaration = `class AudioForegroundService : android.app.Service() {
  override fun onBind(intent: android.content.Intent?): android.os.IBinder? = null
  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
    try {
      if (intent?.getBooleanExtra("stop", false) == true) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
          stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
          stopForeground(true)
        }
        stopSelf()
        return START_NOT_STICKY
      }

      app.quietfeed.MainActivity.Companion.currentNotification?.let {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
          startForeground(1001, it, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
          startForeground(1001, it)
        }
      }
    } catch (e: Exception) {
      android.util.Log.e("AudioService", "Error in AudioService onStartCommand", e)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        stopForeground(true)
      }
    } catch (e: Exception) {}
  }
}

`;

      src = src.replace('class MainActivity : ReactActivity() {', audioServiceDeclaration + 'class MainActivity : ReactActivity() {');

      const methodsInjection = `
  companion object {
    var isPlaying = false
    var currentTitle: String = "Quiet Feed"
    var currentChannel: String = ""
    var currentNotification: android.app.Notification? = null
    private var activityRef: java.lang.ref.WeakReference<MainActivity>? = null
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private var mediaSession: android.media.session.MediaSession? = null
    private var currentPositionSec = 0f
    private var currentDurationSec = 0f

    fun setMainActivity(activity: MainActivity) {
      activityRef = java.lang.ref.WeakReference(activity)
    }

    fun updateVideoMetadata(title: String, channel: String, durationSec: Float) {
      currentTitle = if (title.isNotBlank()) title else "Quiet Feed"
      currentChannel = channel
      currentDurationSec = durationSec
      activityRef?.get()?.let { activity ->
        activity.updateNotificationAndWakeLock(isPlaying)
      }
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
      if (durationSec > 0) {
        currentDurationSec = durationSec
      }
      activityRef?.get()?.let { activity ->
        if (isPlaying != playing) {
          updatePlaybackState(playing)
        } else {
          activity.updateMediaSessionStateOnly(playing, positionSec, currentDurationSec)
        }
      }
    }

    fun stopPlayback() {
      isPlaying = false
      currentPositionSec = 0f
      currentDurationSec = 0f
      activityRef?.get()?.let { activity ->
        activity.cleanStopPlayback()
      }
    }
  }

  private val playbackReceiver = object : android.content.BroadcastReceiver() {
    override fun onReceive(context: android.content.Context, intent: android.content.Intent) {
      if (intent.action == "app.quietfeed.ACTION_PLAY_PAUSE") {
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
      } else if (intent.action == "app.quietfeed.ACTION_STOP") {
        cleanStopPlayback()
        togglePlaybackNatively(false)
        
        val reactApplication = application as? com.facebook.react.ReactApplication
        val reactContext = reactApplication?.reactHost?.currentReactContext ?: reactApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
        if (reactContext != null) {
          reactContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onPipStop", null)
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

  fun cleanStopPlayback() {
    try {
      isPlaying = false
      if (wakeLock?.isHeld == true) {
        try { wakeLock?.release() } catch (e: Exception) {}
      }

      val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
      notificationManager?.cancel(1001)

      val serviceIntent = android.content.Intent(this, AudioForegroundService::class.java)
      serviceIntent.putExtra("stop", true)
      startService(serviceIntent)

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
        mediaSession?.let { ms ->
          val stateBuilder = android.media.session.PlaybackState.Builder()
            .setState(android.media.session.PlaybackState.STATE_STOPPED, 0L, 0.0f)
          ms.setPlaybackState(stateBuilder.build())
          ms.isActive = false
        }
      }
    } catch (e: Exception) {
      android.util.Log.e("MainActivity", "Error during cleanStopPlayback", e)
    }
  }

  fun updateMediaSessionStateOnly(playing: Boolean, positionSec: Float, durationSec: Float) {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
      try {
        mediaSession?.let { ms ->
          val stateBuilder = android.media.session.PlaybackState.Builder()
            .setActions(
              android.media.session.PlaybackState.ACTION_PLAY or
              android.media.session.PlaybackState.ACTION_PAUSE or
              android.media.session.PlaybackState.ACTION_PLAY_PAUSE or
              android.media.session.PlaybackState.ACTION_STOP or
              android.media.session.PlaybackState.ACTION_SEEK_TO
            )
            .setState(
              if (playing) android.media.session.PlaybackState.STATE_PLAYING else android.media.session.PlaybackState.STATE_PAUSED,
              if (positionSec > 0) (positionSec * 1000).toLong() else android.media.session.PlaybackState.PLAYBACK_POSITION_UNKNOWN,
              if (playing) 1.0f else 0.0f
            )
          ms.setPlaybackState(stateBuilder.build())
        }
      } catch (e: Exception) {}
    }
  }

  fun updateNotificationAndWakeLock(playing: Boolean) {
    try {
      val pm = getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
      
      if (playing) {
        if (wakeLock == null) {
          wakeLock = pm?.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "QuietFeed::AudioWakeLock")?.apply {
            setReferenceCounted(false)
          }
        }
        if (wakeLock?.isHeld != true) {
          wakeLock?.acquire(45 * 60 * 1000L)
        }
      } else {
        if (wakeLock?.isHeld == true) {
          try { wakeLock?.release() } catch (e: Exception) {}
        }
      }

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
        if (mediaSession == null) {
          mediaSession = android.media.session.MediaSession(this, "QuietFeedMediaSession").apply {
            setCallback(object : android.media.session.MediaSession.Callback() {
              override fun onPlay() {
                updatePlaybackState(true)
                togglePlaybackNatively(true)
              }
              override fun onPause() {
                updatePlaybackState(false)
                togglePlaybackNatively(false)
              }
              override fun onStop() {
                cleanStopPlayback()
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
            android.media.session.PlaybackState.ACTION_STOP or
            android.media.session.PlaybackState.ACTION_SEEK_TO
          )
          .setState(
            if (playing) android.media.session.PlaybackState.STATE_PLAYING else android.media.session.PlaybackState.STATE_PAUSED,
            if (currentPositionSec > 0) (currentPositionSec * 1000).toLong() else android.media.session.PlaybackState.PLAYBACK_POSITION_UNKNOWN,
            if (playing) 1.0f else 0.0f
          )

        mediaSession?.setPlaybackState(stateBuilder.build())
        
        val metaBuilder = android.media.MediaMetadata.Builder()
          .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, currentTitle)
          .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, currentChannel)
          .putString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST, currentChannel)
        
        if (currentDurationSec > 0) {
          metaBuilder.putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, (currentDurationSec * 1000).toLong())
        }
        mediaSession?.setMetadata(metaBuilder.build())
        mediaSession?.isActive = true
      }

      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        val channelId = "quiet_feed_audio"
        val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channel = android.app.NotificationChannel(
          channelId,
          "Quiet Feed Audio Playback",
          android.app.NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Controls background video audio playback"
          setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)

        val intent = android.content.Intent("app.quietfeed.ACTION_PLAY_PAUSE").apply {
          setPackage(packageName)
        }
        val pendingIntent = android.app.PendingIntent.getBroadcast(
          this,
          1,
          intent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = android.content.Intent("app.quietfeed.ACTION_STOP").apply {
          setPackage(packageName)
        }
        val pendingStopIntent = android.app.PendingIntent.getBroadcast(
          this,
          2,
          stopIntent,
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
          .setContentTitle(currentTitle)
          .setContentText(if (currentChannel.isNotBlank()) currentChannel else if (playing) "Playing Audio" else "Paused")
          .setSmallIcon(android.R.drawable.ic_media_play)
          .setOngoing(playing)
          .setAutoCancel(!playing)
          .setStyle(mediaStyle)
          .setVisibility(android.app.Notification.VISIBILITY_PUBLIC)
          .setDeleteIntent(pendingStopIntent)
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
      keepWebViewsResumed()
    }
  }

  override fun onStop() {
    super.onStop()
    if (isPlaying) {
      keepWebViewsResumed()
    }
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(playbackReceiver)
    } catch (e: Exception) {}
    cleanStopPlayback()
    try {
      mediaSession?.release()
      mediaSession = null
    } catch (e: Exception) {}
    super.onDestroy()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    setMainActivity(this)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      val filter = android.content.IntentFilter().apply {
        addAction("app.quietfeed.ACTION_PLAY_PAUSE")
        addAction("app.quietfeed.ACTION_STOP")
      }
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(playbackReceiver, filter, android.content.Context.RECEIVER_EXPORTED)
      } else {
        registerReceiver(playbackReceiver, filter)
      }
    }
  }
`;

      const onCreateAnchor = `  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }`;

      src = src.replace(onCreateAnchor, methodsInjection.trim());
      config.modResults.contents = src;
    }
    return config;
  });
}

module.exports = function withAndroidPip(config) {
  return withFileProviderXml(withAndroidPipMainActivity(withAndroidPipManifest(config)));
};
