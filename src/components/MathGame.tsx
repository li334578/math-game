import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Question, UserAnswer, GameState, GameResults } from '../types/game';
import LeaderboardPanel from './LeaderboardPanel';
import ResultActions from './ResultActions';
import { readLeaderboard, addLeaderboardEntry } from '../hooks/useLeaderboard';

/**
 * MathGame 组件
 * - 出题与答题双计数器：questionCounter（出题1-30）、answerCounter（答题1-30）
 * - 橙色倒计时：每100ms更新，周期结束推进；第30题提供完整一段并允许自动结束或期间作答
 * - 严格模式防重入：避免计时器重复与双推进
 * - 排行榜：localStorage 存储，分数降序、用时升序，最多100条
 * - 题目生成：尽量避免连续两题题面或答案相同（最多重试20次）
 */
const TOTAL_QUESTIONS = 30;
const QUESTION_DELAY = 3000; // 单题倒计时时长（毫秒）

const MathGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    questionCounter: 0,
    answerCounter: 0,
    questions: [],
    userAnswers: [],
    score: 0,
    gameStartTime: null,
    gameEndTime: null,
    isGameActive: false,
    canAnswerQuestionId: null,
  });

  const lastTickRef = useRef<number>(0);

  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: '', type: '' });
  const [gameResults, setGameResults] = useState<GameResults | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(QUESTION_DELAY);

  // 排行榜相关
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ name: string; score: number; totalTime: number; createdAt: string }>>([]);
  const [playerName, setPlayerName] = useState<string>('');
  const [submittingScore, setSubmittingScore] = useState<boolean>(false);

  // 本地排行榜存储使用 hooks/useLeaderboard 中的 LEADERBOARD_KEY

  const intervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 第30题：等待一整段橙色进度条后再自动结束的标记
  const finalEndPendingRef = useRef<boolean>(false);

  const generateQuestion = useCallback((questionNumber: number): Question => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operator = Math.random() > 0.5 ? '+' : '-';

    let correctAnswer: number;
    let finalNum1 = num1;
    let finalNum2 = num2;

    if (operator === '-') {
      if (num1 < num2) {
        [finalNum1, finalNum2] = [num2, num1];
      }
      correctAnswer = finalNum1 - finalNum2;
    } else {
      correctAnswer = finalNum1 + finalNum2;
    }

    return {
      id: questionNumber,
      num1: finalNum1,
      num2: finalNum2,
      operator,
      correctAnswer,
      questionText: `${finalNum1} ${operator} ${finalNum2} = ?`,
    };
  }, []);


  const startCountdown = useCallback(() => {
    setTimeRemaining(QUESTION_DELAY);

    // 防止重复创建倒计时（StrictMode/多次触发保护）
    if (countdownRef.current) {
      return;
    }

    // 重置上次触发时间，确保新一轮计时从干净状态开始
    lastTickRef.current = 0;

    countdownRef.current = window.setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 100) {
          // 橙色倒计时结束，触发游戏逻辑
          const currentTime = Date.now();
          if (currentTime - lastTickRef.current < 100) {
            // 防止在100ms内重复执行（React StrictMode防护）
            return QUESTION_DELAY;
          }
          lastTickRef.current = currentTime;

          // 若上一周期已进入“最终结束等待”阶段，则本周期触发时自动结束
          if (finalEndPendingRef.current) {
            finalEndPendingRef.current = false;
            setTimeout(() => {
              if (countdownRef.current) {
                window.clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              setGameState(prev => ({
                ...prev,
                isGameActive: false,
                gameEndTime: new Date(),
              }));
            }, 0);
            return QUESTION_DELAY;
          }

          setTimeout(() => {
            setGameState(prevState => {
              if (!prevState.isGameActive) return prevState;

              let newQuestionCounter = prevState.questionCounter;
              let newAnswerCounter = prevState.answerCounter;
              let newUserAnswers = prevState.userAnswers;
              let newCanAnswerQuestionId = prevState.canAnswerQuestionId;

              // 1. 出题逻辑 - 独立计数器 1-30
              if (prevState.questionCounter < TOTAL_QUESTIONS) {
                newQuestionCounter = prevState.questionCounter + 1;
              }

              // 2. 答题逻辑 - 独立计数器 1-30
              // 当题目计数器从5变为6时开始答题，之后每次倒计时结束都答题一次
              const shouldStartAnswering = (newQuestionCounter === 6 && prevState.answerCounter === 0) ||
                                          (newQuestionCounter > 6 && prevState.answerCounter > 0);
              if (shouldStartAnswering && prevState.answerCounter < TOTAL_QUESTIONS) {
                // 如果当前有可答题目，标记为已处理
                if (prevState.canAnswerQuestionId) {
                  newUserAnswers = prevState.userAnswers.map(answer =>
                    answer.questionId === prevState.canAnswerQuestionId
                      ? {
                          ...answer,
                          answeredAt: new Date(), // 标记处理时间，即使没有答案
                        }
                      : answer
                  );
                }

                // 答题计数器+1（无论是否回答）
                newAnswerCounter = prevState.answerCounter + 1;

                // 当答题计数到达30：不立刻结束
                // 1) 设定可答第30题
                // 2) 标记 finalEndPendingRef 为 true，留给下一段橙色进度条结束时自动结束
                if (newAnswerCounter >= TOTAL_QUESTIONS) {
                  finalEndPendingRef.current = true;
                  return {
                    ...prevState,
                    userAnswers: newUserAnswers,
                    answerCounter: TOTAL_QUESTIONS,
                    canAnswerQuestionId: TOTAL_QUESTIONS,
                  };
                }

                // 设置下一个可回答的题目ID
                newCanAnswerQuestionId = newAnswerCounter;
              }

              return {
                ...prevState,
                questionCounter: newQuestionCounter,
                answerCounter: newAnswerCounter,
                userAnswers: newUserAnswers,
                canAnswerQuestionId: newCanAnswerQuestionId,
              };
            });
          }, 0);
          return QUESTION_DELAY;
        }
        return prev - 100;
      });
    }, 100);
  }, []);

  const startGame = useCallback(() => {
    const initialQuestions: Question[] = [];
    const initialAnswers: UserAnswer[] = [];

    for (let i = 1; i <= TOTAL_QUESTIONS; i++) {
      // 生成题目时尽量避免与上一题题目内容或答案相同
      let q: Question;
      let attempts = 0;
      do {
        q = generateQuestion(i);
        attempts++;
      } while (
        attempts < 20 &&
        initialQuestions.length > 0 &&
        (q.questionText === initialQuestions[initialQuestions.length - 1].questionText ||
          q.correctAnswer === initialQuestions[initialQuestions.length - 1].correctAnswer)
      );

      initialQuestions.push(q);
      initialAnswers.push({
        questionId: i,
        userAnswer: null,
        isCorrect: null,
        answeredAt: null,
      });
    }

    setGameState({
      questionCounter: 0,
      answerCounter: 0,
      questions: initialQuestions,
      userAnswers: initialAnswers,
      score: 0,
      gameStartTime: new Date(),
      gameEndTime: null,
      isGameActive: true,
      canAnswerQuestionId: null,
    });

    setGameResults(null);
    setCurrentAnswer('');
    setFeedback({ message: '', type: '' });
    setSelectedQuestionId(null);
    setJustSubmitted(false);

    // 1秒后启动游戏，立即显示第一题并开始倒计时
    setTimeout(() => {
      // 立即显示第一题（不触发答题逻辑）
      setGameState(prev => ({
        ...prev,
        questionCounter: 1,
      }));
      startCountdown(); // 启动倒计时
    }, 1000);
  }, [generateQuestion, startCountdown]);

  const handleAnswerSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    const targetQuestionId = gameState.canAnswerQuestionId;

    if (!targetQuestionId || !currentAnswer.trim()) return;

    // 检查该题是否已经回答过
    const existingAnswer = gameState.userAnswers.find(a => a.questionId === targetQuestionId);
    if (existingAnswer && existingAnswer.userAnswer !== null) {
      setFeedback({ message: '该题已经回答过了！', type: 'error' });
      setCurrentAnswer('');
      return;
    }

    const answerValue = parseInt(currentAnswer);
    if (isNaN(answerValue)) {
      setFeedback({ message: '请输入有效数字', type: 'error' });
      return;
    }

    const questionToAnswer = gameState.questions.find(q => q.id === targetQuestionId);
    if (!questionToAnswer) return;

    const isCorrect = answerValue === questionToAnswer.correctAnswer;

    setGameState(prev => {
      const newUserAnswers = prev.userAnswers.map(answer =>
        answer.questionId === targetQuestionId
          ? {
              ...answer,
              userAnswer: answerValue,
              isCorrect,
              answeredAt: new Date(),
            }
          : answer
      );

      const nextState = {
        ...prev,
        userAnswers: newUserAnswers,
        score: isCorrect ? prev.score + 1 : prev.score,
      };

      return nextState;
    });

    // 如果提交的是第30题且答题计数已达30，则结束游戏
    if (targetQuestionId === TOTAL_QUESTIONS && gameState.answerCounter >= TOTAL_QUESTIONS) {
      setGameState(prev => ({
        ...prev,
        isGameActive: false,
        gameEndTime: new Date(),
      }));
    }


    const feedbackMessage = isCorrect
      ? `✅ 正确！${questionToAnswer.questionText.replace('?', answerValue.toString())}`
      : `❌ 错误！${questionToAnswer.questionText.replace('?', `${answerValue}，正确答案是 ${questionToAnswer.correctAnswer}`)}`;

    setFeedback({
      message: feedbackMessage,
      type: isCorrect ? 'success' : 'error'
    });

    setCurrentAnswer('');
    setSelectedQuestionId(null);
    setJustSubmitted(true);

    // 在答题阶段，用户回答后不立即跳转，等橙色进度条结束再跳转
    // 其他阶段保持原有逻辑
  }, [gameState.canAnswerQuestionId, selectedQuestionId, currentAnswer, gameState.questions, gameState.userAnswers]);

  useEffect(() => {
    if (!gameState.isGameActive && gameState.gameEndTime && gameState.questions.length > 0) {
      const results: GameResults = {
        totalQuestions: TOTAL_QUESTIONS,
        correctAnswers: gameState.score,
        score: gameState.score,
        accuracy: (gameState.score / TOTAL_QUESTIONS) * 100,
        totalTime: gameState.gameEndTime.getTime() - (gameState.gameStartTime?.getTime() || 0),
        questionDetails: gameState.questions.map(question => ({
          question,
          userAnswer: gameState.userAnswers.find(a => a.questionId === question.id)!,
        })),
      };
      setGameResults(results);
    }
  }, [gameState.isGameActive, gameState.gameEndTime, gameState.questions, gameState.userAnswers, gameState.score, gameState.gameStartTime]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, []);

  // 只用于UI状态管理，不控制倒计时
  useEffect(() => {
    if (gameState.canAnswerQuestionId && inputRef.current) {
      inputRef.current.focus();
    }
    // 当可回答的题目变化时，重置提交状态和清除反馈
    setJustSubmitted(false);
    setFeedback({ message: '', type: '' });
  }, [gameState.canAnswerQuestionId]);


  const currentQuestion = gameState.questions[gameState.questionCounter - 1];
  const canAnswerQuestion = gameState.questions.find(q => q.id === gameState.canAnswerQuestionId);

  // 第30题题面显示规则：
  // - 第30题出现时显示一次
  // - 当允许回答第26题（canAnswerQuestionId ≥ 26）时隐藏第30题题面
  const hideLastQuestionText =
    gameState.questionCounter === TOTAL_QUESTIONS &&
    (gameState.canAnswerQuestionId !== null && gameState.canAnswerQuestionId >= 26);

  if (gameResults) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 w-full max-w-xs sm:max-w-lg lg:max-w-2xl xl:max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">🎉 游戏结束！</h2>

            {/* 提交成绩到排行榜 */}
            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-2">提交成绩到排行榜：</div>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="输入姓名"
                  className="flex-1 border-2 border-gray-300 rounded-lg py-2 px-3 focus:border-blue-500 focus:outline-none"
                />
                <button
                  disabled={submittingScore || !playerName.trim()}
                  onClick={async () => {
                    try {
                      setSubmittingScore(true);
                      const entry = {
                        name: playerName.trim(),
                        score: gameResults.score,
                        totalTime: Math.round(gameResults.totalTime / 1000),
                        createdAt: new Date().toISOString()
                      };
                      const arr = addLeaderboardEntry(entry);
                      setLeaderboard(arr);
                      setPlayerName('');
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setSubmittingScore(false);
                    }
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-60"
                >
                  {submittingScore ? '提交中...' : '提交到排行榜'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{gameResults.score}</div>
                <div className="text-sm text-gray-600">总得分</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{gameResults.accuracy.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">正确率</div>
              </div>
            </div>
            <div className="text-gray-600 mb-6">
              用时: {Math.round(gameResults.totalTime / 1000)} 秒
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">答题详情：</h3>
            <div className="space-y-2">
              {gameResults.questionDetails.map(({ question, userAnswer }) => (
                <div
                  key={question.id}
                  className={`flex justify-between items-center p-2 rounded ${
                    userAnswer.isCorrect === true
                      ? 'bg-green-50 text-green-800'
                      : userAnswer.isCorrect === false
                      ? 'bg-red-50 text-red-800'
                      : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <span className="text-sm">
                    第{question.id}题: {question.questionText.replace('?', '')}
                  </span>
                  <span className="text-sm font-medium">
                    {userAnswer.userAnswer !== null ? userAnswer.userAnswer : '未答'}
                    {userAnswer.isCorrect === false && ` (正确: ${question.correctAnswer})`}
                    {userAnswer.isCorrect === true && ' ✅'}
                    {userAnswer.isCorrect === false && ' ❌'}
                    {userAnswer.isCorrect === null && ' ⏸️'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <ResultActions
            onRestart={startGame}
            onBackHome={() => {
              setGameResults(null);
              setFeedback({ message: '', type: '' });
              setCurrentAnswer('');
              setSelectedQuestionId(null);
              setJustSubmitted(false);
              setGameState({
                questionCounter: 0,
                answerCounter: 0,
                questions: [],
                userAnswers: [],
                score: 0,
                gameStartTime: null,
                gameEndTime: null,
                isGameActive: false,
                canAnswerQuestionId: null,
              });
            }}
            onToggleLeaderboard={() => {
              setShowLeaderboard((v) => !v);
              try {
                const data = readLeaderboard();
                setLeaderboard(data);
              } catch (e) {
                console.error(e);
              }
            }}
            showLeaderboard={showLeaderboard}
          />

          {showLeaderboard && (
            <LeaderboardPanel items={leaderboard} className="mt-4" />
          )}
        </div>
      </div>
    );
  }

  if (!gameState.isGameActive && gameState.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 text-center w-full max-w-sm sm:max-w-md lg:max-w-lg">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">🧮 十以内加减法</h1>
          <p className="text-gray-600 mb-6">
            每3秒出一道题，共30题<br/>
            第6题开始可以回答第1题<br/>
            之后每出新题可答前5题<br/>
            30题出完后进入答题阶段，回答所有未答题目
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <button
              onClick={startGame}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              开始游戏
            </button>
            <button
              onClick={async () => {
                setShowLeaderboard((v) => !v);
                if (!showLeaderboard) {
                  try {
                    const data = readLeaderboard();
                    setLeaderboard(data);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              {showLeaderboard ? '收起排行榜' : '查看排行榜'}
            </button>
          </div>

          {showLeaderboard && (
            <div className="text-left max-h-64 overflow-y-auto border rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-2">排行榜（本地存储）：</div>
              <div className="space-y-2">
                {leaderboard.length === 0 ? (
                  <div className="text-gray-500 text-sm">暂无数据</div>
                ) : (
                  leaderboard.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm bg-gray-50 rounded p-2">
                      <span className="font-medium">{idx + 1}. {item.name}</span>
                      <span>分数: {item.score} | 时间: {item.totalTime}s | {new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 w-full max-w-sm sm:max-w-md lg:max-w-lg xl:max-w-xl">
        <div className="text-center mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-4">
            <span>第 {gameState.questionCounter}/{TOTAL_QUESTIONS} 题</span>
            <span>得分: {gameState.score}</span>
          </div>

          {gameState.questionCounter > 0 && gameState.questionCounter <= TOTAL_QUESTIONS && currentQuestion && (
            <div className="mb-6">
              {!hideLastQuestionText && (
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 mb-4">
                  {currentQuestion.questionText}
                </div>
              )}

              {/* 题目倒计时进度条 - 出题阶段始终显示 */}
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all duration-100 ease-linear"
                    style={{ width: `${(timeRemaining / QUESTION_DELAY) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* 题目进度条 */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>题目进度</span>
                  <span>{gameState.questionCounter}/{TOTAL_QUESTIONS}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(gameState.questionCounter / TOTAL_QUESTIONS) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* 回答进度条 */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>回答进度</span>
                  <span>{gameState.answerCounter}/{TOTAL_QUESTIONS}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(gameState.answerCounter / TOTAL_QUESTIONS) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}


          {canAnswerQuestion && !justSubmitted ? (
            <div className="mb-6">
              <div className="text-lg text-gray-700 mb-4">
                请回答第 {canAnswerQuestion.id} 题
              </div>
              <div className="text-sm text-gray-500 mb-4">
                （考察记忆能力，不显示题目内容）
              </div>

              <form onSubmit={handleAnswerSubmit} className="space-y-4">
                <input
                  ref={inputRef}
                  type="number"
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  className="w-full text-xl sm:text-2xl text-center border-2 border-gray-300 rounded-lg py-2 sm:py-3 px-3 sm:px-4 focus:border-blue-500 focus:outline-none"
                  placeholder="输入答案"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors text-sm sm:text-base"
                  disabled={!currentAnswer.trim()}
                >
                  提交答案
                </button>
              </form>
            </div>
          ) : gameState.questionCounter < 6 ? (
            <div className="text-gray-500 mb-6">
              第 6 题开始可以答题...
            </div>
          ) : !canAnswerQuestion ? (
            <div className="text-gray-500 mb-6">
              等待下一题可答...
            </div>
          ) : (
            <div className="text-gray-500 mb-6">
              等待下一题可答...
            </div>
          )}

          {feedback.message && (
            <div className={`p-4 rounded-lg mb-4 ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-800 animate-pulse-slow'
                : feedback.type === 'error'
                ? 'bg-red-50 text-red-800 animate-shake'
                : ''
            }`}>
              {feedback.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MathGame;