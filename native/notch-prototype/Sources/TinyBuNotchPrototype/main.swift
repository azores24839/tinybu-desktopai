import AppKit
import AVFoundation
import Carbon.HIToolbox
import Darwin
import ImageIO
import Speech
import Vision

private let panelSize = NSSize(width: 820, height: 176)
private let collapsedIslandSize = NSSize(width: 357, height: 36)
private let expandedIslandSize = NSSize(width: 620, height: 154)
private let notchReservedWidth: CGFloat = 190.0
private let hotKeySignature = fourCharCode("TBU1")
private let ipcPrefix = "TINYBU_IPC "
private let islandPetImage: NSImage? = {
  let arguments = CommandLine.arguments
  if
    let flagIndex = arguments.firstIndex(of: "--island-pet-path"),
    arguments.indices.contains(flagIndex + 1),
    let image = NSImage(contentsOfFile: arguments[flagIndex + 1])
  {
    return image
  }

  let sourceAsset = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("Assets/islandpet.png")
  return NSImage(contentsOf: sourceAsset)
}()
private let islandPetLoadingImage: NSImage? = {
  let arguments = CommandLine.arguments
  if
    let flagIndex = arguments.firstIndex(of: "--island-pet-loading-path"),
    arguments.indices.contains(flagIndex + 1),
    let image = NSImage(contentsOfFile: arguments[flagIndex + 1])
  {
    return image
  }

  let sourceAsset = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("Assets/loading.gif")
  return NSImage(contentsOf: sourceAsset)
}()

private func notchLog(_ message: String) {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
}

final class NotchIPC {
  var onMessage: (([String: Any]) -> Void)?
  private var inputBuffer = Data()

  init() {
    FileHandle.standardInput.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty else { return }
      DispatchQueue.main.async {
        self?.consume(data)
      }
    }
  }

  deinit {
    FileHandle.standardInput.readabilityHandler = nil
  }

  func send(type: String, fields: [String: Any]) {
    var payload = fields
    payload["type"] = type
    guard
      JSONSerialization.isValidJSONObject(payload),
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else {
      notchLog("TinyBuNotch could not encode IPC message")
      return
    }
    FileHandle.standardOutput.write(Data("\(ipcPrefix)\(json)\n".utf8))
  }

  private func consume(_ data: Data) {
    inputBuffer.append(data)
    while let newline = inputBuffer.firstIndex(of: 0x0A) {
      let lineData = inputBuffer[..<newline]
      inputBuffer.removeSubrange(...newline)
      guard
        !lineData.isEmpty,
        let object = try? JSONSerialization.jsonObject(with: Data(lineData)) as? [String: Any]
      else { continue }
      onMessage?(object)
    }
  }
}

final class SpeechInputController {
  var onText: ((String) -> Void)?
  var onRecordingChanged: ((Bool) -> Void)?
  var onError: ((String) -> Void)?

  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private(set) var isRecording = false

  func toggle() {
    isRecording ? stop() : requestAccessAndStart()
  }

  func stop() {
    guard isRecording else { return }
    isRecording = false
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    onRecordingChanged?(false)
  }

  private func requestAccessAndStart() {
    SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
      guard speechStatus == .authorized else {
        DispatchQueue.main.async { self?.onError?("Allow Speech Recognition in System Settings") }
        return
      }
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        DispatchQueue.main.async {
          guard granted else {
            self?.onError?("Allow Microphone access in System Settings")
            return
          }
          self?.start()
        }
      }
    }
  }

  private func start() {
    recognitionTask?.cancel()
    recognitionTask = nil

    let locale = currentInputLocale()
    guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
      onError?("Speech recognition is unavailable for \(locale.localizedString(forIdentifier: locale.identifier) ?? locale.identifier)")
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.taskHint = .dictation
    recognitionRequest = request

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
      request.append(buffer)
    }

    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async {
        if let result {
          self?.onText?(result.bestTranscription.formattedString)
        }
        if error != nil || result?.isFinal == true {
          self?.finishRecognition()
        }
      }
    }

    do {
      audioEngine.prepare()
      try audioEngine.start()
      isRecording = true
      onRecordingChanged?(true)
    } catch {
      inputNode.removeTap(onBus: 0)
      recognitionRequest = nil
      recognitionTask = nil
      onError?("Microphone could not start")
    }
  }

  private func finishRecognition() {
    if isRecording {
      audioEngine.stop()
      audioEngine.inputNode.removeTap(onBus: 0)
    }
    isRecording = false
    recognitionRequest = nil
    recognitionTask = nil
    onRecordingChanged?(false)
  }

  private func currentInputLocale() -> Locale {
    let inputSource = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
    if
      let property = TISGetInputSourceProperty(inputSource, kTISPropertyInputSourceLanguages),
      let languages = Unmanaged<CFArray>.fromOpaque(property).takeUnretainedValue() as? [String],
      let language = languages.first
    {
      if language.lowercased().hasPrefix("zh") {
        return Locale(identifier: language.contains("TW") || language.contains("Hant") ? "zh-TW" : "zh-CN")
      }
      if language.lowercased().hasPrefix("en") {
        return Locale(identifier: language.contains("GB") ? "en-GB" : "en-US")
      }
    }
    return Locale.current
  }
}

private struct LocalOCRResult {
  let text: String
  let lines: [String]
  let language: String
  let truncated: Bool
  let error: String?
}

private final class LocalOCRController {
  typealias PreviewHandler = (NSImage) -> Void
  typealias CompletionHandler = (LocalOCRResult) -> Void

  private let queue = DispatchQueue(label: "com.tinybu.notch.ocr", qos: .userInitiated)
  private let lock = NSLock()
  private var activeJobID: String?
  private var activeRequest: VNRecognizeTextRequest?
  private var timeoutWorkItem: DispatchWorkItem?

  func recognize(
    imageAt path: String,
    jobID: String,
    onPreview: @escaping PreviewHandler,
    completion: @escaping CompletionHandler
  ) {
    cancel()
    lock.lock()
    activeJobID = jobID
    lock.unlock()

    let timeout = DispatchWorkItem { [weak self] in
      self?.finish(
        jobID: jobID,
        result: LocalOCRResult(text: "", lines: [], language: "unknown", truncated: false, error: "OCR timed out"),
        completion: completion
      )
    }
    lock.lock()
    timeoutWorkItem = timeout
    lock.unlock()
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)

