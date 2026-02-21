import UIKit
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
  private let debugBundleURL = URL(
    string: "http://127.0.0.1:8081/index.bundle?platform=ios&dev=true&minify=false&app=QiAlchemy&modulesOnly=false&runModule=true"
  )

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return debugBundleURL
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
