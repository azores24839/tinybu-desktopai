# Unwind Demo Practice Design

## Goal

Replace the default TinyBu material task with a demo practice called `My Favorite Ways to Unwind`.

## Behavior

- The home practice card uses the unwind demo title and notes that it is a demo.
- The source text is a short model answer about quiet, low-effort stress relief routines.
- The starter question opens naturally with stress relief.
- The full scripted mock conversation is not hardcoded into captions.
- The practice hint panel shows only a few useful words and chunks at a time.
- A refresh button rotates through more hints from the same local hint pool without calling AI.

## Implementation

- Update `src/features/practice/practiceTasks.ts` to replace `task-tinybu-material-default`.
- Update `src/ai/rules.ts` with a specialized local practice plan for the unwind demo.
- Update `src/features/practice/PracticeChatPage.tsx` so the hints panel can rotate visible words and chunks.
- Update `src/styles.css` for the refresh control.

## Testing

- Run type checking or build.
- Start the local app and verify the practice card, hints panel, and refresh behavior in browser.
