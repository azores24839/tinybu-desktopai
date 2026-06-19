import AppKit
import Carbon.HIToolbox

private let panelSize = NSSize(width: 680, height: 176)
private let collapsedIslandSize = NSSize(width: 357, height: 36)
private let expandedIslandSize = NSSize(width: 620, height: 154)
private let notchReservedWidth: CGFloat = 190.0
private let hotKeySignature = fourCharCode("TBU1")

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: NotchPanelController?
  private var hotKey: HotKeyCenter?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)

    let controller = NotchPanelController()
    self.controller = controller
    controller.show()

    hotKey = HotKeyCenter {
      controller.toggleExpanded()
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }
}

final class NotchPanelController: NSObject {
  private let panel: NotchPanel
  private let notchView: NotchView
  private var expanded = false

  override init() {
    notchView = NotchView(frame: NSRect(origin: .zero, size: panelSize))
    panel = NotchPanel(
      contentRect: NSRect(origin: .zero, size: panelSize),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    super.init()

    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    panel.hidesOnDeactivate = false
    panel.isMovable = false
    panel.contentView = notchView

    notchView.onToggle = { [weak self] in self?.toggleExpanded() }
    notchView.onCollapse = { [weak self] in self?.setExpanded(false) }
  }

  func show() {
    positionPanel(animated: false)
    panel.orderFrontRegardless()
  }

  func toggleExpanded() {
    setExpanded(!expanded)
  }

  private func setExpanded(_ nextExpanded: Bool) {
    guard nextExpanded != expanded else { return }
    expanded = nextExpanded
    notchView.setExpanded(nextExpanded)
    positionPanel(animated: false)
  }

  private func positionPanel(animated: Bool) {
    guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
    let frame = screen.frame
    let x = frame.midX - panelSize.width / 2
    let y = frame.maxY - panelSize.height
    let nextFrame = NSRect(x: x, y: y, width: panelSize.width, height: panelSize.height)

    if animated {
      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.22
        context.timingFunction = CAMediaTimingFunction(name: .easeOut)
        panel.animator().setFrame(nextFrame, display: true)
      }
    } else {
      panel.setFrame(nextFrame, display: true)
    }
  }
}

final class NotchPanel: NSPanel {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }
}

final class NotchView: NSView {
  var onToggle: (() -> Void)?
  var onCollapse: (() -> Void)?

  private let island = BlackIslandView(frame: .zero)
  private let topRow = NSView()
  private let leftCluster = NSStackView()
  private let rightCluster = NSStackView()
  private let detailArea = NSStackView()
  private let trayTitle = NSTextField(labelWithString: "Tray")
  private let trayEmptyLabel = NSTextField(labelWithString: "No screenshots collected today")
  private let thumbnailStrip = NSStackView()
  private let brandLabel = NSTextField(labelWithString: "Tray")
  private let statusLabel = NSTextField(labelWithString: "")
  private let countBadge = NSTextField(labelWithString: "0")
  private let voiceStatus = NSTextField(labelWithString: "Voice shortcut")
  private let dropStatus = NSTextField(labelWithString: "Drag text, images, or links here")
  private var capturedImages: [NSImage] = []
  private var expanded = false
  private var count = 0

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor
    registerForDraggedTypes([.fileURL, .string, .URL, .tiff, .png])
    buildView()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setExpanded(_ nextExpanded: Bool) {
    expanded = nextExpanded
    detailArea.isHidden = !nextExpanded
    brandLabel.isHidden = !nextExpanded
    countBadge.isHidden = nextExpanded
    statusLabel.stringValue = ""
    animateIsland(to: nextExpanded)
  }

