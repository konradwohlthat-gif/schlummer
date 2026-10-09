import Cocoa
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let bundle = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
let config = WKWebViewConfiguration()
let world = WKContentWorld.defaultClient
let mode = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "none"
let gmStub: String = mode == "hang" ? "globalThis.GM = { getValue: () => new Promise(() => {}), setValue: () => new Promise(() => {}) };"
  : mode == "reject" ? "globalThis.GM = { getValue: () => Promise.reject(new Error('nope')), setValue: () => Promise.reject(new Error('nope')) };"
  : mode == "ok" ? "globalThis.__gmStore = {}; globalThis.GM = { getValue: (k, d) => Promise.resolve(globalThis.__gmStore[k] ?? d), setValue: (k, v) => { globalThis.__gmStore[k] = v; return Promise.resolve(); } };"
  : ""
if !gmStub.isEmpty { config.userContentController.addUserScript(WKUserScript(source: gmStub, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world)) }
config.userContentController.addUserScript(WKUserScript(source: bundle, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: world))
let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 600), configuration: config)
let window = NSWindow(contentRect: CGRect(x: 100, y: 100, width: 900, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
window.contentView = webView
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(webView)
webView.loadHTMLString("<html><body style='background:#000'><div class='watch-video'><video></video></div></body></html>", baseURL: URL(string: "https://www.netflix.com/watch/80098733"))

func js(_ src: String, _ done: @escaping (Any?) -> Void) {
  webView.evaluateJavaScript(src) { res, err in done(err == nil ? res : "ERR \(err!)") }
}
func pressZ() {
  let t = ProcessInfo.processInfo.systemUptime
  let down = NSEvent.keyEvent(with: .keyDown, location: NSPoint(x: 10, y: 10), modifierFlags: [], timestamp: t, windowNumber: window.windowNumber, context: nil, characters: "z", charactersIgnoringModifiers: "z", isARepeat: false, keyCode: 6)!
  let up = NSEvent.keyEvent(with: .keyUp, location: NSPoint(x: 10, y: 10), modifierFlags: [], timestamp: t + 0.05, windowNumber: window.windowNumber, context: nil, characters: "z", charactersIgnoringModifiers: "z", isARepeat: false, keyCode: 6)!
  window.sendEvent(down); window.sendEvent(up)
}
let q = "JSON.stringify({panel: !!document.querySelector('.schlummer-panel'), visible: !!(document.querySelector('.schlummer-panel')&&document.querySelector('.schlummer-panel').classList.contains('is-visible')), toast: (document.querySelector('.schlummer-toast')||{}).textContent||null, layers: document.querySelectorAll('.schlummer-layer').length, path: location.pathname, host: location.hostname})"
DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
  js(q) { r in print("T+3s:", r ?? "nil")
    pressZ()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      js(q) { r in print("nach Z:", r ?? "nil")
        pressZ()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
          js(q) { r in print("nach Z erneut:", r ?? "nil"); exit(0) }
        }
      }
    }
  }
}
RunLoop.main.run(until: Date().addingTimeInterval(10))
print("timeout"); exit(1)
