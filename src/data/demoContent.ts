import type { CaptureItem, ContentItem } from "../types";

export const demoContents: ContentItem[] = [
  {
    id: "demo-productivity",
    title: "Productivity is not about doing more",
    topic: "Productivity and Learning",
    sourceType: "demo",
    summary:
      "The speaker says productivity is not only about doing more tasks. It is about choosing meaningful work and making space to think.",
    keywords: ["productivity", "doing more", "what matters", "meaningful", "focus"],
    questions: [
      "What was the video mainly about?",
      "Can you summarize one idea from the video in your own words?",
      "Do you agree with the speaker? Why?",
      "Can you connect this idea to your own life?",
      "Can you use “I used to think…, but now I think…” to talk about learning a language?"
    ],
    transcript: [
      {
        id: "p1",
        text: "I used to think productivity was about doing more, but now I think it is about doing what matters.",
        note: "Key pattern for changing an old idea into a new idea."
      },
      {
        id: "p2",
        text: "When I was busy all day, I felt successful, but I was not always learning."
      },
      {
        id: "p3",
        text: "Real progress often comes from choosing one important thing and giving it your full attention."
      },
      {
        id: "p4",
        text: "For language learning, this means using words in your own life, not only memorizing long lists."
      },
      {
        id: "p5",
        text: "A small honest sentence can be more useful than a perfect sentence you never say."
      }
    ]
  },
  {
    id: "demo-language",
    title: "Learning English is not just memorizing words",
    topic: "Language Learning",
    sourceType: "demo",
    summary:
      "The speaker explains that language learning becomes useful when learners connect words to real communication and personal stories.",
    keywords: ["memorizing", "communication", "personal story", "confidence", "practice"],
    questions: [
      "What is the main idea of this short text?",
      "What part feels true for you?",
      "Can you share one example from your own English learning?",
      "What is one sentence you want to say more naturally?"
    ],
    transcript: [
      {
        id: "l1",
        text: "Learning English is not just about memorizing words. It is about communication."
      },
      {
        id: "l2",
        text: "When you connect a new phrase to your own life, it becomes easier to remember."
      },
      {
        id: "l3",
        text: "You do not need to sound perfect before you start speaking."
      },
      {
        id: "l4",
        text: "You can begin with one clear idea, then add more details slowly."
      }
    ]
  },
  {
    id: "demo-travel",
    title: "A quiet morning in a new city",
    topic: "Travel and Daily Life",
    sourceType: "demo",
    summary:
      "A traveler describes arriving in a new city, noticing small details, and feeling less nervous after talking to local people.",
    keywords: ["new city", "notice", "nervous", "local people", "small detail"],
    questions: [
      "What did the traveler notice first?",
      "Have you ever felt nervous in a new place?",
      "What small detail helps you remember a place?",
      "Can you describe a city you like in two simple sentences?"
    ],
    transcript: [
      {
        id: "t1",
        text: "When I arrived in the city, I noticed the sound of bicycles before I noticed the buildings."
      },
      {
        id: "t2",
        text: "At first I felt nervous, but a short conversation at a cafe helped me relax."
      },
      {
        id: "t3",
        text: "Sometimes a place becomes memorable because of one small detail."
      }
    ]
  }
];

export const demoReviewCaptures: CaptureItem[] = [
  {
    id: "review-001",
    title: "Screenshot Capture",
    sourceUrl: "",
    sourceKind: "screenshot",
    sourceText: "",
    extractedText: "",
    originalImageUrl: "/assets/screenshot-healthcare.png",
    notice: "Text recognition is currently off. You can retry recognition, type the text manually, or move this capture to Unsorted.",
    issueType: "ocr_off",
    status: "needs_review",
    capturedAt: new Date(new Date().setHours(9, 21, 0, 0)).toISOString(),
    fragments: []
  },
  {
    id: "review-002",
    title: "Article Screenshot",
    sourceUrl: "",
    sourceKind: "screenshot",
    sourceText: "",
    extractedText: "The announcement of the merger raised concerns among local officials. Various issues, such as potential cost increases and service quality impacts, were highlighted.",
    originalImageUrl: "/assets/screenshot-article.png",
    notice: "Some words may be missing or inaccurate. Please check the extracted text before TinyBu organizes it.",
    issueType: "low_confidence",
    status: "needs_review",
    capturedAt: new Date(new Date().setHours(10, 5, 0, 0)).toISOString(),
    fragments: []
  },
  {
    id: "review-003",
    title: "YouTube Transcript",
    sourceUrl: "",
    sourceKind: "youtube",
    sourceText: "To create realistic animation... To create realistic animation... start with facial motion... To create realistic animation, start with facial motion, blinking cycles, hair physics, and clothing simulation.",
    originalText: "To create realistic animation... To create realistic animation... start with facial motion...",
    extractedText: "To create realistic animation, start with facial motion, blinking cycles, hair physics, and clothing simulation.",
    notice: "Some captions looked duplicated. Please confirm the useful text before organizing.",
    issueType: "transcript_messy",
    status: "needs_review",
    capturedAt: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
    fragments: []
  },
  {
    id: "review-004",
    title: "Article Capture",
    sourceUrl: "",
    sourceKind: "article",
    sourceText: "Sign in to continue reading. Subscribe now.",
    originalText: "Sign in to continue reading. Subscribe now.",
    extractedText: "Sign in to continue reading. Subscribe now.",
    notice: "This capture looks too short. It may contain page UI instead of the article content.",
    issueType: "extraction_issue",
    status: "needs_review",
    capturedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(18, 40, 0, 0); return d.toISOString(); })(),
    fragments: []
  }
];