    queue.async { [weak self] in
      guard let self else { return }
      do {
        let data = try Data(contentsOf: URL(fileURLWithPath: path), options: .mappedIfSafe)
        guard
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else {
          throw NSError(domain: "TinyBuOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Screenshot could not be decoded"])
        }

        if let preview = NSImage(data: data) {
          DispatchQueue.main.async {
            guard self.isActive(jobID) else { return }
            onPreview(preview)
          }
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
        if #available(macOS 13.0, *) {
          request.automaticallyDetectsLanguage = true
        }

        self.lock.lock()
        guard self.activeJobID == jobID else {
          self.lock.unlock()
          return
        }
        self.activeRequest = request
        self.lock.unlock()

        try VNImageRequestHandler(cgImage: cgImage, orientation: .up).perform([request])
        let result = Self.normalizedResult(from: request.results ?? [])
        self.finish(jobID: jobID, result: result, completion: completion)
      } catch {
        self.finish(
          jobID: jobID,
          result: LocalOCRResult(
            text: "",
            lines: [],
            language: "unknown",
            truncated: false,
            error: error.localizedDescription
          ),
          completion: completion
        )
      }
    }
  }

  func cancel() {
    lock.lock()
    activeJobID = nil
    activeRequest?.cancel()
    activeRequest = nil
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    lock.unlock()
  }

  private func isActive(_ jobID: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeJobID == jobID
  }

  private func finish(jobID: String, result: LocalOCRResult, completion: @escaping CompletionHandler) {
    lock.lock()
    guard activeJobID == jobID else {
      lock.unlock()
      return
    }
    activeJobID = nil
    activeRequest?.cancel()
    activeRequest = nil
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    lock.unlock()

    DispatchQueue.main.async {
      completion(result)
    }
  }

  private static func normalizedResult(from observations: [VNRecognizedTextObservation]) -> LocalOCRResult {
    let sorted = observations.sorted { lhs, rhs in
      let verticalDifference = lhs.boundingBox.midY - rhs.boundingBox.midY
      if abs(verticalDifference) > 0.015 {
        return verticalDifference > 0
      }
      return lhs.boundingBox.minX < rhs.boundingBox.minX
    }

    var lines: [String] = []
    var seen = Set<String>()
    var byteCount = 0
    var truncated = false
    for observation in sorted {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !line.isEmpty, seen.insert(line).inserted else { continue }
      let lineBytes = line.lengthOfBytes(using: .utf8) + (lines.isEmpty ? 0 : 1)
      if lines.count >= 1_000 || byteCount + lineBytes > 50_000 {
        truncated = true
        break
      }
      lines.append(line)
      byteCount += lineBytes
    }

    let text = lines.joined(separator: "\n")
    return LocalOCRResult(
      text: text,
      lines: lines,
      language: languageHint(for: text),
      truncated: truncated,
      error: text.isEmpty ? "No readable text was found" : nil
    )
  }

  private static func languageHint(for text: String) -> String {
    var cjkCount = 0
    var latinCount = 0
    for scalar in text.unicodeScalars {
      switch scalar.value {
      case 0x3400...0x9FFF:
        cjkCount += 1
      case 0x0041...0x005A, 0x0061...0x007A:
        latinCount += 1
      default:
        break
      }
    }
    if cjkCount > 0, latinCount > 0 { return "mixed" }
    if cjkCount > 0 { return "zh" }
    if latinCount > 0 { return "en" }
    return "unknown"
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: NotchPanelController?
  private var hotKey: HotKeyCenter?
  private let parentMonitor = ParentProcessMonitor(arguments: CommandLine.arguments)

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)

    let controller = NotchPanelController()
    self.controller = controller
    controller.show()

    hotKey = HotKeyCenter {
      controller.toggleExpanded()
    }
    parentMonitor.start()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }
}

final class ParentProcessMonitor {
  private let parentPID: pid_t?
  private var timer: DispatchSourceTimer?

  init(arguments: [String]) {
    guard
      let flagIndex = arguments.firstIndex(of: "--parent-pid"),
      arguments.indices.contains(flagIndex + 1),
      let value = Int32(arguments[flagIndex + 1]),
      value > 0
    else {
      parentPID = nil
      return
    }
    parentPID = pid_t(value)
  }

  func start() {
    guard let parentPID else { return }
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 1, repeating: 1)
    timer.setEventHandler {
      if kill(parentPID, 0) == -1 && errno == ESRCH {
        NSApp.terminate(nil)
      }
    }
    self.timer = timer
    timer.resume()
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

final class PassthroughImageView: NSImageView {
  override func hitTest(_ point: NSPoint) -> NSView? {
    nil
  }
}

final class PassthroughContainerView: NSView {
  override func hitTest(_ point: NSPoint) -> NSView? {
    let hitView = super.hitTest(point)
    return hitView === self ? nil : hitView
  }
}

final class PassthroughStackView: NSStackView {
  override func hitTest(_ point: NSPoint) -> NSView? {
    let hitView = super.hitTest(point)
    return hitView === self ? nil : hitView
  }
}

private enum NotchTab: Int {
  case tinyBu = 0
  case tray = 1
}

final class NotchView: NSView {
  var onToggle: (() -> Void)?
  var onExpand: (() -> Void)?
  var onCollapse: (() -> Void)?

  private let island = BlackIslandView(frame: .zero)
  private let islandPetView = PassthroughImageView(frame: .zero)
  private let clipboardSaveButton = HoverHandlerButton(title: "Save?", target: nil, action: nil)
  private let topRow = PassthroughContainerView()
  private let leftCluster = PassthroughStackView()
  private let tabBar = NSStackView()
  private let tinyBuTabButton = HandlerButton(title: "TinyBu", target: nil, action: nil)
  private let trayTabButton = HandlerButton(title: "Tray", target: nil, action: nil)
  private let detailArea = NSView()
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
  private let countBadge = NSTextField(labelWithString: "0")
  private let voiceStatus = NSTextField(labelWithString: "Voice shortcut")
  private let dropStatus = NSTextField(labelWithString: "Drag text, images, or links here")
  private let tinyBuPanel = NSView()
  private let tinyBuPreviewImageView = NSImageView()
  private let askPageButton = HandlerButton(title: "Ask about this page", target: nil, action: nil)
  private let tinyBuStatusLabel = NSTextField(labelWithString: "")
  private let tinyBuAnswerLabel = NSTextField(wrappingLabelWithString: "")
  private let tinyBuQuestionContainer = NSView()
  private let tinyBuQuestionInput = NSTextField(string: "")
  private let tinyBuMicButton = HandlerButton(frame: .zero)
  private let tinyBuSendButton = HandlerButton(frame: .zero)
  private let tinyBuCloseButton = HandlerButton(title: "×", target: nil, action: nil)
  private let tinyBuBackButton = HandlerButton(title: "Back", target: nil, action: nil)
  private let tinyBuProgress = NSProgressIndicator()
  private let tinyBuOCRScrollView = NSScrollView()
  private let tinyBuOCRTextView = NSTextView()
  private let ipc = NotchIPC()
  private let speechInput = SpeechInputController()
  private let localOCR = LocalOCRController()
  private weak var trayBox: DashedTrayBox?
  private var capturedImages: [NSImage] = []
  private var capturedCaptureIDs: [String?] = []
  private var capturedOCRTexts: [String?] = []
  private var capturedSummaries: [String] = []
  private var capturedOCRTruncation: [Bool] = []
  private var capturedPreviewPaths: [String?] = []
  private var selectedImageIndex: Int?
  private var askWorkItem: DispatchWorkItem?
  private var activeCaptureJobID: String?
  private var activeQuestionJobID: String?
  private var activeClipboardJobID: String?
  private var activeTrayOCRJobID: String?
  private var pendingTrayOCRIndex: Int?
  private var pendingTrayOCRResult: LocalOCRResult?
  private var tinyBuCaptureID: String?
  private var tinyBuOCRText = ""
  private var tinyBuSummary = ""
  private var tinyBuOCRTruncated = false
  private var speechPrefix = ""
  private var expanded = false
  private var count = 0
  private var clipboardTimer: Timer?
  private var clipboardPromptGeneration = 0
  private var clipboardJobGeneration: Int?
  private var lastPasteboardChangeCount = NSPasteboard.general.changeCount
  private var pendingClipboardText = ""
  private var trayDeletionInProgress = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor
    registerForDraggedTypes([.fileURL, .string, .URL, .tiff, .png])
    buildView()
    configureIPCAndSpeech()
    startClipboardObservation()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    clipboardTimer?.invalidate()
  }

