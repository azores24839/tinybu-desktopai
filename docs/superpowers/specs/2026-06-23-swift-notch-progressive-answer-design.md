# Swift Notch Progressive Answer Design

## Goal

Make TinyBu's native macOS notch reveal AI answers progressively while growing only as much as the currently visible answer requires.

## Scope

- Apply the behavior to the native AppKit TinyBu Ask flow in `native/notch-prototype`.
- Keep the expanded notch width fixed at 620 points.
- Keep the notch's top edge anchored to the top of the screen. Height changes move only the bottom edge downward or upward.
- Keep the existing AI request and IPC response contract unchanged.

## Interaction

When an `answerReady` message arrives, the client stores the complete answer but initially clears the visible answer. A main-thread timer reveals the answer character by character.

The notch begins at its existing 154-point expanded height. As revealed text wraps onto additional lines, the client measures the visible text and smoothly increases the island, content view, and panel height. It does not reserve space for unrevealed text, so short answers do not create empty space.

The expanded notch may grow to at most 308 points, twice its current expanded height. At that limit, the answer area becomes internally scrollable and follows the latest revealed text automatically.

Starting another question, dismissing the result, changing away from the answer state, or collapsing the notch cancels the active reveal timer. Returning to the normal expanded state restores the 154-point height.

## Implementation

- Replace the fixed two-line answer label with a non-editable, transparent text view inside a scroll view.
- Add a small answer presentation state to `NotchView`: the full answer, current revealed position, and reveal timer.
- Measure the text view's layout height at its fixed content width after each reveal update. Only trigger a notch resize when the required height changes materially.
- Extend `NotchView` and `BlackIslandView` layout calculations to accept a dynamic expanded height while preserving the existing 620-point width and top alignment.
- Notify `NotchPanelController` when the desired panel height changes. Reframe the panel with the same `maxY`, ensuring growth is downward from the screen top.
- Animate discrete height changes with the existing AppKit/Core Animation timing style. Character updates remain lightweight and run only on the main thread.

## Overflow

Before the maximum notch height, the answer viewport expands with its content and does not scroll. At the maximum height, the viewport remains fixed and automatically scrolls to the end as each new character appears. The user can scroll the completed answer normally after the reveal finishes.

## State and Failure Handling

- An empty answer displays no animated content and leaves the notch at its base height.
- A new answer always cancels and replaces any prior reveal operation.
- Cancellation clears retained answer state and invalidates the timer to prevent updates after the UI changes state.
- Existing loading, OCR, question input, close, and tab behavior remains unchanged.

## Verification

- Build the Swift package successfully.
- Verify a short answer reveals progressively without increasing the base height unnecessarily.
- Verify a medium answer grows the notch downward in steps as lines appear.
- Verify a long answer stops at 308 points, scrolls internally, and follows the latest revealed character.
- Verify the notch width remains 620 points throughout.
- Verify dismissing, collapsing, or asking again cancels the previous reveal and restores the base expanded height.
