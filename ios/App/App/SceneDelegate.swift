import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        window.rootViewController = storyboard.instantiateInitialViewController()
        self.window = window
        window.makeKeyAndVisible()

        connectionOptions.urlContexts.forEach(forwardURLContext)
        connectionOptions.userActivities.forEach(forwardUserActivity)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach(forwardURLContext)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        forwardUserActivity(userActivity)
    }

    private func forwardURLContext(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        let sceneOptions = context.options
        if let sourceApplication = sceneOptions.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = sceneOptions.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = sceneOptions.openInPlace
        if let eventAttribution = sceneOptions.eventAttribution {
            options[.eventAttribution] = eventAttribution
        }

        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: context.url,
            options: options
        )
    }

    private func forwardUserActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