  func setExpanded(_ nextExpanded: Bool) {
    expanded = nextExpanded
    if !nextExpanded {
      askWorkItem?.cancel()
      selectedImageIndex = nil
      refreshTray()
    } else {
      hideClipboardPrompt()
    }
    detailArea.isHidden = !nextExpanded
    leftCluster.isHidden = nextExpanded
    tabBar.isHidden = !nextExpanded
    countBadge.isHidden = nextExpanded
    updateTitleState()
    if nextExpanded {
      selectTab(.tinyBu)
    }
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

    islandPetView.image = islandPetImage
    islandPetView.imageAlignment = .alignCenter
    islandPetView.imageScaling = .scaleProportionallyUpOrDown
    islandPetView.animates = false
    islandPetView.isHidden = islandPetImage == nil
    addSubview(islandPetView, positioned: .above, relativeTo: island)

    clipboardSaveButton.isBordered = false
    clipboardSaveButton.font = .systemFont(ofSize: 12, weight: .semibold)
    clipboardSaveButton.contentTintColor = .white
    clipboardSaveButton.wantsLayer = true
    clipboardSaveButton.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.14).cgColor
    clipboardSaveButton.layer?.cornerRadius = 12
    clipboardSaveButton.layer?.cornerCurve = .continuous
    clipboardSaveButton.toolTip = "Save copied text to TinyBu Inbox"
    clipboardSaveButton.setAccessibilityLabel("Save copied text")
    clipboardSaveButton.handler = { [weak self] in self?.savePendingClipboardText() }
    clipboardSaveButton.target = clipboardSaveButton
    clipboardSaveButton.action = #selector(HandlerButton.invoke)
    clipboardSaveButton.isHidden = true
    addSubview(clipboardSaveButton, positioned: .above, relativeTo: islandPetView)

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

