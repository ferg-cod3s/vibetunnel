// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "TunnelForgeDependencies",
    platforms: [
        .iOS(.v18),
        .macOS(.v10_15)
    ],
    products: [
        .library(
            name: "TunnelForgeDependencies",
            targets: ["TunnelForgeDependencies"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", branch: "master"),
        .package(url: "https://github.com/mhdhejazi/Dynamic.git", from: "1.2.0")
    ],
    targets: [
        .target(
            name: "TunnelForgeDependencies",
            dependencies: [
                .product(name: "SwiftTerm", package: "SwiftTerm"),
                .product(name: "Dynamic", package: "Dynamic")
            ]
        )
    ]
)
