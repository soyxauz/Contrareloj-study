export type StudyMode = 'home' | 'smart-study' | 'study-guide' | 'images' | 'podcast' | 'ask-thea' | 'oral-lesson' | 'tests' | 'flashcards' | 'analytics' | 'create';

export type QuestionType =
  | 'multiple-choice'
  | 'multi-select'
  | 'matching'
  | 'drag-drop'
  | 'true-false'
  | 'image-labeling'
  | 'short-answer';

export interface ImageLabelHotspot {
  id: string;
  label: string;
  xPercent: number; // 0 a 100%
  yPercent: number; // 0 a 100%
  hint?: string;
}

export interface DocumentAsset {
  id: string;
  type: 'image' | 'table';
  dataUrl?: string; // base64 data URI
  caption?: string; // e.g. "Figura 1.2: Vía metabólica"
  pageOrSlide?: number;
  contextNearby?: string; // nearby sentence/caption
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  pageOrSlide?: number;
  heading?: string;
  text: string;
  tokenCount: number;
  assetIds?: string[];
  embedding?: number[];
}

export interface ParsedDocument {
  title: string;
  rawText: string;
  chunks: DocumentChunk[];
  assets: DocumentAsset[];
  metadata: {
    pageCount?: number;
    wordCount: number;
    detectedDiscipline?: string;
  };
}

export interface Question {
  id: string;
  type?: QuestionType; // Defaults to 'multiple-choice' if undefined
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  explanation: string;

  // Multiple Choice & True/False
  options?: string[];
  correctIndex?: number;

  // Multi-Select
  correctIndices?: number[];

  // Concept Matching
  matchingPairs?: { term: string; definition: string }[];

  // Drag & Drop / Word bank
  templateSentence?: string; // e.g. "El proceso de respiración celular ocurre en la {0} y genera {1}."
  blanksCorrect?: string[];  // ['mitocondria', 'ATP']
  wordBank?: string[];       // ['mitocondria', 'ATP', 'cloroplasto', 'glucógeno']

  // Image & Diagram Labeling (mover/colocar cuadros de texto en partes de una imagen o diagrama)
  imageHotspots?: ImageLabelHotspot[];
  imageWordBank?: string[];
  diagramTitle?: string;

  // Short Answer & Open-ended Questions
  idealAnswer?: string;
  keyPoints?: string[];
  rubric?: string;
  acceptableAnswers?: string[];

  // RAG Evidence & Multimodal Traceability
  sourceChunkId?: string;
  sourceChunkText?: string;
  sourcePageOrSlide?: number;
  sourceAsset?: DocumentAsset;

  // Socratic Reformulation & Active Recall
  isSocraticReformulation?: boolean;
  reformedConcept?: string;
  originalFailedQuestionId?: string;
  socraticAngle?: string;
}

export interface ShortAnswerEvaluation {
  similarity: number; // 0 a 100%
  isCorrect: boolean;
  score: number; // 0 a 1
  feedback: string;
  keyPointsCovered: string[];
  keyPointsMissed: string[];
}

export interface SmartStudyTypeFilters {
  multipleChoice: boolean;
  shortAnswer: boolean;
  trueFalse: boolean;
  practical: boolean;
}

export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  mastery: 'to-learn' | 'known' | 'mastered';
  type?: 'concept' | 'question';
  sourceChunkText?: string;
  sourcePageOrSlide?: number;
  sourceAsset?: DocumentAsset;
}

export interface GuessWhoClue {
  level: number;
  title: string;
  badge: string;
  text: string;
  unlockedScore: number;
  stars: number;
}

export interface GuessWhoCase {
  id: string;
  targetTerm: string;
  fullDefinition: string;
  clues: GuessWhoClue[];
  options: string[];
}

export type PodcastFormat = 'detailed' | 'brief' | 'critique' | 'debate';
export type PodcastDuration = 'short' | 'normal' | 'long';

export interface PodcastGenerationOptions {
  format?: PodcastFormat;
  duration?: PodcastDuration;
  orientation?: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  duration: string;
  hosts: { name: string; role: string; avatar: string }[];
  dialogue: { speaker: string; text: string; time: string }[];
  format?: PodcastFormat;
  durationMode?: PodcastDuration;
  orientation?: string;
}

export interface StudyKit {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  questions: Question[];
  flashcards: Flashcard[];
  studyGuideMarkdown: string;
  podcast: PodcastEpisode | null;
  sourceText?: string;
  sourceMaterials?: { id: string; name: string; size?: number; type?: string; rawText?: string }[];
  chunks?: DocumentChunk[];
  assets?: DocumentAsset[];
  archivedFlashcards?: Flashcard[];
  sourceLanguage?: string;
}


export interface DeveloperSettings {
  serverHasTheaPlus: boolean;
  unlimitedQuestions: boolean;
  unlockedSmartEdit: boolean;
  unlockedPodcast: boolean;
  unlockedAskThea: boolean;
  userProgressionLevel: 'NewUser' | 'Beginner' | 'Novice' | 'Expert';
  forceExplanationImages: boolean;
  bypassPaywall: boolean;
}

export interface PodcastSettings {
  voiceEngine: 'gemini' | 'edge' | 'browser';
  sofiaVoice: string;
  mateoVoice: string;
  edgeSofiaVoice?: string;
  edgeMateoVoice?: string;
  localSofiaVoice?: string;
  localMateoVoice?: string;
  playbackSpeed: number;
  geminiApiKey?: string;
  orientation?: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  email?: string;
  googleId?: string;
  avatarUrl?: string;
  aiSettings?: any;
  podcastSettings?: PodcastSettings;
}

export interface SmartStudySessionState {
  currentIndex: number;
  level: 1 | 2 | 3;
  levelCorrectCount: number;
  errorQueue: Question[];
  isReinforcementMode: boolean;
  selectedOption: number | null;
  selectedMultiIndices: number[];
  matchingPairsMap: Record<string, string>;
  matchingChecked: boolean;
  placedChips: (string | null)[];
  dragDropChecked: boolean;
  isAnswered: boolean;
  isCurrentCorrect: boolean | null;
  activeTab: 'practice' | 'history';
  history: any[];
  historyFilter: 'all' | 'correct' | 'incorrect';
  historyLevelFilter: number | 'all';
  questionsAnsweredTotal: number;
  totalErrorsReinforced: number;
  revealedQuestionIds?: string[];
  levelCorrectCounts?: Record<1 | 2 | 3, number>;
  lastUpdated: number;
  currentQuestionId?: string;
  activePracticeLevel?: 1 | 2 | 3;
  activePracticeDifficulty?: 'easy' | 'medium' | 'hard';
  seenQuestionIds?: string[];
}

