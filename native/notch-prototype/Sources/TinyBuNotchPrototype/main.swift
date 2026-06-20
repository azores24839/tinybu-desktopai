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
    notchView.onExpand = { [weak self] in self?.setExpanded(true) }
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
  var onExpand: (() -> Void)?
  var onCollapse: (() -> Void)?

  private let island = BlackIslandView(frame: .zero)
  private let topRow = NSView()
  private let leftCluster = NSStackView()
  private let rightCluster = NSStackView()
  private let detailArea = NSStackView()
  private let trayEmptyLabel = NSTextField(labelWithString: "No screenshots collected today")
  private let thumbnailStrip = NSStackView()
  private let previewContainer = NSView()
  private let previewImageView = NSImageView()
  private let previewActionStack = NSStackView()
  private let previewStatusLabel = NSTextField(labelWithString: "")
  private let questionFieldContainer = NSView()
  private let questionInput = NSTextField(string: "")
  private let askProgress = NSProgressIndicator()
  private let titleIconView = NSImageView()
  private let brandLabel = NSTextField(labelWithString: "Tray")
  private let statusLabel = NSTextField(labelWithString: "")
  private let countBadge = NSTextField(labelWithString: "0")
  private let voiceStatus = NSTextField(labelWithString: "Voice shortcut")
  private let dropStatus = NSTextField(labelWithString: "Drag text, images, or links here")
  private weak var trayBox: DashedTrayBox?
  private var capturedImages: [NSImage] = []
  private var selectedImageIndex: Int?
  private var askWorkItem: DispatchWorkItem?
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
    if !nextExpanded {
      askWorkItem?.cancel()
      selectedImageIndex = nil
      refreshTray()
    }
    detailArea.isHidden = !nextExpanded
    brandLabel.isHidden = !nextExpanded
    countBadge.isHidden = nextExpanded
    rightCluster.isHidden = !nextExpanded
    statusLabel.stringValue = ""
    updateTitleState()
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
    island.onBackgroundClick = { [weak self] in
      self?.handleBackgroundClick()
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
    rightCluster.isHidden = true
    topRow.addSubview(rightCluster)

    configureTitleIcon("tray.fill")
    let brandGroup = NSStackView(views: [titleIconView, brandLabel, countBadge])
    brandGroup.orientation = .horizontal
    brandGroup.alignment = .centerY
    brandGroup.spacing = 8
    titleIconView.widthAnchor.constraint(equalToConstant: 20).isActive = true
    titleIconView.heightAnchor.constraint(equalToConstant: 20).isActive = true
    let titleClick = NSClickGestureRecognizer(target: self, action: #selector(backToTrayFromTitle))
    brandGroup.addGestureRecognizer(titleClick)

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
    rightCluster.isHidden = !expanded
    statusLabel.isHidden = true
  }

  @objc private func backToTrayFromTitle() {
    guard selectedImageIndex != nil else { return }
    selectedImageIndex = nil
    refreshTray()
  }

  override func mouseUp(with event: NSEvent) {
    guard expanded else { return }
    let location = convert(event.locationInWindow, from: nil)
    let islandLocation = island.convert(location, from: self)
    if !island.containsVisibleShape(islandLocation) {
      onCollapse?()
    }
  }

  private func handleBackgroundClick() {
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
    onExpand?()
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
    selectedImageIndex = nil
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
    trayBox = box
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
    setupPreviewState(in: box)
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
      selectedImageIndex = nil
      updateTitleState()
      trayBox?.showsBorder = true
      trayEmptyLabel.isHidden = false
      trayEmptyLabel.stringValue = "No screenshots collected today"
      thumbnailStrip.isHidden = true
      previewContainer.isHidden = true
      return
    }

    if let selectedImageIndex, capturedImages.indices.contains(selectedImageIndex) {
      showPreview(for: selectedImageIndex)
      return
    }

    trayEmptyLabel.isHidden = true
    thumbnailStrip.isHidden = false
    previewContainer.isHidden = true
    trayBox?.showsBorder = true
    updateTitleState()
    let startIndex = max(0, capturedImages.count - 5)
    for index in startIndex..<capturedImages.count {
      thumbnailStrip.addArrangedSubview(thumbnailView(for: capturedImages[index], index: index))
    }
  }

  private func thumbnailView(for image: NSImage, index: Int) -> NSView {
    let button = HandlerButton(image: image, target: nil, action: nil)
    button.isBordered = false
    button.imagePosition = .imageOnly
    button.imageScaling = .scaleProportionallyUpOrDown
    button.toolTip = "Preview image"
    button.wantsLayer = true
    button.layer?.cornerRadius = 6
    button.layer?.cornerCurve = .continuous
    button.layer?.masksToBounds = true
    button.translatesAutoresizingMaskIntoConstraints = false
    button.handler = { [weak self] in
      self?.selectImage(at: index)
    }
    button.target = button
    button.action = #selector(HandlerButton.invoke)
    NSLayoutConstraint.activate([
      button.widthAnchor.constraint(equalToConstant: 78),
      button.heightAnchor.constraint(equalToConstant: 58)
    ])
    return button
  }

  private func setupPreviewState(in box: NSView) {
    previewContainer.translatesAutoresizingMaskIntoConstraints = false
    previewContainer.isHidden = true
    box.addSubview(previewContainer)

    previewImageView.imageScaling = .scaleProportionallyUpOrDown
    previewImageView.wantsLayer = true
    previewImageView.layer?.cornerRadius = 8
    previewImageView.layer?.cornerCurve = .continuous
    previewImageView.layer?.masksToBounds = true
    previewImageView.translatesAutoresizingMaskIntoConstraints = false
    previewContainer.addSubview(previewImageView)

    previewActionStack.orientation = .horizontal
    previewActionStack.alignment = .centerY
    previewActionStack.spacing = 6
    previewActionStack.translatesAutoresizingMaskIntoConstraints = false
    previewContainer.addSubview(previewActionStack)

    let askButton = askPillButton { [weak self] in
      self?.beginAskFlow()
    }
    let deleteButton = actionButton(symbolName: "trash", title: "Delete") { [weak self] in
      self?.deleteSelectedImage()
    }
    deleteButton.contentTintColor = NSColor.white.withAlphaComponent(0.7)
    previewActionStack.addArrangedSubview(askButton)
    previewActionStack.addArrangedSubview(deleteButton)

    askProgress.style = .spinning
    askProgress.controlSize = .small
    askProgress.isDisplayedWhenStopped = false
    askProgress.translatesAutoresizingMaskIntoConstraints = false
    previewContainer.addSubview(askProgress)

    previewStatusLabel.font = .systemFont(ofSize: 12, weight: .semibold)
    previewStatusLabel.textColor = NSColor.white.withAlphaComponent(0.58)
    previewStatusLabel.alignment = .left
    previewStatusLabel.stringValue = "Reading"
    previewStatusLabel.translatesAutoresizingMaskIntoConstraints = false
    previewStatusLabel.isHidden = true
    previewContainer.addSubview(previewStatusLabel)

    questionFieldContainer.wantsLayer = true
    questionFieldContainer.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.09).cgColor
    questionFieldContainer.layer?.cornerRadius = 12
    questionFieldContainer.layer?.cornerCurve = .continuous
    questionFieldContainer.translatesAutoresizingMaskIntoConstraints = false
    questionFieldContainer.isHidden = true
    previewContainer.addSubview(questionFieldContainer)

    questionInput.font = .systemFont(ofSize: 13, weight: .medium)
    questionInput.textColor = .white
    questionInput.placeholderString = "Ask about this image..."
    questionInput.backgroundColor = .clear
    questionInput.focusRingType = .none
    questionInput.isBezeled = false
    questionInput.translatesAutoresizingMaskIntoConstraints = false
    questionFieldContainer.addSubview(questionInput)

    let sendButton = actionButton(symbolName: "paperplane.fill", title: "Send") { [weak self] in
      self?.submitQuestion()
    }
    sendButton.contentTintColor = NSColor.white.withAlphaComponent(0.72)
    sendButton.translatesAutoresizingMaskIntoConstraints = false
    questionFieldContainer.addSubview(sendButton)

    NSLayoutConstraint.activate([
      previewContainer.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 22),
      previewContainer.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -22),
      previewContainer.topAnchor.constraint(equalTo: box.topAnchor, constant: 8),
      previewContainer.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -8),

      previewImageView.leadingAnchor.constraint(equalTo: previewContainer.leadingAnchor, constant: 70),
      previewImageView.centerYAnchor.constraint(equalTo: previewContainer.centerYAnchor),
      previewImageView.widthAnchor.constraint(equalToConstant: 118),
      previewImageView.heightAnchor.constraint(equalToConstant: 58),

      previewActionStack.leadingAnchor.constraint(equalTo: previewImageView.trailingAnchor, constant: 12),
      previewActionStack.centerYAnchor.constraint(equalTo: previewContainer.centerYAnchor),

      askProgress.leadingAnchor.constraint(equalTo: previewImageView.trailingAnchor, constant: 20),
      askProgress.centerYAnchor.constraint(equalTo: previewContainer.centerYAnchor),
      askProgress.widthAnchor.constraint(equalToConstant: 18),
      askProgress.heightAnchor.constraint(equalToConstant: 18),

      previewStatusLabel.leadingAnchor.constraint(equalTo: askProgress.trailingAnchor, constant: 8),
      previewStatusLabel.centerYAnchor.constraint(equalTo: previewContainer.centerYAnchor),

      questionFieldContainer.leadingAnchor.constraint(equalTo: previewImageView.trailingAnchor, constant: 18),
      questionFieldContainer.trailingAnchor.constraint(equalTo: previewContainer.trailingAnchor, constant: -44),
      questionFieldContainer.centerYAnchor.constraint(equalTo: previewContainer.centerYAnchor),
      questionFieldContainer.heightAnchor.constraint(equalToConstant: 32),

      questionInput.leadingAnchor.constraint(equalTo: questionFieldContainer.leadingAnchor, constant: 12),
      questionInput.trailingAnchor.constraint(equalTo: sendButton.leadingAnchor, constant: -6),
      questionInput.centerYAnchor.constraint(equalTo: questionFieldContainer.centerYAnchor),

      sendButton.trailingAnchor.constraint(equalTo: questionFieldContainer.trailingAnchor, constant: -4),
      sendButton.centerYAnchor.constraint(equalTo: questionFieldContainer.centerYAnchor)
    ])
  }

  private func selectImage(at index: Int) {
    guard capturedImages.indices.contains(index) else { return }
    selectedImageIndex = index
    showPreview(for: index)
  }

  private func showPreview(for index: Int) {
    askWorkItem?.cancel()
    askProgress.stopAnimation(nil)
    previewImageView.image = capturedImages[index]
    trayBox?.showsBorder = false
    updateTitleState()
    trayEmptyLabel.isHidden = true
    thumbnailStrip.isHidden = true
    previewContainer.isHidden = false
    previewActionStack.isHidden = false
    askProgress.isHidden = true
    previewStatusLabel.isHidden = true
    questionFieldContainer.isHidden = true
    questionInput.stringValue = ""
  }

  private func deleteSelectedImage() {
    guard let selectedImageIndex, capturedImages.indices.contains(selectedImageIndex) else { return }
    capturedImages.remove(at: selectedImageIndex)
    self.selectedImageIndex = nil
    count = capturedImages.count
    countBadge.stringValue = String(count)
    refreshTray()
  }

  private func beginAskFlow() {
    guard selectedImageIndex != nil else { return }
    askWorkItem?.cancel()
    previewActionStack.isHidden = true
    questionFieldContainer.isHidden = true
    previewStatusLabel.isHidden = false
    askProgress.isHidden = false
    askProgress.startAnimation(nil)

    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.askProgress.stopAnimation(nil)
      self.askProgress.isHidden = true
      self.previewStatusLabel.isHidden = true
      self.questionFieldContainer.isHidden = false
      self.window?.makeFirstResponder(self.questionInput)
    }
    askWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.85, execute: workItem)
  }

  private func submitQuestion() {
    guard !questionInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    questionFieldContainer.isHidden = true
    previewStatusLabel.stringValue = "Sending"
    previewStatusLabel.isHidden = false
    askProgress.isHidden = false
    askProgress.startAnimation(nil)

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) { [weak self] in
      guard let self else { return }
      self.askProgress.stopAnimation(nil)
      self.askProgress.isHidden = true
      self.previewStatusLabel.isHidden = true
      self.questionInput.stringValue = ""
      self.questionFieldContainer.isHidden = false
      self.window?.makeFirstResponder(self.questionInput)
    }
  }

  private func updateTitleState() {
    if selectedImageIndex == nil {
      configureTitleIcon("tray.fill")
      brandLabel.stringValue = "Tray"
      countBadge.isHidden = expanded
      return
    }

    configureTitleIcon("chevron.left")
    brandLabel.stringValue = "Back"
    countBadge.isHidden = true
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

  private func askPillButton(handler: @escaping () -> Void) -> NSButton {
    let button = HandlerButton(title: "Ask", target: nil, action: nil)
    button.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Ask")
    button.imagePosition = .imageLeading
    button.imageHugsTitle = true
    button.bezelStyle = .regularSquare
    button.isBordered = false
    button.font = .systemFont(ofSize: 13, weight: .semibold)
    button.contentTintColor = NSColor.black.withAlphaComponent(0.86)
    button.wantsLayer = true
    button.layer?.backgroundColor = NSColor.systemYellow.cgColor
    button.layer?.cornerRadius = 14
    button.layer?.cornerCurve = .continuous
    button.toolTip = "Ask"
    button.widthAnchor.constraint(equalToConstant: 82).isActive = true
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

  private func configureTitleIcon(_ name: String) {
    titleIconView.image = NSImage(systemSymbolName: name, accessibilityDescription: nil) ?? NSImage()
    titleIconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: name == "chevron.left" ? 15 : 16, weight: .semibold)
    titleIconView.contentTintColor = .white
  }
}

