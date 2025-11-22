import React from 'react';
import { HealthMetric } from '../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  metric: HealthMetric;
  onClick: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({ metric, onClick }) => {
  const isAlarming = metric.status === 'High' || metric.status === 'Low';
  
  // Determine trend based on last 2 data points if available
  let TrendIcon = Minus;
  let trendColor = 'text-gray-400';
  
  if (metric.dataPoints.length >= 2) {
    const current = metric.dataPoints[metric.dataPoints.length - 1].value;
    const prev = metric.dataPoints[metric.dataPoints.length - 2].value;
    if (current > prev) {
      TrendIcon = TrendingUp;
      trendColor = isAlarming && metric.status === 'High' ? 'text-red-500' : 'text-emerald-500';
    } else if (current < prev) {
      TrendIcon = TrendingDown;
      trendColor = isAlarming && metric.status === 'Low' ? 'text-red-500' : 'text-emerald-500';
    }
  }

  return (
    <div 
      onClick={onClick}
      className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-gray-500 group-hover:text-teal-600 transition-colors truncate pr-2">
          {metric.name}
        </h3>
        <span className={`
          text-[10px] px-2 py-1 rounded-full font-semibold tracking-wide uppercase
          ${metric.status === 'Optimal' || metric.status === 'Normal' ? 'bg-emerald-50 text-emerald-700' : ''}
          ${metric.status === 'High' ? 'bg-red-50 text-red-700' : ''}
          ${metric.status === 'Low' ? 'bg-amber-50 text-amber-700' : ''}
        `}>
          {metric.status}
        </span>
      </div>
      
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold text-gray-900">
          {metric.latestValue}
        </span>
        <span className="text-xs text-gray-400 font-medium">
          {metric.latestUnit}
        </span>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1.5">
            <TrendIcon size={16} className={trendColor} />
            <span className="text-xs text-gray-400">
                {metric.latestDate}
            </span>
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
