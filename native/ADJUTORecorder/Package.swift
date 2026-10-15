// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "RecorderCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "RecorderCore", targets: ["RecorderCore"])], targets: [.target(name: "RecorderCore"), .testTarget(name: "RecorderCoreTests", dependencies: ["RecorderCore"])])