    tabBar.orientation = .horizontal
    tabBar.alignment = .centerY
    tabBar.spacing = 8
    tabBar.translatesAutoresizingMaskIntoConstraints = true
    configureTabButton(tinyBuTabButton, title: "TinyBu", symbol: "sparkles", tab: .tinyBu)
    configureTabButton(trayTabButton, title: "Tray", symbol: "tray.fill", tab: .tray)
    tabBar.addArrangedSubview(tinyBuTabButton)
    tabBar.addArrangedSubview(trayTabButton)
    tabBar.isHidden = true
    topRow.addSubview(tabBar)

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
    countBadge.font = .systemFont(ofSize: 15, weight: .bold)
    countBadge.textColor = .white
    countBadge.alignment = .center
    countBadge.wantsLayer = false
    countBadge.isHidden = false
    countBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 12).isActive = true
    countBadge.heightAnchor.constraint(equalToConstant: 20).isActive = true

    leftCluster.addArrangedSubview(brandGroup)

    detailArea.translatesAutoresizingMaskIntoConstraints = true
    detailArea.wantsLayer = true
    detailArea.layer?.masksToBounds = true
    detailArea.isHidden = true
    island.addSubview(detailArea)

    detailArea.addSubview(buildTinyBuPanel())
    detailArea.addSubview(trayEmptyState())
    selectTab(.tinyBu)

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
    layoutIslandContent(expanded: nextExpanded, animated: true)
  }

  private func layoutIslandContent(expanded: Bool, animated: Bool = false) {
    let shapeRect = island.shapeRect(expanded: expanded)
    topRow.frame = NSRect(x: shapeRect.minX, y: shapeRect.maxY - (expanded ? 54 : 34), width: shapeRect.width, height: expanded ? 40 : 30)
    let detailInset = expanded ? 70.0 : 30.0
    detailArea.frame = NSRect(
      x: shapeRect.minX + detailInset,
      y: shapeRect.minY + 16,
      width: max(0, shapeRect.width - detailInset * 2),
      height: max(0, shapeRect.height - 70)
    )
    tinyBuPanel.frame = detailArea.bounds
    trayBox?.frame = detailArea.bounds
    let sideInset = expanded ? 70.0 : 30.0
    let clusterY = expanded ? 5.0 : 2.0
    let clusterHeight = expanded ? 30.0 : 26.0
    leftCluster.frame = NSRect(x: sideInset, y: clusterY, width: max(96, (shapeRect.width - notchReservedWidth) / 2 - 24), height: clusterHeight)
    tabBar.frame = NSRect(x: sideInset, y: clusterY, width: 176, height: clusterHeight)

    let petSize = expanded
      ? NSSize(width: 108, height: 48)
      : NSSize(width: 53, height: 24)
    let collapsedShapeRect = island.shapeRect(expanded: false)
    let promptShift: CGFloat = !expanded && !clipboardSaveButton.isHidden ? 72 : 0
    let petAnchorX = island.frame.minX + collapsedShapeRect.maxX - 30 - 53 - promptShift
    let petAnchorTop = island.frame.minY + collapsedShapeRect.maxY

    let petFrame = NSRect(
      x: petAnchorX,
      y: petAnchorTop - petSize.height,
      width: petSize.width,
      height: petSize.height
    )
    if animated {
      NSAnimationContext.runAnimationGroup { context in
        context.duration = 0.34
        context.timingFunction = CAMediaTimingFunction(controlPoints: 0.18, 0.84, 0.24, 1.0)
        islandPetView.animator().frame = petFrame
      }
    } else {
      islandPetView.frame = petFrame
    }
    clipboardSaveButton.frame = NSRect(
      x: petFrame.maxX + 4,
      y: petFrame.minY - 2,
      width: 68,
      height: 28
    )
  }

  @objc private func backToTrayFromTitle() {
    if !expanded {
      onToggle?()
      return
    }
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
    notchLog("TinyBuNotch drag entered: \(sender.draggingPasteboard.types?.map(\.rawValue) ?? [])")
    onExpand?()
    guard canReadImage(from: sender.draggingPasteboard) else {
      trayEmptyLabel.stringValue = "Drop an image"
      notchLog("TinyBuNotch drag rejected: no readable image")
      return []
    }
    trayEmptyLabel.stringValue = "Drop to collect"
    notchLog("TinyBuNotch drag accepted")
    return .copy
  }

  private func handleDraggingExited(_ sender: NSDraggingInfo?) {
    refreshTray()
  }

  private func handlePerformDrag(_ sender: NSDraggingInfo) -> Bool {
    let images = readImages(from: sender.draggingPasteboard)
    guard !images.isEmpty else {
      trayEmptyLabel.stringValue = "No image found"
      notchLog("TinyBuNotch drop failed: no image found")
      return false
    }

    capturedImages.append(contentsOf: images)
    capturedCaptureIDs.append(contentsOf: Array(repeating: nil, count: images.count))
    capturedOCRTexts.append(contentsOf: Array(repeating: nil, count: images.count))
    capturedSummaries.append(contentsOf: Array(repeating: "", count: images.count))
    capturedOCRTruncation.append(contentsOf: Array(repeating: false, count: images.count))
    capturedPreviewPaths.append(contentsOf: Array(repeating: nil, count: images.count))
    count = capturedImages.count
    countBadge.stringValue = String(count)
    selectedImageIndex = nil
    refreshTray()
    notchLog("TinyBuNotch drop stored images: \(images.count)")
    return true
  }

  private func flash(_ text: String) {
    trayEmptyLabel.stringValue = text
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
      guard let self else { return }
      self.trayEmptyLabel.stringValue = "No screenshots collected today"
    }
  }

  private func buildTinyBuPanel() -> NSView {
    tinyBuPanel.translatesAutoresizingMaskIntoConstraints = true

    tinyBuPreviewImageView.imageScaling = .scaleProportionallyUpOrDown
    tinyBuPreviewImageView.wantsLayer = true
    tinyBuPreviewImageView.layer?.cornerRadius = 8
    tinyBuPreviewImageView.layer?.cornerCurve = .continuous
    tinyBuPreviewImageView.layer?.masksToBounds = true
    tinyBuPreviewImageView.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuPreviewImageView)

    askPageButton.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Ask about this page")
    askPageButton.imagePosition = .imageLeading
    askPageButton.imageHugsTitle = true
    askPageButton.isBordered = false
    askPageButton.font = .systemFont(ofSize: 13, weight: .semibold)
    askPageButton.contentTintColor = NSColor.black.withAlphaComponent(0.86)
    askPageButton.wantsLayer = true
    askPageButton.layer?.backgroundColor = NSColor.systemYellow.cgColor
    askPageButton.layer?.cornerRadius = 14
    askPageButton.layer?.cornerCurve = .continuous
    askPageButton.handler = { [weak self] in self?.beginPageCapture() }
    askPageButton.target = askPageButton
    askPageButton.action = #selector(HandlerButton.invoke)
    askPageButton.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(askPageButton)

    tinyBuProgress.style = .bar
    tinyBuProgress.isIndeterminate = true
    tinyBuProgress.isDisplayedWhenStopped = false
    tinyBuProgress.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuProgress)

    tinyBuBackButton.isBordered = false
    tinyBuBackButton.image = NSImage(systemSymbolName: "chevron.left", accessibilityDescription: "Back to screenshot")
    tinyBuBackButton.imagePosition = .imageLeading
    tinyBuBackButton.imageHugsTitle = true
    tinyBuBackButton.font = .systemFont(ofSize: 12, weight: .semibold)
    tinyBuBackButton.contentTintColor = NSColor.white.withAlphaComponent(0.82)
    tinyBuBackButton.toolTip = "Back to screenshot"
    tinyBuBackButton.handler = { [weak self] in self?.showTinyBuQuestionState() }
    tinyBuBackButton.target = tinyBuBackButton
    tinyBuBackButton.action = #selector(HandlerButton.invoke)
    tinyBuBackButton.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuBackButton)

    tinyBuOCRScrollView.drawsBackground = false
    tinyBuOCRScrollView.borderType = .noBorder
    tinyBuOCRScrollView.hasVerticalScroller = true
    tinyBuOCRScrollView.autohidesScrollers = true
    tinyBuOCRScrollView.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuOCRScrollView)

    tinyBuOCRTextView.isEditable = false
    tinyBuOCRTextView.isSelectable = true
    tinyBuOCRTextView.drawsBackground = false
    tinyBuOCRTextView.textColor = NSColor.white.withAlphaComponent(0.9)
    tinyBuOCRTextView.font = .systemFont(ofSize: 12, weight: .regular)
    tinyBuOCRTextView.textContainerInset = NSSize(width: 4, height: 4)
    tinyBuOCRTextView.isVerticallyResizable = true
    tinyBuOCRTextView.isHorizontallyResizable = false
    tinyBuOCRTextView.autoresizingMask = [.width]
    tinyBuOCRTextView.textContainer?.widthTracksTextView = true
    tinyBuOCRTextView.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
    tinyBuOCRScrollView.documentView = tinyBuOCRTextView

    tinyBuCloseButton.isBordered = false
    tinyBuCloseButton.attributedTitle = NSAttributedString(
      string: "×",
      attributes: [
        .font: NSFont.systemFont(ofSize: 19, weight: .medium),
        .foregroundColor: NSColor.white.withAlphaComponent(0.72)
      ]
    )
    tinyBuCloseButton.toolTip = "Back to Ask about this page"
    tinyBuCloseButton.wantsLayer = true
    tinyBuCloseButton.layer?.zPosition = 10
    tinyBuCloseButton.handler = { [weak self] in self?.dismissTinyBuResult() }
    tinyBuCloseButton.target = tinyBuCloseButton
    tinyBuCloseButton.action = #selector(HandlerButton.invoke)
    tinyBuCloseButton.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuCloseButton)

    tinyBuStatusLabel.font = .systemFont(ofSize: 12, weight: .semibold)
    tinyBuStatusLabel.textColor = NSColor.white.withAlphaComponent(0.6)
    tinyBuStatusLabel.lineBreakMode = .byTruncatingTail
    tinyBuStatusLabel.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuStatusLabel)

    tinyBuAnswerLabel.font = .systemFont(ofSize: 12, weight: .medium)
    tinyBuAnswerLabel.textColor = NSColor.white.withAlphaComponent(0.88)
    tinyBuAnswerLabel.maximumNumberOfLines = 2
    tinyBuAnswerLabel.lineBreakMode = .byWordWrapping
    tinyBuAnswerLabel.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuAnswerLabel)

    tinyBuQuestionContainer.wantsLayer = true
    tinyBuQuestionContainer.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.09).cgColor
    tinyBuQuestionContainer.layer?.cornerRadius = 12
    tinyBuQuestionContainer.layer?.cornerCurve = .continuous
    tinyBuQuestionContainer.translatesAutoresizingMaskIntoConstraints = false
    tinyBuPanel.addSubview(tinyBuQuestionContainer)

    tinyBuQuestionInput.font = .systemFont(ofSize: 13, weight: .medium)
    tinyBuQuestionInput.textColor = .white
    tinyBuQuestionInput.placeholderString = "Ask about this page..."
    tinyBuQuestionInput.backgroundColor = .clear
    tinyBuQuestionInput.focusRingType = .none
    tinyBuQuestionInput.isBezeled = false
    tinyBuQuestionInput.target = self
    tinyBuQuestionInput.action = #selector(submitTinyBuQuestion)
    tinyBuQuestionInput.translatesAutoresizingMaskIntoConstraints = false
    tinyBuQuestionContainer.addSubview(tinyBuQuestionInput)

    tinyBuMicButton.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Dictate question")
    tinyBuMicButton.isBordered = false
    tinyBuMicButton.contentTintColor = NSColor.white.withAlphaComponent(0.72)
    tinyBuMicButton.toolTip = "Dictate question (F5 also uses macOS Dictation)"
    tinyBuMicButton.handler = { [weak self] in self?.toggleSpeechInput() }
    tinyBuMicButton.target = tinyBuMicButton
    tinyBuMicButton.action = #selector(HandlerButton.invoke)
    tinyBuMicButton.translatesAutoresizingMaskIntoConstraints = false
    tinyBuQuestionContainer.addSubview(tinyBuMicButton)

    tinyBuSendButton.image = NSImage(systemSymbolName: "paperplane.fill", accessibilityDescription: "Send")
    tinyBuSendButton.isBordered = false
    tinyBuSendButton.contentTintColor = NSColor.white.withAlphaComponent(0.72)
    tinyBuSendButton.handler = { [weak self] in self?.submitTinyBuQuestion() }
    tinyBuSendButton.target = tinyBuSendButton
    tinyBuSendButton.action = #selector(HandlerButton.invoke)
    tinyBuSendButton.translatesAutoresizingMaskIntoConstraints = false
    tinyBuQuestionContainer.addSubview(tinyBuSendButton)

    NSLayoutConstraint.activate([
      askPageButton.centerXAnchor.constraint(equalTo: tinyBuPanel.centerXAnchor),
      askPageButton.centerYAnchor.constraint(equalTo: tinyBuPanel.centerYAnchor),
      askPageButton.widthAnchor.constraint(equalToConstant: 178),
      askPageButton.heightAnchor.constraint(equalToConstant: 30),

      tinyBuPreviewImageView.leadingAnchor.constraint(equalTo: tinyBuPanel.leadingAnchor),
      tinyBuPreviewImageView.centerYAnchor.constraint(equalTo: tinyBuPanel.centerYAnchor),
      tinyBuPreviewImageView.widthAnchor.constraint(equalToConstant: 96),
      tinyBuPreviewImageView.heightAnchor.constraint(equalToConstant: 62),

      tinyBuProgress.leadingAnchor.constraint(equalTo: tinyBuPanel.leadingAnchor),
      tinyBuProgress.topAnchor.constraint(equalTo: tinyBuPanel.topAnchor, constant: 5),
      tinyBuProgress.widthAnchor.constraint(equalToConstant: 150),
      tinyBuProgress.heightAnchor.constraint(equalToConstant: 6),
      tinyBuCloseButton.trailingAnchor.constraint(equalTo: tinyBuPanel.trailingAnchor),
      tinyBuCloseButton.centerYAnchor.constraint(equalTo: tinyBuStatusLabel.centerYAnchor),
      tinyBuCloseButton.widthAnchor.constraint(equalToConstant: 24),
      tinyBuCloseButton.heightAnchor.constraint(equalToConstant: 24),
      tinyBuStatusLabel.leadingAnchor.constraint(equalTo: tinyBuProgress.trailingAnchor, constant: 7),
      tinyBuStatusLabel.trailingAnchor.constraint(equalTo: tinyBuCloseButton.leadingAnchor, constant: -6),
      tinyBuStatusLabel.centerYAnchor.constraint(equalTo: tinyBuProgress.centerYAnchor),

      tinyBuBackButton.leadingAnchor.constraint(equalTo: tinyBuPanel.leadingAnchor),
      tinyBuBackButton.topAnchor.constraint(equalTo: tinyBuPanel.topAnchor, constant: -4),
      tinyBuBackButton.widthAnchor.constraint(equalToConstant: 72),
      tinyBuBackButton.heightAnchor.constraint(equalToConstant: 24),

      tinyBuOCRScrollView.leadingAnchor.constraint(equalTo: tinyBuPanel.leadingAnchor),
      tinyBuOCRScrollView.trailingAnchor.constraint(equalTo: tinyBuPanel.trailingAnchor),
      tinyBuOCRScrollView.topAnchor.constraint(equalTo: tinyBuBackButton.bottomAnchor, constant: 1),
      tinyBuOCRScrollView.bottomAnchor.constraint(equalTo: tinyBuPanel.bottomAnchor),

      tinyBuAnswerLabel.leadingAnchor.constraint(equalTo: tinyBuPreviewImageView.trailingAnchor, constant: 14),
      tinyBuAnswerLabel.trailingAnchor.constraint(equalTo: tinyBuPanel.trailingAnchor),
      tinyBuAnswerLabel.topAnchor.constraint(equalTo: tinyBuStatusLabel.bottomAnchor, constant: 2),
      tinyBuAnswerLabel.heightAnchor.constraint(equalToConstant: 30),
      tinyBuAnswerLabel.bottomAnchor.constraint(lessThanOrEqualTo: tinyBuQuestionContainer.topAnchor, constant: -2),

      tinyBuQuestionContainer.leadingAnchor.constraint(equalTo: tinyBuPreviewImageView.trailingAnchor, constant: 14),
      tinyBuQuestionContainer.trailingAnchor.constraint(equalTo: tinyBuPanel.trailingAnchor),
      tinyBuQuestionContainer.bottomAnchor.constraint(equalTo: tinyBuPanel.bottomAnchor),
      tinyBuQuestionContainer.heightAnchor.constraint(equalToConstant: 31),
      tinyBuQuestionInput.leadingAnchor.constraint(equalTo: tinyBuQuestionContainer.leadingAnchor, constant: 10),
      tinyBuQuestionInput.trailingAnchor.constraint(equalTo: tinyBuMicButton.leadingAnchor, constant: -4),
      tinyBuQuestionInput.centerYAnchor.constraint(equalTo: tinyBuQuestionContainer.centerYAnchor),
      tinyBuMicButton.trailingAnchor.constraint(equalTo: tinyBuSendButton.leadingAnchor, constant: -2),
      tinyBuMicButton.centerYAnchor.constraint(equalTo: tinyBuQuestionContainer.centerYAnchor),
      tinyBuMicButton.widthAnchor.constraint(equalToConstant: 26),
      tinyBuMicButton.heightAnchor.constraint(equalToConstant: 26),
      tinyBuSendButton.trailingAnchor.constraint(equalTo: tinyBuQuestionContainer.trailingAnchor, constant: -3),
      tinyBuSendButton.centerYAnchor.constraint(equalTo: tinyBuQuestionContainer.centerYAnchor),
      tinyBuSendButton.widthAnchor.constraint(equalToConstant: 26),
      tinyBuSendButton.heightAnchor.constraint(equalToConstant: 26)
    ])

    showTinyBuInitialState()
    return tinyBuPanel
  }

  private func configureIPCAndSpeech() {
    ipc.onMessage = { [weak self] message in
      self?.handleIPCMessage(message)
    }
    speechInput.onText = { [weak self] transcription in
      guard let self else { return }
      let separator = self.speechPrefix.isEmpty || transcription.isEmpty ? "" : " "
      self.tinyBuQuestionInput.stringValue = self.speechPrefix + separator + transcription
    }
    speechInput.onRecordingChanged = { [weak self] recording in
      self?.tinyBuMicButton.contentTintColor = recording ? .systemRed : NSColor.white.withAlphaComponent(0.72)
      self?.tinyBuStatusLabel.stringValue = recording ? "Listening… click the mic to stop" : "Screenshot ready"
    }
    speechInput.onError = { [weak self] message in
      self?.tinyBuStatusLabel.stringValue = message
      self?.tinyBuMicButton.contentTintColor = NSColor.white.withAlphaComponent(0.72)
    }
  }

  private func configureTabButton(_ button: HandlerButton, title: String, symbol: String, tab: NotchTab) {
    button.title = title
    button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
    button.imagePosition = .imageLeading
    button.imageHugsTitle = true
    button.isBordered = false
    button.font = .systemFont(ofSize: 13, weight: .semibold)
    button.contentTintColor = .white
    button.wantsLayer = true
    button.layer?.cornerRadius = 12
    button.layer?.cornerCurve = .continuous
    button.widthAnchor.constraint(equalToConstant: tab == .tinyBu ? 88 : 68).isActive = true
    button.heightAnchor.constraint(equalToConstant: 26).isActive = true
    button.handler = { [weak self] in self?.selectTab(tab) }
    button.target = button
    button.action = #selector(HandlerButton.invoke)
  }

  private func selectTab(_ tab: NotchTab) {
    if tab == .tray, selectedImageIndex != nil {
      selectedImageIndex = nil
      refreshTray()
    }
    tinyBuPanel.isHidden = tab != .tinyBu
    trayBox?.isHidden = tab != .tray
    tinyBuTabButton.layer?.backgroundColor = tab == .tinyBu
      ? NSColor.white.withAlphaComponent(0.18).cgColor
      : NSColor.clear.cgColor
    trayTabButton.layer?.backgroundColor = tab == .tray
      ? NSColor.white.withAlphaComponent(0.18).cgColor
      : NSColor.clear.cgColor
  }

  private func showTinyBuInitialState() {
    askPageButton.isHidden = false
    tinyBuPreviewImageView.isHidden = true
    tinyBuPreviewImageView.image = nil
    tinyBuProgress.stopAnimation(nil)
    tinyBuProgress.isHidden = true
    tinyBuStatusLabel.isHidden = true
    tinyBuAnswerLabel.isHidden = true
    tinyBuQuestionContainer.isHidden = true
    tinyBuCloseButton.isHidden = true
    tinyBuBackButton.isHidden = true
    tinyBuOCRScrollView.isHidden = true
  }

  private func showTinyBuOCRState() {
    askPageButton.isHidden = true
    tinyBuPreviewImageView.isHidden = true
    tinyBuProgress.stopAnimation(nil)
    tinyBuProgress.isHidden = true
    tinyBuStatusLabel.isHidden = true
    tinyBuAnswerLabel.isHidden = true
    tinyBuQuestionContainer.isHidden = true
    tinyBuBackButton.isHidden = false
    tinyBuCloseButton.isHidden = false
    tinyBuOCRTextView.string = tinyBuOCRText.isEmpty ? "No readable text was found in this screenshot." : tinyBuOCRText
    if tinyBuOCRTruncated {
      tinyBuOCRTextView.string += "\n\n— OCR text was shortened to keep TinyBu responsive. —"
    }
    tinyBuOCRScrollView.isHidden = false
    tinyBuOCRTextView.scrollToBeginningOfDocument(nil)
    selectTab(.tinyBu)
    onExpand?()
  }

  private func showTinyBuQuestionState() {
    guard tinyBuCaptureID != nil else { return }
    askPageButton.isHidden = true
    tinyBuBackButton.isHidden = true
    tinyBuOCRScrollView.isHidden = true
    tinyBuProgress.stopAnimation(nil)
    tinyBuProgress.isHidden = true
    tinyBuPreviewImageView.isHidden = tinyBuPreviewImageView.image == nil
    tinyBuStatusLabel.stringValue = "Screenshot ready"
    tinyBuStatusLabel.isHidden = false
    tinyBuAnswerLabel.stringValue = tinyBuSummary
    tinyBuAnswerLabel.isHidden = tinyBuSummary.isEmpty
    tinyBuQuestionContainer.isHidden = false
    tinyBuCloseButton.isHidden = false
    tinyBuSendButton.isEnabled = true
    selectTab(.tinyBu)
    onExpand?()
    window?.makeFirstResponder(tinyBuQuestionInput)
  }

  private func dismissTinyBuResult() {
    speechInput.stop()
    localOCR.cancel()
    if let activeQuestionJobID {
      ipc.send(type: "cancelJob", fields: ["jobId": activeQuestionJobID])
    }
    if let activeTrayOCRJobID {
      ipc.send(type: "cancelJob", fields: ["jobId": activeTrayOCRJobID])
    }
    activeQuestionJobID = nil
    activeTrayOCRJobID = nil
    pendingTrayOCRIndex = nil
    pendingTrayOCRResult = nil
    tinyBuCaptureID = nil
    tinyBuOCRText = ""
    tinyBuSummary = ""
    tinyBuOCRTruncated = false
    selectedImageIndex = nil
    refreshTray()
    tinyBuQuestionInput.stringValue = ""
    tinyBuSendButton.isEnabled = true
    showTinyBuInitialState()
  }

  private func beginPageCapture() {
    speechInput.stop()
    localOCR.cancel()
    showLoadingPet()
    if let activeCaptureJobID {
      ipc.send(type: "cancelJob", fields: ["jobId": activeCaptureJobID])
    }
    let jobID = UUID().uuidString
    activeCaptureJobID = jobID
    tinyBuCaptureID = nil
    askPageButton.isHidden = true
    tinyBuCloseButton.isHidden = true
    tinyBuBackButton.isHidden = true
    tinyBuOCRScrollView.isHidden = true
    tinyBuPreviewImageView.isHidden = true
    tinyBuPreviewImageView.image = nil
    tinyBuAnswerLabel.isHidden = true
    tinyBuQuestionContainer.isHidden = true
    tinyBuStatusLabel.stringValue = "Preparing screenshot…"
    tinyBuStatusLabel.isHidden = false
    tinyBuProgress.isHidden = false
    tinyBuProgress.startAnimation(nil)
    onCollapse?()

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.42) { [weak self] in
      guard let self, self.activeCaptureJobID == jobID else { return }
      let key = NSDeviceDescriptionKey("NSScreenNumber")
      let displayID = (self.window?.screen?.deviceDescription[key] as? NSNumber)?.uint32Value ?? CGMainDisplayID()
      self.ipc.send(type: "captureCurrentDisplay", fields: ["jobId": jobID, "displayId": displayID])
    }
  }

  private func showCapturedPreview(_ image: NSImage) {
    if tinyBuPreviewImageView.image == nil {
      capturedImages.append(image)
      capturedCaptureIDs.append(nil)
      capturedOCRTexts.append(nil)
      capturedSummaries.append("")
      capturedOCRTruncation.append(false)
      capturedPreviewPaths.append(nil)
      count = capturedImages.count
      countBadge.stringValue = String(count)
      refreshTray()
    }
    tinyBuPreviewImageView.image = image
    tinyBuPreviewImageView.isHidden = false
  }

  private func startLocalOCR(at path: String, jobID: String) {
    localOCR.recognize(
      imageAt: path,
      jobID: jobID,
      onPreview: { [weak self] image in
        guard let self, self.activeCaptureJobID == jobID else { return }
        self.showCapturedPreview(image)
      },
      completion: { [weak self] result in
        guard let self, self.activeCaptureJobID == jobID else { return }
        var fields: [String: Any] = [
          "jobId": jobID,
          "text": result.text,
          "lines": result.lines,
          "language": result.language,
          "truncated": result.truncated
        ]
        if let error = result.error {
          fields["error"] = error
        }
        self.tinyBuStatusLabel.stringValue = result.error == nil ? "Saving to Tray…" : "Saving screenshot…"
        self.ipc.send(type: "ocrCompleted", fields: fields)
      }
    )
  }

  private func showLoadingPet() {
    guard let islandPetLoadingImage else { return }
    islandPetView.image = islandPetLoadingImage
    islandPetView.animates = true
  }

  private func showStaticPet() {
    islandPetView.animates = false
    islandPetView.image = islandPetImage
  }

  private func startClipboardObservation() {
    let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
      self?.checkPasteboardForCopiedText()
    }
    clipboardTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func checkPasteboardForCopiedText() {
    let pasteboard = NSPasteboard.general
    let changeCount = pasteboard.changeCount
    guard changeCount != lastPasteboardChangeCount else { return }
    lastPasteboardChangeCount = changeCount
    guard let text = pasteboard.string(forType: .string), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return
    }
    notchLog("TinyBuNotch detected copied text")
    if expanded {
      onCollapse?()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { [weak self] in
        self?.showClipboardPrompt(text)
      }
    } else {
      showClipboardPrompt(text)
    }
  }

  private func showClipboardPrompt(_ text: String) {
    clipboardPromptGeneration += 1
    pendingClipboardText = text
    clipboardSaveButton.title = "Save?"
    clipboardSaveButton.isEnabled = true
    clipboardSaveButton.isHidden = false
    layoutIslandContent(expanded: false, animated: true)
    let generation = clipboardPromptGeneration
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
      guard let self, self.clipboardPromptGeneration == generation, self.activeClipboardJobID == nil else { return }
      self.hideClipboardPrompt()
    }
  }

  private func hideClipboardPrompt() {
    clipboardPromptGeneration += 1
    pendingClipboardText = ""
    clipboardSaveButton.isHidden = true
    clipboardSaveButton.isEnabled = true
    clipboardSaveButton.title = "Save?"
    layoutIslandContent(expanded: expanded, animated: true)
  }

  private func savePendingClipboardText() {
    let text = pendingClipboardText
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, activeClipboardJobID == nil else { return }
    let jobID = UUID().uuidString
    activeClipboardJobID = jobID
    clipboardJobGeneration = clipboardPromptGeneration
    clipboardSaveButton.title = "Saving…"
    clipboardSaveButton.isEnabled = false
    ipc.send(type: "saveClipboard", fields: ["jobId": jobID, "text": text])
  }

  private func applyTraySnapshot(_ message: [String: Any]) {
    guard let records = message["records"] as? [[String: Any]] else { return }
    var images: [NSImage] = []
    var captureIDs: [String?] = []
    var ocrTexts: [String?] = []
    var summaries: [String] = []
    var truncation: [Bool] = []
    var previewPaths: [String?] = []
    for record in records {
      guard
        let captureID = record["captureId"] as? String,
        let previewPath = record["previewPath"] as? String,
        let image = NSImage(contentsOfFile: previewPath)
      else { continue }
      images.append(image)
      captureIDs.append(captureID)
      let text = record["ocrText"] as? String ?? ""
      ocrTexts.append(text.isEmpty ? nil : text)
      summaries.append(record["summary"] as? String ?? "")
      truncation.append(record["ocrTruncated"] as? Bool ?? false)
      previewPaths.append(previewPath)
    }
    capturedImages = images
    capturedCaptureIDs = captureIDs
    capturedOCRTexts = ocrTexts
    capturedSummaries = summaries
    capturedOCRTruncation = truncation
    capturedPreviewPaths = previewPaths
    count = images.count
    countBadge.stringValue = String(count)
    if let selectedImageIndex, !images.indices.contains(selectedImageIndex) {
      self.selectedImageIndex = nil
    }
    refreshTray()
  }

  private func handleIPCMessage(_ message: [String: Any]) {
    guard let type = message["type"] as? String else { return }
    if type == "traySnapshot" {
      applyTraySnapshot(message)
      return
    }
    guard let jobID = message["jobId"] as? String else { return }
    switch type {
    case "captureStarted":
      guard jobID == activeCaptureJobID else { return }
      tinyBuStatusLabel.stringValue = "Reading this page…"
    case "screenshotCaptured":
      guard jobID == activeCaptureJobID else { return }
      if let previewPath = message["previewPath"] as? String {
        startLocalOCR(at: previewPath, jobID: jobID)
      }
      tinyBuStatusLabel.stringValue = "Reading this page…"
      tinyBuStatusLabel.isHidden = false
      tinyBuProgress.isHidden = false
      tinyBuProgress.startAnimation(nil)
      tinyBuAnswerLabel.isHidden = true
      tinyBuQuestionContainer.isHidden = true
      selectTab(.tinyBu)
      onExpand?()
    case "screenshotReady":
      guard jobID == activeCaptureJobID, let captureID = message["captureId"] as? String else { return }
      showStaticPet()
      activeCaptureJobID = nil
      tinyBuCaptureID = captureID
      tinyBuOCRText = message["ocrText"] as? String ?? ""
      tinyBuSummary = message["summary"] as? String ?? ""
      tinyBuOCRTruncated = message["ocrTruncated"] as? Bool ?? false
      localOCR.cancel()
      showTinyBuOCRState()
    case "answerReady":
      guard jobID == activeQuestionJobID else { return }
      activeQuestionJobID = nil
      tinyBuProgress.stopAnimation(nil)
      tinyBuProgress.isHidden = true
      tinyBuStatusLabel.stringValue = "TinyBu"
      tinyBuAnswerLabel.stringValue = message["answer"] as? String ?? ""
      tinyBuAnswerLabel.isHidden = false
      tinyBuQuestionContainer.isHidden = false
      tinyBuBackButton.isHidden = true
      tinyBuOCRScrollView.isHidden = true
      tinyBuCloseButton.isHidden = false
      tinyBuSendButton.isEnabled = true
      window?.makeFirstResponder(tinyBuQuestionInput)
    case "clipboardSaved":
      guard jobID == activeClipboardJobID else { return }
      activeClipboardJobID = nil
      clipboardSaveButton.isEnabled = true
      guard clipboardJobGeneration == clipboardPromptGeneration else {
        clipboardSaveButton.title = "Save?"
        return
      }
      clipboardSaveButton.title = "Saved ✓"
      let generation = clipboardPromptGeneration
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
        guard let self, self.clipboardPromptGeneration == generation else { return }
        self.hideClipboardPrompt()
      }
    case "trayOcrSaved":
      guard
        jobID == activeTrayOCRJobID,
        let index = pendingTrayOCRIndex,
        capturedImages.indices.contains(index),
        let result = pendingTrayOCRResult
      else { return }
      activeTrayOCRJobID = nil
      pendingTrayOCRIndex = nil
      pendingTrayOCRResult = nil
      capturedOCRTexts[index] = result.text.isEmpty ? nil : result.text
      capturedSummaries[index] = result.text.replacingOccurrences(of: "\n", with: " ").prefix(160).description
      capturedOCRTruncation[index] = result.truncated
      tinyBuCaptureID = capturedCaptureIDs[index]
      tinyBuPreviewImageView.image = capturedImages[index]
      tinyBuOCRText = result.text
      tinyBuSummary = capturedSummaries[index]
      tinyBuOCRTruncated = result.truncated
      showStaticPet()
      showTinyBuOCRState()
    case "failed":
      if jobID == activeClipboardJobID {
        activeClipboardJobID = nil
        clipboardSaveButton.title = "Try again"
        clipboardSaveButton.isEnabled = true
        return
      }
      guard jobID == activeCaptureJobID || jobID == activeQuestionJobID || jobID == activeTrayOCRJobID else { return }
      localOCR.cancel()
      showStaticPet()
      if jobID == activeCaptureJobID { activeCaptureJobID = nil }
      if jobID == activeQuestionJobID { activeQuestionJobID = nil }
      if jobID == activeTrayOCRJobID {
        activeTrayOCRJobID = nil
        pendingTrayOCRIndex = nil
        pendingTrayOCRResult = nil
      }
      tinyBuProgress.stopAnimation(nil)
      tinyBuProgress.isHidden = true
      tinyBuStatusLabel.stringValue = "Couldn’t complete that"
      tinyBuStatusLabel.isHidden = false
      tinyBuAnswerLabel.stringValue = message["message"] as? String ?? "Please try again."
      tinyBuAnswerLabel.isHidden = false
      tinyBuQuestionContainer.isHidden = tinyBuCaptureID == nil
      tinyBuCloseButton.isHidden = false
      tinyBuSendButton.isEnabled = true
      selectTab(.tinyBu)
      onExpand?()
    default:
      break
    }
  }

  @objc private func submitTinyBuQuestion() {
    let question = tinyBuQuestionInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !question.isEmpty, let captureID = tinyBuCaptureID, activeQuestionJobID == nil else { return }
    speechInput.stop()
    let jobID = UUID().uuidString
    activeQuestionJobID = jobID
    tinyBuProgress.isHidden = false
    tinyBuProgress.startAnimation(nil)
    tinyBuStatusLabel.stringValue = "TinyBu is thinking…"
    tinyBuStatusLabel.isHidden = false
    tinyBuAnswerLabel.isHidden = true
    tinyBuSendButton.isEnabled = false
    ipc.send(
      type: "askScreenshot",
      fields: ["jobId": jobID, "captureId": captureID, "question": question]
    )
  }

  private func toggleSpeechInput() {
    guard tinyBuCaptureID != nil else { return }
    if !speechInput.isRecording {
      speechPrefix = tinyBuQuestionInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    speechInput.toggle()
  }

  private func trayEmptyState() -> NSView {
    let box = DashedTrayBox(frame: NSRect(x: 0, y: 0, width: 1, height: 84))
    box.translatesAutoresizingMaskIntoConstraints = true
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
    let card = HoverThumbnailView(frame: .zero)
    card.translatesAutoresizingMaskIntoConstraints = false
    let button = HandlerButton(image: image, target: nil, action: nil)
    button.isBordered = false
    button.imagePosition = .imageOnly
    button.imageScaling = .scaleProportionallyUpOrDown
    button.toolTip = "Preview image"
    button.wantsLayer = true
    button.layer?.cornerRadius = 6
    button.layer?.cornerCurve = .continuous
    button.layer?.masksToBounds = true
    button.frame = NSRect(x: 0, y: 0, width: 78, height: 58)
    button.autoresizingMask = [.width, .height]
    button.handler = { [weak self] in
      self?.selectImage(at: index)
    }
    button.target = button
    button.action = #selector(HandlerButton.invoke)
    card.addSubview(button)

    let deleteButton = HandlerButton(title: "×", target: nil, action: nil)
    deleteButton.isBordered = false
    deleteButton.font = .systemFont(ofSize: 13, weight: .bold)
    deleteButton.contentTintColor = .white
    deleteButton.wantsLayer = true
    deleteButton.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.72).cgColor
    deleteButton.layer?.cornerRadius = 9
    deleteButton.toolTip = "Delete screenshot"
    deleteButton.setAccessibilityLabel("Delete screenshot")
    deleteButton.handler = { [weak self] in self?.deleteImage(at: index) }
    deleteButton.target = deleteButton
    deleteButton.action = #selector(HandlerButton.invoke)
    deleteButton.frame = NSRect(x: 56, y: 38, width: 22, height: 22)
    card.addSubview(deleteButton)
    card.hoverControl = deleteButton
    NSLayoutConstraint.activate([
      card.widthAnchor.constraint(equalToConstant: 78),
      card.heightAnchor.constraint(equalToConstant: 58)
    ])
    return card
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
    if let captureID = capturedCaptureIDs[index] {
      tinyBuCaptureID = captureID
      tinyBuPreviewImageView.image = capturedImages[index]
      tinyBuSummary = capturedSummaries[index]
      tinyBuOCRTruncated = capturedOCRTruncation[index]
      if let text = capturedOCRTexts[index], !text.isEmpty {
        tinyBuOCRText = text
        showTinyBuOCRState()
        return
      }
      if let previewPath = capturedPreviewPaths[index] {
        startTrayOCR(at: previewPath, index: index, captureID: captureID)
        return
      }
    }
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
    deleteImage(at: selectedImageIndex)
  }

  private func deleteImage(at index: Int) {
    guard capturedImages.indices.contains(index), !trayDeletionInProgress else { return }
    trayDeletionInProgress = true
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.1
      thumbnailStrip.animator().alphaValue = 0
    } completionHandler: { [weak self] in
      self?.finishDeletingImage(at: index)
    }
  }

  private func finishDeletingImage(at index: Int) {
    guard capturedImages.indices.contains(index) else {
      trayDeletionInProgress = false
      thumbnailStrip.alphaValue = 1
      return
    }
    let captureID = capturedCaptureIDs[index]
    capturedImages.remove(at: index)
    capturedCaptureIDs.remove(at: index)
    capturedOCRTexts.remove(at: index)
    capturedSummaries.remove(at: index)
    capturedOCRTruncation.remove(at: index)
    capturedPreviewPaths.remove(at: index)
    selectedImageIndex = nil
    count = capturedImages.count
    countBadge.stringValue = String(count)
    refreshTray()
    thumbnailStrip.alphaValue = 0
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.14
      thumbnailStrip.animator().alphaValue = 1
    } completionHandler: { [weak self] in
      self?.trayDeletionInProgress = false
    }
    if let captureID {
      ipc.send(type: "deleteTrayCapture", fields: ["captureId": captureID])
    }
  }

  private func startTrayOCR(at path: String, index: Int, captureID: String) {
    guard activeTrayOCRJobID == nil else { return }
    let jobID = UUID().uuidString
    activeTrayOCRJobID = jobID
    pendingTrayOCRIndex = index
    pendingTrayOCRResult = nil
    showLoadingPet()
    askPageButton.isHidden = true
    tinyBuBackButton.isHidden = true
    tinyBuOCRScrollView.isHidden = true
    tinyBuPreviewImageView.isHidden = true
    tinyBuAnswerLabel.isHidden = true
    tinyBuQuestionContainer.isHidden = true
    tinyBuCloseButton.isHidden = false
    tinyBuStatusLabel.stringValue = "Reading this screenshot…"
    tinyBuStatusLabel.isHidden = false
    tinyBuProgress.isHidden = false
    tinyBuProgress.startAnimation(nil)
    selectTab(.tinyBu)
    localOCR.recognize(
      imageAt: path,
      jobID: jobID,
      onPreview: { _ in },
      completion: { [weak self] result in
        guard let self, self.activeTrayOCRJobID == jobID else { return }
        self.pendingTrayOCRResult = result
        var fields: [String: Any] = [
          "jobId": jobID,
          "captureId": captureID,
          "text": result.text,
          "lines": result.lines,
          "language": result.language,
          "truncated": result.truncated
        ]
        if let error = result.error { fields["error"] = error }
        self.tinyBuStatusLabel.stringValue = "Saving to Tray…"
        self.ipc.send(type: "trayOcrCompleted", fields: fields)
      }
    )
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

  private func containsInteractionShape(_ point: NSPoint) -> Bool {
    if !expanded {
      return shapeRect(expanded: false).insetBy(dx: -8, dy: -8).contains(point)
    }
    return containsVisibleShape(point)
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    guard let hitView = super.hitTest(point) else { return nil }
    guard hitView === self else { return hitView }

    return containsInteractionShape(point) ? self : nil
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

class HandlerButton: NSButton {
  var handler: (() -> Void)?

  @objc func invoke() {
    handler?()
  }
}

final class HoverHandlerButton: HandlerButton {
  private var trackingAreaReference: NSTrackingArea?

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let trackingAreaReference {
      removeTrackingArea(trackingAreaReference)
    }
    let trackingArea = NSTrackingArea(
      rect: bounds,
      options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(trackingArea)
    trackingAreaReference = trackingArea
  }

  override func mouseEntered(with event: NSEvent) {
    layer?.backgroundColor = NSColor.white.withAlphaComponent(0.24).cgColor
  }

  override func mouseExited(with event: NSEvent) {
    layer?.backgroundColor = NSColor.white.withAlphaComponent(0.14).cgColor
  }
}

final class HoverThumbnailView: NSView {
  weak var hoverControl: NSView? {
    didSet { hoverControl?.isHidden = true }
  }
  private var trackingAreaReference: NSTrackingArea?

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let trackingAreaReference {
      removeTrackingArea(trackingAreaReference)
    }
    let trackingArea = NSTrackingArea(
      rect: bounds,
      options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(trackingArea)
    trackingAreaReference = trackingArea
  }

  override func mouseEntered(with event: NSEvent) {
    hoverControl?.isHidden = false
  }

  override func mouseExited(with event: NSEvent) {
    let localPoint = convert(event.locationInWindow, from: nil)
    if !bounds.contains(localPoint) {
      hoverControl?.isHidden = true
    }
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
