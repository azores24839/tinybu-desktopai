# Practice Flow

TinyBu has one Topic practice flow:

`Topic -> Practice Chat -> Practice Review -> Topic History`

## Rules

- `Start Practice` always starts Practice Chat.
- Practice Chat needs at least one Capture in the Topic.
- Empty Topics are allowed, but they cannot start practice until a Capture is added.
- Practice completion writes a `PracticeChatReview`.
- Practice completion updates the Topic to `practiced` and sets `lastPracticedAt`.
- Practice completion marks the Topic's current Captures as `practiced`.
- Topic history reads from `practiceChatReviews`.

## Implementation Map

- Flow hook: `src/features/practice/usePracticeChat.ts`
- Practice helpers: `src/features/practice/practiceUtils.ts`
- Chat page: `src/features/practice/PracticeChatPage.tsx`
- Review page: `src/features/practice/PracticeReviewPage.tsx`
- Topic history: `src/features/topics/TopicDetailPage.tsx`
- Database table: `practiceChatReviews`

Do not add a second Topic practice session model. If the practice experience changes, evolve Practice Chat and `PracticeChatReview` instead.
