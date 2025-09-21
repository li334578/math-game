import React from 'react';

interface Props {
  onRestart: () => void;
  onBackHome: () => void;
  onToggleLeaderboard: () => void;
  showLeaderboard: boolean;
}

const ResultActions: React.FC<Props> = ({ onRestart, onBackHome, onToggleLeaderboard, showLeaderboard }) => {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <button
        onClick={onRestart}
        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        重新开始
      </button>
      <button
        onClick={onBackHome}
        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        回到首页
      </button>
      <button
        onClick={onToggleLeaderboard}
        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {showLeaderboard ? '收起排行榜' : '查看排行榜'}
      </button>
    </div>
  );
};

export default ResultActions;