import AVFAudio
internal import ExpoModulesCore

class AudioRouteModule: Module {
  private var routeObserver: NSObjectProtocol?

  func definition() -> ModuleDefinition {
    Name("AudioRouteModule")
    Events("onAudioRouteChanged")

    OnCreate {
      let center = NotificationCenter.default
      routeObserver = center.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onAudioRouteChanged", self?.currentRoute() ?? Self.phoneRoute())
      }
    }

    OnDestroy {
      if let observer = routeObserver {
        NotificationCenter.default.removeObserver(observer)
      }
      routeObserver = nil
    }

    AsyncFunction("getCurrentRoute") {
      currentRoute()
    }
  }

  private func currentRoute() -> [String: String] {
    guard let output = AVAudioSession.sharedInstance().currentRoute.outputs.first else {
      return Self.phoneRoute()
    }

    switch output.portType {
    case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
      return ["kind": "bluetooth", "name": output.portName.isEmpty ? "Bluetooth audio" : output.portName]
    case .headphones, .usbAudio:
      return ["kind": "wired", "name": "Wired Headphones"]
    case .builtInSpeaker:
      return ["kind": "speaker", "name": "Phone speaker"]
    case .builtInReceiver:
      return Self.phoneRoute()
    default:
      return ["kind": "external", "name": output.portName.isEmpty ? "External audio" : output.portName]
    }
  }

  private static func phoneRoute() -> [String: String] {
    ["kind": "phone", "name": "This phone"]
  }
}
