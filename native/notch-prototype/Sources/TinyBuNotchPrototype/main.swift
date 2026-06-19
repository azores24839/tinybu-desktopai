import AppKit
import Carbon.HIToolbox

private let panelSize = NSSize(width: 680, height: 176)
private let collapsedIslandSize = NSSize(width: 420, height: 48)
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
    panel.level = .screenSaver
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
  private let brandLabel = NSTextField(labelWithString: "TinyBu")
  private let statusLabel = NSTextField(labelWithString: "")
  private let countBadge = NSTextField(labelWithString: "0")
  private let voiceStatus = NSTextField(labelWithString: "Voice shortcut")
  private let dropStatus = NSTextField(labelWithString: "Drag text, images, or links here")
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
    statusLabel.stringValue = nextExpanded ? "Today 0 captures · Native prototype" : ""
    animateIsland(to: nextExpanded)
  }

  private func buildView() {
    island.wantsLayer = true
    island.frame = islandCanvasFrame()
    island.expanded = false
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
    rightCluster.spacing = 10
    rightCluster.translatesAutoresizingMaskIntoConstraints = true
    rightCluster.frame = NSRect(x: topRow.bounds.width - 154, y: 7, width: 130, height: 36)
    topRow.addSubview(rightCluster)

    let brandGroup = NSStackView(views: [symbol("tray.fill"), brandLabel, countBadge])
    brandGroup.orientation = .horizontal
    brandGroup.alignment = .centerY
    brandGroup.spacing = 8

    brandLabel.font = .systemFont(ofSize: 17, weight: .bold)
    brandLabel.textColor = .white
    statusLabel.font = .systemFont(ofSize: 14, weight: .semibold)
    statusLabel.textColor = NSColor.white.withAlphaComponent(0.68)
    statusLabel.lineBreakMode = .byTruncatingTail

    countBadge.font = .systemFont(ofSize: 12, weight: .bold)
    countBadge.textColor = .black
    countBadge.alignment = .center
    countBadge.wantsLayer = true
    countBadge.layer?.backgroundColor = NSColor.white.cgColor
    countBadge.layer?.cornerRadius = 9
    countBadge.isHidden = true
    countBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 20).isActive = true
    countBadge.heightAnchor.constraint(equalToConstant: 20).isActive = true

    leftCluster.addArrangedSubview(brandGroup)

    rightCluster.addArrangedSubview(actionButton(symbolName: "mic.fill", title: "Voice") { [weak self] in
      self?.flash("Listening placeholder")
    })
    rightCluster.addArrangedSubview(actionButton(symbolName: "scissors", title: "Screenshot") { [weak self] in
      self?.flash("Screenshot action")
    })
    rightCluster.addArrangedSubview(actionButton(symbolName: "arrow.uturn.backward", title: "Undo") { [weak self] in
      self?.flash("Undo placeholder")
    })
    rightCluster.addArrangedSubview(statusLabel)
    statusLabel.isHidden = true

    detailArea.orientation = .horizontal
    detailArea.alignment = .top
    detailArea.distribution = .fillEqually
    detailArea.spacing = 18
    detailArea.edgeInsets = NSEdgeInsets(top: 0, left: 26, bottom: 24, right: 26)
    detailArea.translatesAutoresizingMaskIntoConstraints = false
    detailArea.isHidden = true
    island.addSubview(detailArea)

    detailArea.addArrangedSubview(infoColumn(title: "Today", value: "0 captures", note: "Browser extension and desktop capture will plug in here."))
    detailArea.addArrangedSubview(infoColumn(title: "Voice", value: "Press ⌘⇧Space", note: "The native panel owns the system-level shortcut."))
    detailArea.addArrangedSubview(infoColumn(title: "Drop Zone", value: "Hover to collect", note: "Drag text, images, links, or files into the island."))

    NSLayoutConstraint.activate([
      detailArea.topAnchor.constraint(equalTo: island.topAnchor, constant: 60),
      detailArea.leadingAnchor.constraint(equalTo: island.leadingAnchor),
      detailArea.trailingAnchor.constraint(equalTo: island.trailingAnchor),
      detailArea.bottomAnchor.constraint(equalTo: island.bottomAnchor)
    ])

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
    topRow.frame = NSRect(x: shapeRect.minX, y: shapeRect.maxY - (expanded ? 54 : 42), width: shapeRect.width, height: 40)
    leftCluster.frame = NSRect(x: 18, y: 5, width: max(96, (shapeRect.width - notchReservedWidth) / 2 - 24), height: 30)
    rightCluster.frame = NSRect(
      x: shapeRect.width - max(94, (shapeRect.width - notchReservedWidth) / 2 - 24) - 18,
      y: 5,
      width: max(94, (shapeRect.width - notchReservedWidth) / 2 - 36),
      height: 30
    )
    statusLabel.isHidden = !expanded
  }

  @objc private func toggleFromClick() {
    onToggle?()
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    setExpanded(true)
    statusLabel.stringValue = "Drop to collect"
    statusLabel.isHidden = false
    island.layer?.shadowOpacity = 0.55
    return .copy
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    statusLabel.stringValue = expanded ? "Today \(count) captures · Native prototype" : ""
    statusLabel.isHidden = !expanded
    island.layer?.shadowOpacity = 0.35
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    count += 1
    countBadge.stringValue = String(count)
    countBadge.isHidden = false
    flash("Collected placeholder")
    return true
  }

  private func flash(_ text: String) {
    statusLabel.stringValue = text
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
      guard let self else { return }
      self.statusLabel.stringValue = self.expanded ? "Today \(self.count) captures · Native prototype" : ""
      self.statusLabel.isHidden = !self.expanded
    }
  }

  private func infoColumn(title: String, value: String, note: String) -> NSView {
    let titleLabel = NSTextField(labelWithString: title.uppercased())
    titleLabel.font = .systemFont(ofSize: 11, weight: .bold)
    titleLabel.textColor = NSColor.white.withAlphaComponent(0.45)

    let valueLabel = NSTextField(labelWithString: value)
    valueLabel.font = .systemFont(ofSize: 20, weight: .bold)
    valueLabel.textColor = .white

    let noteLabel = NSTextField(wrappingLabelWithString: note)
    noteLabel.font = .systemFont(ofSize: 12, weight: .medium)
    noteLabel.textColor = NSColor.white.withAlphaComponent(0.58)

    let stack = NSStackView(views: [titleLabel, valueLabel, noteLabel])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 7
    return stack
  }

  private func actionButton(symbolName: String, title: String, handler: @escaping () -> Void) -> NSButton {
    let button = HandlerButton(image: NSImage(systemSymbolName: symbolName, accessibilityDescription: title) ?? NSImage(), target: nil, action: nil)
    button.bezelStyle = .regularSquare
    button.isBordered = false
    button.contentTintColor = NSColor.white.withAlphaComponent(0.82)
    button.toolTip = title
    button.widthAnchor.constraint(equalToConstant: 32).isActive = true
    button.heightAnchor.constraint(equalToConstant: 32).isActive = true
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
    shapeLayer.shadowOpacity = 0.42
    shapeLayer.shadowRadius = 24
    shapeLayer.shadowOffset = NSSize(width: 0, height: -8)
    layer?.addSublayer(shapeLayer)
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
    let referenceRadius = 78.0
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