final class BlackIslandView: NSView {
  private let shapeLayer = CAShapeLayer()
  var onDraggingEntered: ((NSDraggingInfo) -> NSDragOperation)?
  var onDraggingExited: ((NSDraggingInfo?) -> Void)?
  var onPerformDrag: ((NSDraggingInfo) -> Bool)?
  var onBackgroundClick: (() -> Void)?

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

  func containsVisibleShape(_ point: NSPoint) -> Bool {
    Self.path(in: shapeRect(expanded: expanded), expanded: expanded).contains(point)
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    guard !isHidden, alphaValue > 0, bounds.contains(point) else { return nil }
    guard containsVisibleShape(point) else { return nil }

    for subview in subviews.reversed() {
      let convertedPoint = subview.convert(point, from: self)
      guard let hitView = subview.hitTest(convertedPoint) else { continue }
      if hitView.isInteractiveHitTarget {
        return hitView
      }
      return self
    }

    return self
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

  override func mouseUp(with event: NSEvent) {
    onBackgroundClick?()
  }

  private func updateShape(animated: Bool) {
    let nextPath = Self.path(in: shapeRect(expanded: expanded), expanded: expanded)
    let previousPath = (shapeLayer.presentation()?.path ?? shapeLayer.path) ?? nextPath
    shapeLayer.path = nextPath
    shapeLayer.shadowPath = nextPath

    guard animated else { return }

    let targetSize = expanded ? expandedIslandSize : collapsedIslandSize
    let bounceScale: CGFloat = expanded ? 1.018 : 0.982
    let bounceSize = NSSize(
      width: targetSize.width * bounceScale,
      height: targetSize.height * bounceScale
    )
    let bounceRect = NSRect(
      x: (bounds.width - bounceSize.width) / 2,
      y: bounds.height - bounceSize.height,
      width: bounceSize.width,
      height: bounceSize.height
    )
    let bouncePath = Self.path(in: bounceRect, expanded: expanded)
    let timingFunctions = [
      CAMediaTimingFunction(controlPoints: 0.18, 0.84, 0.24, 1.0),
      CAMediaTimingFunction(name: .easeInEaseOut)
    ]

    let pathAnimation = CAKeyframeAnimation(keyPath: "path")
    pathAnimation.values = [previousPath, bouncePath, nextPath]
    pathAnimation.keyTimes = [0, 0.78, 1]
    pathAnimation.timingFunctions = timingFunctions
    pathAnimation.duration = 0.34

    let shadowAnimation = CAKeyframeAnimation(keyPath: "shadowPath")
    shadowAnimation.values = pathAnimation.values
    shadowAnimation.keyTimes = pathAnimation.keyTimes
    shadowAnimation.timingFunctions = timingFunctions
    shadowAnimation.duration = pathAnimation.duration

    shapeLayer.add(pathAnimation, forKey: "tinybu.path.morph")
    shapeLayer.add(shadowAnimation, forKey: "tinybu.shadow.morph")
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

private extension NSView {
  var isInteractiveHitTarget: Bool {
    if self is NSButton || self is NSTextView {
      return true
    }
    if let textField = self as? NSTextField {
      return textField.isEditable || textField.isSelectable
    }
    return false
  }
}

final class DashedTrayBox: NSView {
  var showsBorder = true {
    didSet {
      needsDisplay = true
    }
  }

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
    guard showsBorder else { return }
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
