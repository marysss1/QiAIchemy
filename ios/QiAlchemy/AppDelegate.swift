import UIKit
import Darwin
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if DEBUG
    if let metroHost = detectMetroHost() {
      RCTBundleURLProvider.sharedSettings().jsLocation = metroHost
      print("[metro] using host \(metroHost)")
    }
#endif

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "QiAlchemy",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: "index",
      fallbackExtension: "jsbundle"
    )
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

#if DEBUG
private func detectMetroHost() -> String? {
  var addresses: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&addresses) == 0, let firstAddress = addresses else {
    return nil
  }
  defer {
    freeifaddrs(addresses)
  }

  var fallbackHost: String?
  var cursor: UnsafeMutablePointer<ifaddrs>? = firstAddress

  while let current = cursor {
    defer {
      cursor = current.pointee.ifa_next
    }

    let interface = current.pointee
    guard let address = interface.ifa_addr, address.pointee.sa_family == UInt8(AF_INET) else {
      continue
    }

    let flags = Int32(interface.ifa_flags)
    guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 else {
      continue
    }

    let interfaceName = String(cString: interface.ifa_name)
    var hostBuffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
    let result = getnameinfo(
      address,
      socklen_t(address.pointee.sa_len),
      &hostBuffer,
      socklen_t(hostBuffer.count),
      nil,
      0,
      NI_NUMERICHOST
    )
    guard result == 0 else {
      continue
    }

    let host = String(cString: hostBuffer)
    if interfaceName == "en0" {
      return host
    }
    if fallbackHost == nil {
      fallbackHost = host
    }
  }

  return fallbackHost
}
#endif
