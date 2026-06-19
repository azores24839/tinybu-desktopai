// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "TinyBuNotchPrototype",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "TinyBuNotchPrototype", targets: ["TinyBuNotchPrototype"])
  ],
  targets: [
    .executableTarget(
      name: "TinyBuNotchPrototype",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("Carbon")
      ]
    )
  ]
)