  private func buildView() {
    island.wantsLayer = true
    island.frame = islandCanvasFrame()
    island.expanded = false
    island.onDraggingEntered = { [weak self] info in
      self?.handleDraggingEntered(info) ?? []
    }
    island.onDraggingExited = { [weak self] info in
      self?.handleDraggingExited(info)
    }
    island.onPerformDrag = { [weak self] info in
      self?.handlePerformDrag(info) ?? false
    }
    addSubview(island)

    topRow.wantsLayer = true
    topRow.layer?.backgroundColor = NSColor.clear.cgColor
    topRow.frame = NSRect(x: 0, y: island.bounds.height - 58, width: island.bounds.width, height: 50)
    island.addSubview(topRow)

    leftCluster.orientation = .horizontal
    leftCluster.alignment = .centerY
    leftCluster.spacing = 10
    leftCluster.translatesAutoresizingMaskIntoConstraints = true
    leftCluster.frame = NSRect(x: 24, y: 7, width: 210, height: 36)
    topRow.addSubview(leftCluster)

    rightCluster.orientation = .horizontal
    rightCluster.alignment = .centerY
    rightCluster.spacing = 8
    rightCluster.translatesAutoresizingMaskIntoConstraints = true
    rightCluster.frame = NSRect(x: topRow.bounds.width - 154, y: 7, width: 130, height: 36)
    topRow.addSubview(rightCluster)

    let brandGroup = NSStackView(views: [symbol("tray.fill"), brandLabel, countBadge])
    brandGroup.orientation = .horizontal
    brandGroup.alignment = .centerY
    brandGroup.spacing = 8

    brandLabel.font = .systemFont(ofSize: 17, weight: .bold)
    brandLabel.textColor = .white
    brandLabel.isHidden = true
    statusLabel.font = .systemFont(ofSize: 14, weight: .semibold)
    statusLabel.textColor = NSColor.white.withAlphaComponent(0.68)
    statusLabel.lineBreakMode = .byTruncatingTail

    countBadge.font = .systemFont(ofSize: 15, weight: .bold)
    countBadge.textColor = .white
    countBadge.alignment = .center
    countBadge.wantsLayer = false
    countBadge.isHidden = false
    countBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 12).isActive = true
    countBadge.heightAnchor.constraint(equalToConstant: 20).isActive = true

    leftCluster.addArrangedSubview(brandGroup)

    rightCluster.addArrangedSubview(actionButton(symbolName: "mic.fill", title: "Voice") { [weak self] in
      self?.flash("Listening placeholder")
    })
    rightCluster.addArrangedSubview(actionButton(symbolName: "scissors", title: "Screenshot") { [weak self] in
      self?.flash("Screenshot action")
    })
    rightCluster.addArrangedSubview(statusLabel)
    statusLabel.isHidden = true

    detailArea.orientation = .vertical
    detailArea.alignment = .width
    detailArea.distribution = .fill
    detailArea.spacing = 12
    detailArea.edgeInsets = NSEdgeInsets(top: 0, left: 22, bottom: 18, right: 22)
    detailArea.translatesAutoresizingMaskIntoConstraints = true
    detailArea.isHidden = true
    island.addSubview(detailArea)

    detailArea.addArrangedSubview(trayEmptyState())

    let click = NSClickGestureRecognizer(target: self, action: #selector(toggleFromClick))
    island.addGestureRecognizer(click)
    layoutIslandContent(expanded: false)
  }

  private func islandCanvasFrame() -> NSRect {
    return NSRect(
      x: (panelSize.width - expandedIslandSize.width) / 2,
      y: panelSize.height - expandedIslandSize.height,
      width: expandedIslandSize.width,
      height: expandedIslandSize.height
    )
  }

  private func animateIsland(to nextExpanded: Bool) {
    island.setExpanded(nextExpanded, animated: true)
    layoutIslandContent(expanded: nextExpanded)
  }

  private func layoutIslandContent(expanded: Bool) {
    let shapeRect = island.shapeRect(expanded: expanded)
    topRow.frame = NSRect(x: shapeRect.minX, y: shapeRect.maxY - (expanded ? 54 : 34), width: shapeRect.width, height: expanded ? 40 : 30)
    detailArea.frame = NSRect(x: shapeRect.minX + 30, y: shapeRect.minY + 16, width: shapeRect.width - 60, height: max(0, shapeRect.height - 70))
    let sideInset = expanded ? 70.0 : 30.0
    let rightWidth = 74.0
    let clusterY = expanded ? 5.0 : 2.0
    let clusterHeight = expanded ? 30.0 : 26.0
    leftCluster.frame = NSRect(x: sideInset, y: clusterY, width: max(96, (shapeRect.width - notchReservedWidth) / 2 - 24), height: clusterHeight)
    rightCluster.frame = NSRect(
      x: shapeRect.width - sideInset - rightWidth,
      y: clusterY,
      width: rightWidth,
      height: clusterHeight
    )
    statusLabel.isHidden = true
  }

