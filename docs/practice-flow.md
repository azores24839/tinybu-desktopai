# Practice Flow

TinyBu has one shared Practice Chat flow with two entry paths:

`Practice Task -> Practice Chat -> Practice Review -> Memory`

`Topic -> Practice Chat -> Practice Review -> Topic History / Memory`

## Rules

- `Start Practice` from a Topic always starts Practice Chat.
- `Start Practice` from a Practice Task also starts Practice Chat without requiring a Topic.
- Topic Practice needs at least one Capture in the Topic.
- Empty Topics are allowed, but they cannot start practice until a Capture is added.
- Practice completion writes a `PracticeChatReview`.
- Topic Practice completion updates the Topic to `practiced` and sets `lastPracticedAt`.
- Topic Practice completion marks the Topic's current Captures as `practiced`.
- Task Practice completion writes a lightweight Memory item that can seed future tasks.
- Topic history reads from `practiceChatReviews`.
- Practice Tasks are entry cards, not a second practice session model.

## Implementation Map

- Flow hook: `src/features/practice/usePracticeChat.ts`
- Practice helpers: `src/features/practice/practiceUtils.ts`
- Practice task builders: `src/features/practice/practiceTasks.ts`
- Chat page: `src/features/practice/PracticeChatPage.tsx`
- Review page: `src/features/practice/PracticeReviewPage.tsx`
- Topic history: `src/features/topics/TopicDetailPage.tsx`
- Database table: `practiceChatReviews`

Do not add a second practice session model. If the practice experience changes, evolve Practice Chat and `PracticeChatReview` instead.
