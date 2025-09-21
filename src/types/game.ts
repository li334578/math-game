export interface Question {
  id: number;
  num1: number;
  num2: number;
  operator: '+' | '-';
  correctAnswer: number;
  questionText: string;
}

export interface UserAnswer {
  questionId: number;
  userAnswer: number | null;
  isCorrect: boolean | null;
  answeredAt: Date | null;
}

export interface GameState {
  questionCounter: number; // 出题计数器 1-30
  answerCounter: number; // 答题计数器 1-30
  questions: Question[];
  userAnswers: UserAnswer[];
  score: number;
  gameStartTime: Date | null;
  gameEndTime: Date | null;
  isGameActive: boolean;
  canAnswerQuestionId: number | null;
}

export interface GameResults {
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  accuracy: number;
  totalTime: number;
  questionDetails: Array<{
    question: Question;
    userAnswer: UserAnswer;
  }>;
}