package app

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  private var audioManager: AudioManager? = null
  private var deviceCallback: AudioDeviceCallback? = null

  override fun definition() = ModuleDefinition {
    Name("AudioRouteModule")
    Events("onAudioRouteChanged")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@OnCreate
      audioManager = manager
      val callback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) = emitCurrentRoute()
        override fun onAudioDevicesRemoved(removedDevices: Array<AudioDeviceInfo>) = emitCurrentRoute()
      }
      deviceCallback = callback
      manager.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
    }

    OnDestroy {
      val callback = deviceCallback
      if (callback != null) audioManager?.unregisterAudioDeviceCallback(callback)
      deviceCallback = null
      audioManager = null
    }

    AsyncFunction("getCurrentRoute") {
      currentRoute()
    }
  }

  private fun emitCurrentRoute() {
    sendEvent("onAudioRouteChanged", currentRoute())
  }

  private fun currentRoute(): Map<String, String> {
    val outputs = audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)?.toList().orEmpty()
    val bluetooth = outputs.firstOrNull { it.type in BLUETOOTH_TYPES }
    if (bluetooth != null) return route("bluetooth", deviceName(bluetooth, "Bluetooth audio"))

    val wired = outputs.firstOrNull { it.type in WIRED_TYPES }
    if (wired != null) return route("wired", "Wired Headphones")

    val external = outputs.firstOrNull { it.type in EXTERNAL_TYPES }
    if (external != null) return route("external", deviceName(external, "External audio"))

    val speaker = outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
    return if (speaker != null) route("speaker", "Phone speaker") else route("phone", "This phone")
  }

  private fun deviceName(device: AudioDeviceInfo, fallback: String): String {
    val name = device.productName?.toString()?.trim().orEmpty()
    return name.ifBlank { fallback }
  }

  private fun route(kind: String, name: String) = mapOf("kind" to kind, "name" to name)

  private companion object {
    val BLUETOOTH_TYPES = setOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLE_SPEAKER,
    )
    val WIRED_TYPES = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET,
    )
    val EXTERNAL_TYPES = setOf(
      AudioDeviceInfo.TYPE_USB_ACCESSORY,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_HDMI,
      AudioDeviceInfo.TYPE_HDMI_ARC,
      AudioDeviceInfo.TYPE_HDMI_EARC,
      AudioDeviceInfo.TYPE_LINE_ANALOG,
      AudioDeviceInfo.TYPE_LINE_DIGITAL,
      AudioDeviceInfo.TYPE_DOCK,
    )
  }
}