  @objc private func toggleFromClick() {
    onToggle?()
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    handleDraggingEntered(sender)
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    handleDraggingExited(sender)
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    handlePerformDrag(sender)
  }

  private func handleDraggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    print("TinyBuNotch drag entered:", sender.draggingPasteboard.types?.map(\.rawValue) ?? [])
    setExpanded(true)
    guard canReadImage(from: sender.draggingPasteboard) else {
      trayEmptyLabel.stringValue = "Drop an image"
      print("TinyBuNotch drag rejected: no readable image")
      return []
    }
    trayEmptyLabel.stringValue = "Drop to collect"
    print("TinyBuNotch drag accepted")
    return .copy
  }

  private func handleDraggingExited(_ sender: NSDraggingInfo?) {
    refreshTray()
  }

  private func handlePerformDrag(_ sender: NSDraggingInfo) -> Bool {
    let images = readImages(from: sender.draggingPasteboard)
    guard !images.isEmpty else {
      trayEmptyLabel.stringValue = "No image found"
      print("TinyBuNotch drop failed: no image found")
      return false
    }

    capturedImages.append(contentsOf: images)
    count = capturedImages.count
    countBadge.stringValue = String(count)
    refreshTray()
    print("TinyBuNotch drop stored images:", images.count)
    return true
  }

  private func flash(_ text: String) {
    trayEmptyLabel.stringValue = text
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
      guard let self else { return }
      self.trayEmptyLabel.stringValue = "No screenshots collected today"
    }
  }

  private func trayEmptyState() -> NSView {
    let box = DashedTrayBox(frame: NSRect(x: 0, y: 0, width: 1, height: 84))
    trayEmptyLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    trayEmptyLabel.textColor = NSColor.white.withAlphaComponent(0.58)
    trayEmptyLabel.alignment = .center
    trayEmptyLabel.translatesAutoresizingMaskIntoConstraints = false
    thumbnailStrip.orientation = .horizontal
    thumbnailStrip.alignment = .centerY
    thumbnailStrip.spacing = 22
    thumbnailStrip.translatesAutoresizingMaskIntoConstraints = false
    box.addSubview(trayEmptyLabel)
    box.addSubview(thumbnailStrip)
    NSLayoutConstraint.activate([
      box.heightAnchor.constraint(equalToConstant: 84),
      trayEmptyLabel.centerXAnchor.constraint(equalTo: box.centerXAnchor),
      trayEmptyLabel.centerYAnchor.constraint(equalTo: box.centerYAnchor),
      trayEmptyLabel.leadingAnchor.constraint(greaterThanOrEqualTo: box.leadingAnchor, constant: 18),
      trayEmptyLabel.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor, constant: -18),
      thumbnailStrip.leadingAnchor.constraint(greaterThanOrEqualTo: box.leadingAnchor, constant: 24),
      thumbnailStrip.centerXAnchor.constraint(equalTo: box.centerXAnchor),
      thumbnailStrip.centerYAnchor.constraint(equalTo: box.centerYAnchor),
      thumbnailStrip.heightAnchor.constraint(equalToConstant: 64)
    ])
    refreshTray()
    return box
  }

  private func refreshTray() {
    thumbnailStrip.arrangedSubviews.forEach { view in
      thumbnailStrip.removeArrangedSubview(view)
      view.removeFromSuperview()
    }

    if capturedImages.isEmpty {
      trayEmptyLabel.isHidden = false
      trayEmptyLabel.stringValue = "No screenshots collected today"
      thumbnailStrip.isHidden = true
      return
    }

    trayEmptyLabel.isHidden = true
    thumbnailStrip.isHidden = false
    for image in capturedImages.suffix(5) {
      thumbnailStrip.addArrangedSubview(thumbnailView(for: image))
    }
  }

  private func thumbnailView(for image: NSImage) -> NSView {
    let container = NSView(frame: NSRect(x: 0, y: 0, width: 78, height: 58))

    let imageView = NSImageView(image: image)
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.wantsLayer = true
    imageView.layer?.cornerRadius = 6
    imageView.layer?.cornerCurve = .continuous
    imageView.layer?.masksToBounds = true
    imageView.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(imageView)
    NSLayoutConstraint.activate([
      container.widthAnchor.constraint(equalToConstant: 78),
      container.heightAnchor.constraint(equalToConstant: 58),
      imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      imageView.topAnchor.constraint(equalTo: container.topAnchor),
      imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
    ])
    return container
  }

  private func canReadImage(from pasteboard: NSPasteboard) -> Bool {
    !readImages(from: pasteboard, limit: 1).isEmpty
  }

  private func readImages(from pasteboard: NSPasteboard, limit: Int = 8) -> [NSImage] {
    var images: [NSImage] = []

    if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [NSURL] {
      for url in urls where images.count < limit {
        let fileUrl = url as URL
        guard isImageFile(fileUrl), let image = NSImage(contentsOf: fileUrl) else { continue }
        images.append(image)
      }
    }

    if images.isEmpty, let fileNames = pasteboard.propertyList(forType: .init("NSFilenamesPboardType")) as? [String] {
      for path in fileNames where images.count < limit {
        let url = URL(fileURLWithPath: path)
        guard isImageFile(url), let image = NSImage(contentsOf: url) else { continue }
        images.append(image)
      }
    }

    if images.isEmpty, let data = pasteboard.data(forType: .png), let image = NSImage(data: data) {
      images.append(image)
    }

    if images.isEmpty, let data = pasteboard.data(forType: .tiff), let image = NSImage(data: data) {
      images.append(image)
    }

    if images.isEmpty, let image = NSImage(pasteboard: pasteboard) {
      images.append(image)
    }

    return images
  }

  private func isImageFile(_ url: URL) -> Bool {
    let imageExtensions = ["png", "jpg", "jpeg", "heic", "heif", "gif", "tiff", "tif", "webp", "bmp"]
    return imageExtensions.contains(url.pathExtension.lowercased())
  }

  private func actionButton(symbolName: String, title: String, handler: @escaping () -> Void) -> NSButton {
    let button = HandlerButton(image: NSImage(systemSymbolName: symbolName, accessibilityDescription: title) ?? NSImage(), target: nil, action: nil)
    button.bezelStyle = .regularSquare
    button.isBordered = false
    button.contentTintColor = NSColor.white.withAlphaComponent(0.82)
    button.toolTip = title
    button.widthAnchor.constraint(equalToConstant: 28).isActive = true
    button.heightAnchor.constraint(equalToConstant: 28).isActive = true
    button.handler = handler
    button.target = button
    button.action = #selector(HandlerButton.invoke)
    return button
  }

  private func symbol(_ name: String) -> NSImageView {
    let image = NSImage(systemSymbolName: name, accessibilityDescription: nil) ?? NSImage()
    let view = NSImageView(image: image)
    view.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 16, weight: .semibold)
    view.contentTintColor = .white
    view.widthAnchor.constraint(equalToConstant: 20).isActive = true
    view.heightAnchor.constraint(equalToConstant: 20).isActive = true
    return view
  }
}

