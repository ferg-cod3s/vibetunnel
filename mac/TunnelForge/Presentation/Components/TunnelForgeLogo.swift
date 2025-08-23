import SwiftUI
import WebKit

/// A SwiftUI view that displays the TunnelForge logo using the SVG asset
struct TunnelForgeLogo: View {
    let height: CGFloat
    let showAnimation: Bool
    
    init(height: CGFloat = 100, showAnimation: Bool = true) {
        self.height = height
        self.showAnimation = showAnimation
    }
    
    var body: some View {
        // For SVG display, we'll use the SVG as an image
        // The width is calculated based on the SVG's aspect ratio (800:200 = 4:1)
        Image("TunnelForgeLogo")
            .resizable()
            .aspectRatio(4, contentMode: .fit)
            .frame(height: height)
    }
}

/// NSView wrapper for displaying SVG with animations
struct SVGLogoView: NSViewRepresentable {
    let height: CGFloat
    let showAnimation: Bool
    
    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        
        if let svgPath = Bundle.main.path(forResource: "TunnelForgeLogo", ofType: "svg"),
           let svgContent = try? String(contentsOfFile: svgPath) {
            
            let html = """
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: transparent;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                    }
                    svg {
                        max-width: 100%;
                        height: auto;
                    }
                </style>
            </head>
            <body>
                \(svgContent)
            </body>
            </html>
            """
            
            webView.loadHTMLString(html, baseURL: nil)
        }
        
        return webView
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // No updates needed
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        // Implement navigation delegate if needed
    }
}

#Preview {
    VStack(spacing: 20) {
        TunnelForgeLogo(height: 50)
        TunnelForgeLogo(height: 100)
        TunnelForgeLogo(height: 150)
    }
    .padding()
    .frame(width: 800, height: 600)
}
