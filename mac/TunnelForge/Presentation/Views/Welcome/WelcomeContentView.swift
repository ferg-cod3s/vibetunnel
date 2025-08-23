import SwiftUI

/// Content-only version of the welcome page for use in the scrolling view.
///
/// This view displays only the textual content of the welcome page,
/// excluding the app icon which is shown in the fixed header.
struct WelcomeContentView: View {
    var body: some View {
        VStack(spacing: 30) {
            // Add the logo at the top
            SVGLogoView(height: 60, showAnimation: true)
                .frame(height: 60)
                .padding(.bottom, 10)
            
            VStack(spacing: 16) {
                Text("Welcome to TunnelForge")
                    .font(.largeTitle)
                    .fontWeight(.semibold)

                Text("Turn any browser into your terminal. Command your agents on the go.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 480)
            }

            Text(
                "You'll be quickly guided through the basics of TunnelForge.\nThis screen can always be opened from the settings."
            )
            .font(.body)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 40)

            Spacer()
        }
        .padding()
    }
}