final class BlackIslandView: NSView {
  private let shapeLayer = CAShapeLayer()
  var onDraggingEntered: ((NSDraggingInfo) -> NSDragOperation)?
  var onDraggingExited: ((NSDraggingInfo?) -> Void)?
  var onPerformDrag: ((NSDraggingInfo) -> Bool)?

  var expanded = false {
    didSet {
      updateShape(animated: false)
    }
  }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor
    shapeLayer.fillColor = NSColor.black.cgColor
    shapeLayer.shadowColor = NSColor.black.cgColor
    shapeLayer.shadowOpacity = 0
    shapeLayer.shadowRadius = 0
    shapeLayer.shadowOffset = .zero
    layer?.addSublayer(shapeLayer)
    registerForDraggedTypes([.fileURL, .string, .URL, .tiff, .png, .init("NSFilenamesPboardType")])
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layout() {
    super.layout()
    shapeLayer.frame = bounds
    updateShape(animated: false)
  }

  func setExpanded(_ nextExpanded: Bool, animated: Bool) {
    guard nextExpanded != expanded else { return }
    expanded = nextExpanded
    updateShape(animated: animated)
  }

  func shapeRect(expanded: Bool) -> NSRect {
    let size = expanded ? expandedIslandSize : collapsedIslandSize
    return NSRect(
      x: (bounds.width - size.width) / 2,
      y: bounds.height - size.height,
      width: size.width,
      height: size.height
    )
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    onDraggingEntered?(sender) ?? []
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    onDraggingExited?(sender)
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    onPerformDrag?(sender) ?? false
  }

