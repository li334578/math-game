import React from 'react';
import type { LeaderboardEntry } from '../hooks/useLeaderboard';

interface Props {
  items: LeaderboardEntry[];
  title?: string;
  className?: string;
}

const LeaderboardPanel: React.FC<Props> = ({ items, title = '排行榜（本地存储）：', className }) => {
  return (
    <div className={`text-left max-h-64 overflow-y-auto border rounded-lg p-3 ${className || ''}`}>
      <div className="text-sm text-gray-600 mb-2">{title}</div>
      <div className="space-y-2">
        {(!items || items.length === 0) ? (
          <div className="text-gray-500 text-sm">暂无数据</div>
        ) : (
          items.map((item, idx) => (
            <div key={`${item.name}-${item.createdAt}-${idx}`} className="flex justify-between text-sm bg-gray-50 rounded p-2">
              <span className="font-medium">{idx + 1}. {item.name}</span>
              <span>分数: {item.score} | 时间: {item.totalTime}s | {new Date(item.createdAt).toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LeaderboardPanel;