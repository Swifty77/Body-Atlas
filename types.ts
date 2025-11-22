export enum MetricCategory {
  Blood = 'Blood',
  Urine = 'Urine',
  Hormones = 'Hormones',
  Vitamins = 'Vitamins',
  Activity = 'Activity',
  Genetics = 'Genetics',
  Body = 'Body',
  Other = 'Other'
}

export interface MetricValue {
  date: string; // ISO Date string
  value: number;
  unit: string;
  referenceRange?: string;
  isOutOfRange?: boolean;
  sourceDoc?: string;
}

export interface HealthMetric {
  id: string;
  name: string;
  category: MetricCategory;
  dataPoints: MetricValue[];
  latestValue: number;
  latestUnit: string;
  latestDate: string;
  status: 'Optimal' | 'Borderline' | 'High' | 'Low' | 'Normal';
  description?: string;
}

export interface ParsedDataResponse {
  metrics: {
    name: string;
    value: number;
    unit: string;
    category: string;
    date: string;
    referenceRange: string;
    status: string;
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}