  private func updateShape(animated: Bool) {
    let nextPath = Self.path(in: shapeRect(expanded: expanded), expanded: expanded)
    let previousPath = (shapeLayer.presentation()?.path ?? shapeLayer.path) ?? nextPath
    shapeLayer.path = nextPath
    shapeLayer.shadowPath = nextPath

    guard animated else { return }

    let pathAnimation = CABasicAnimation(keyPath: "path")
    pathAnimation.fromValue = previousPath
    pathAnimation.toValue = nextPath
    pathAnimation.duration = 0.28
    pathAnimation.timingFunction = CAMediaTimingFunction(controlPoints: 0.18, 0.95, 0.28, 1.08)

    let shadowAnimation = CABasicAnimation(keyPath: "shadowPath")
    shadowAnimation.fromValue = previousPath
    shadowAnimation.toValue = nextPath
    shadowAnimation.duration = pathAnimation.duration
    shadowAnimation.timingFunction = pathAnimation.timingFunction

    let scaleAnimation = CASpringAnimation(keyPath: "transform.scale.y")
    scaleAnimation.fromValue = expanded ? 0.98 : 1.015
    scaleAnimation.toValue = 1
    scaleAnimation.mass = 0.65
    scaleAnimation.stiffness = 230
    scaleAnimation.damping = 18
    scaleAnimation.initialVelocity = 0.15
    scaleAnimation.duration = scaleAnimation.settlingDuration

    shapeLayer.add(pathAnimation, forKey: "tinybu.path.morph")
    shapeLayer.add(shadowAnimation, forKey: "tinybu.shadow.morph")
    shapeLayer.add(scaleAnimation, forKey: "tinybu.path.bounce")
  }

  static func path(in rect: NSRect, expanded: Bool) -> CGPath {
    if !expanded {
      return compactCollapsedPath(in: rect)
    }

    return referenceIslandPath(
      in: rect,
      referenceHeight: expanded ? 277.0 : 216.5,
      radius: 78.0
    )
  }

  private static func compactCollapsedPath(in rect: NSRect) -> CGPath {
    let referenceWidth = 982.0
    let referenceRadius = 32.0
    let rx = min(CGFloat(referenceRadius / referenceWidth) * rect.width, rect.width / 2)
    let ry = min(rect.height / 2, rx)
    let k = 0.5522847498
    let cx = rx * k
    let cy = ry * k
    let minX = rect.minX
    let maxX = rect.maxX
    let minY = rect.minY
    let maxY = rect.maxY

    let path = CGMutablePath()
    path.move(to: CGPoint(x: maxX, y: maxY))
    path.addCurve(
      to: CGPoint(x: maxX - rx, y: maxY - ry),
      control1: CGPoint(x: maxX - cx, y: maxY),
      control2: CGPoint(x: maxX - rx, y: maxY - ry + cy)
    )
    path.addLine(to: CGPoint(x: maxX - rx, y: minY + ry))
    path.addCurve(
      to: CGPoint(x: maxX - rx * 2, y: minY),
      control1: CGPoint(x: maxX - rx, y: minY + ry - cy),
      control2: CGPoint(x: maxX - rx * 2 + cx, y: minY)
    )
    path.addLine(to: CGPoint(x: minX + rx * 2, y: minY))
    path.addCurve(
      to: CGPoint(x: minX + rx, y: minY + ry),
      control1: CGPoint(x: minX + rx * 2 - cx, y: minY),
      control2: CGPoint(x: minX + rx, y: minY + ry - cy)
    )
    path.addLine(to: CGPoint(x: minX + rx, y: maxY - ry))
    path.addCurve(
      to: CGPoint(x: minX, y: maxY),
      control1: CGPoint(x: minX + rx, y: maxY - ry + cy),
      control2: CGPoint(x: minX + cx, y: maxY)
    )
    path.addLine(to: CGPoint(x: maxX, y: maxY))
    path.closeSubpath()
    return path
  }

