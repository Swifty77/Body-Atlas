import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine
} from 'recharts';
import { HealthMetric } from '../types';

interface DetailChartProps {
  metric: HealthMetric;
}

const DetailChart: React.FC<DetailChartProps> = ({ metric }) => {
  // Parse reference range to draw a "safe zone" background if possible
  // Assuming format "x-y" or "<x" or ">y"
  let yMin: number | undefined;
  let yMax: number | undefined;

  // Simple parsing logic for demo purposes
  if (metric.dataPoints.length > 0) {
    const ref = metric.dataPoints[metric.dataPoints.length - 1].referenceRange;
    if (ref) {
        const dashSplit = ref.split('-');
        if (dashSplit.length === 2) {
            yMin = parseFloat(dashSplit[0]);
            yMax = parseFloat(dashSplit[1]);
        } else if (ref.includes('<')) {
            yMax = parseFloat(ref.replace('<', '').trim());
            yMin = 0; 
        } else if (ref.includes('>')) {
            yMin = parseFloat(ref.replace('>', '').trim());
            // No upper bound usually
        }
    }
  }

  const data = metric.dataPoints.map(dp => ({
    date: dp.date,
    value: dp.value,
    unit: dp.unit
  }));

  return (
    <div className="w-full h-[350px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis 
            dataKey="date" 
            stroke="#94a3b8" 
            fontSize={12} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ 
                backgroundColor: '#fff', 
                borderRadius: '8px', 
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                border: 'none'
            }}
          />
          
          {/* Reference Range Area */}
          {yMin !== undefined && yMax !== undefined && (
             <ReferenceArea y1={yMin} y2={yMax} fill="#10b981" fillOpacity={0.05} />
          )}
          
          {/* If only max (e.g. < 5.7) */}
          {yMin === 0 && yMax !== undefined && (
             <ReferenceLine y={yMax} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
          )}

          <Line
            type="monotone"
            dataKey="value"
            stroke="#0d9488"
            strokeWidth={3}
            dot={{ r: 4, fill: '#0d9488', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DetailChart;
