import Cocoa
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let bundle = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
let mode = CommandLine.arguments[2]
let b64 = try! String(contentsOfFile: CommandLine.arguments[3], encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
let config = WKWebViewConfiguration()
config.mediaTypesRequiringUserActionForPlayback = []
let world = WKContentWorld.defaultClient
config.userContentController.addUserScript(WKUserScript(source: bundle, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: world))
let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 600), configuration: config)
let window = NSWindow(contentRect: CGRect(x: 100, y: 100, width: 900, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
window.contentView = webView
window.makeKeyAndOrderFront(nil)
let videoTag = mode == "disney" ? "<video id='hivePlayer1' class='hive-video' autoplay src='data:audio/mp4;base64,\(b64)'></video>" : "<video autoplay src='data:audio/mp4;base64,\(b64)'></video>"
let base = mode == "disney" ? "https://www.disneyplus.com/de-de/play/0049132c-c61b-41ac-ad49-c310c738a58b" : "https://www.netflix.com/watch/80098733"
let html = "<html><body style='background:#000'>\(videoTag)<script>window.__ia={cont:0,close:0};</script></body></html>"
webView.loadHTMLString(html, baseURL: URL(string: base))

let mkDialog = mode == "disney"
  ? "(function(){ document.querySelectorAll('inactivity-overlay').forEach(e=>e.remove()); const el=document.createElement('inactivity-overlay'); const sr=el.attachShadow({mode:'open'}); sr.innerHTML='<div><button class=close aria-label=Schließen>Schließen</button><button class=cont>Weiter schauen</button></div>'; sr.querySelector('.cont').addEventListener('click',()=>{window.__ia.cont++; el.remove();}); sr.querySelector('.close').addEventListener('click',()=>{window.__ia.close++;}); document.body.appendChild(el); })();"
  : "(function(){ document.querySelectorAll('[data-uia=interrupt-autoplay-continue]').forEach(e=>e.remove()); const b=document.createElement('button'); b.setAttribute('data-uia','interrupt-autoplay-continue'); b.textContent='Weiter'; b.addEventListener('click',()=>{window.__ia.cont++; b.remove();}); document.body.appendChild(b); })();"
let state = "JSON.stringify({ia: window.__ia, status: (document.querySelector('.schlummer-status')||{}).textContent||null, dur: Math.round(document.querySelector('video').duration), ct: Math.round(document.querySelector('video').currentTime)})"

func js(_ src: String, _ done: @escaping (Any?) -> Void) { webView.evaluateJavaScript(src) { res, err in done(err == nil ? res : "ERR \(err!)") } }
func after(_ s: Double, _ f: @escaping () -> Void) { DispatchQueue.main.asyncAfter(deadline: .now() + s, execute: f) }

after(3.0) {
  js(mkDialog) { _ in
    after(1.5) {
      js(state) { r in print("ohne Sitzung:", r ?? "nil")
        js("document.querySelector('#schlummer-sleep').click()") { _ in
          after(2.5) {
            js(mkDialog) { _ in
              after(1.5) {
                js(state) { r in print("mit Sitzung:", r ?? "nil"); exit(0) }
              }
            }
          }
        }
      }
    }
  }
}
RunLoop.main.run(until: Date().addingTimeInterval(14))
print("timeout"); exit(1)