  private static func referenceIslandPath(in rect: NSRect, referenceHeight: Double, radius: Double) -> CGPath {
    let referenceWidth = 982.0
    let control = radius * 0.5522847498
    let scaleX = rect.width / referenceWidth
    let scaleY = rect.height / referenceHeight

    func point(_ x: Double, _ y: Double) -> CGPoint {
      CGPoint(
        x: rect.minX + CGFloat(x) * scaleX,
        y: rect.maxY - CGFloat(y) * scaleY
      )
    }

    let path = CGMutablePath()
    path.move(to: point(982, 0))
    path.addCurve(
      to: point(referenceWidth - radius, radius),
      control1: point(referenceWidth - control, 0),
      control2: point(referenceWidth - radius, radius - control)
    )
    path.addLine(to: point(referenceWidth - radius, referenceHeight - radius))
    path.addCurve(
      to: point(referenceWidth - radius * 2, referenceHeight),
      control1: point(referenceWidth - radius, referenceHeight - radius + control),
      control2: point(referenceWidth - radius * 2 + control, referenceHeight)
    )
    path.addLine(to: point(radius * 2, referenceHeight))
    path.addCurve(
      to: point(radius, referenceHeight - radius),
      control1: point(radius * 2 - control, referenceHeight),
      control2: point(radius, referenceHeight - radius + control)
    )
    path.addLine(to: point(radius, radius))
    path.addCurve(
      to: point(0, 0),
      control1: point(radius, radius - control),
      control2: point(control, 0)
    )
    path.addLine(to: point(982, 0))
    path.closeSubpath()
    return path
  }
}

private extension NSSize {
  var bounds: NSRect {
    NSRect(origin: .zero, size: self)
  }
}

final class DashedTrayBox: NSView {
  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    translatesAutoresizingMaskIntoConstraints = false
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    let rect = bounds.insetBy(dx: 1.5, dy: 1.5)
    let path = NSBezierPath(roundedRect: rect, xRadius: 18, yRadius: 18)
    path.lineWidth = 2
    let pattern: [CGFloat] = [7, 8]
    path.setLineDash(pattern, count: pattern.count, phase: 0)
    NSColor.white.withAlphaComponent(0.13).setStroke()
    path.stroke()
  }
}

final class HandlerButton: NSButton {
  var handler: (() -> Void)?

  @objc func invoke() {
    handler?()
  }
}

final class HotKeyCenter {
  private static var action: (() -> Void)?
  private var hotKeyRef: EventHotKeyRef?

  init(action: @escaping () -> Void) {
    Self.action = action
    var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
      guard let event else { return noErr }
      var hotKeyID = EventHotKeyID()
      GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &hotKeyID
      )
      if hotKeyID.signature == hotKeySignature {
        DispatchQueue.main.async {
          HotKeyCenter.action?()
        }
      }
      return noErr
    }, 1, &eventType, nil, nil)

    let hotKeyID = EventHotKeyID(signature: hotKeySignature, id: 1)
    RegisterEventHotKey(UInt32(kVK_Space), UInt32(cmdKey | shiftKey), hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
  }

  deinit {
    if let hotKeyRef {
      UnregisterEventHotKey(hotKeyRef)
    }
  }
}

private func fourCharCode(_ string: String) -> OSType {
  string.utf8.reduce(0) { result, character in
    (result << 8) + OSType(character)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
