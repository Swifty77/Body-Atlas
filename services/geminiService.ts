import { GoogleGenAI, Type } from "@google/genai";
import { ParsedDataResponse, HealthMetric } from "../types";

export const parseHealthData = async (input: string | { mimeType: string; data: string }): Promise<ParsedDataResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are a specialized medical data extraction assistant. 
    Extract health metrics from the provided text, structured data, or attached document (PDF/Image).
    Identify the Test Name, the Value (number), the Unit, the Collection Date (ISO format YYYY-MM-DD), the Reference Range, and the Status (Normal, High, Low).
    
    If the date is not explicitly found next to the result, look for a global "Collection Date" or "Date" in the header.
    Categorize them into: 
    - Blood
    - Urine
    - Hormones
    - Vitamins
    - Activity
    - Genetics
    - Body (for weight, BMI, muscle mass, body fat %, bone density, etc.)
    - Other
    
    Return the data in a strict JSON structure.
  `;

  const parts: any[] = [{ text: prompt }];

  if (typeof input === 'string') {
    parts.push({ text: input });
  } else {
    // For binary files like PDF
    parts.push({ 
      inlineData: { 
        mimeType: input.mimeType, 
        data: input.data 
      } 
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: parts }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                category: { type: Type.STRING },
                date: { type: Type.STRING },
                referenceRange: { type: Type.STRING },
                status: { type: Type.STRING },
              },
              required: ["name", "value", "unit", "date", "status"]
            }
          }
        }
      }
    }
  });

  if (response.text) {
    return JSON.parse(response.text) as ParsedDataResponse;
  }
  throw new Error("Failed to parse data");
};

export const normalizeHealthData = async (
  newMetrics: ParsedDataResponse['metrics'], 
  existingMetrics: HealthMetric[]
): Promise<ParsedDataResponse['metrics']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // If we have no existing data, no need to normalize against anything
  if (existingMetrics.length === 0) {
    return newMetrics;
  }

  const existingSummary = existingMetrics.map(m => ({
    id: m.id,
    name: m.name,
    unit: m.latestUnit
  }));

  const prompt = `
    You are an expert medical data analyst and unit converter.
    
    Your Task:
    Compare the "New Metrics" against the "Existing Metrics" database.
    1. Identify matches where the biological marker is the same, even if the name differs (e.g. "WBC" == "White Blood Cell Count", "Vitamin D3" == "25-OH Vitamin D").
    2. If a match is found, check if the Units are different.
    3. If Units differ, mathematically CONVERT the 'New Metric' value to the 'Existing Metric' unit.
    4. If a match is found, rename the 'New Metric' to the 'Existing Metric' name and use the 'Existing Metric' unit.
    5. If no match is found, keep the New Metric as is.

    Existing Metrics Database:
    ${JSON.stringify(existingSummary)}

    New Metrics to Process:
    ${JSON.stringify(newMetrics)}

    Return the processed list of New Metrics (with names/values/units adjusted to match existing database where applicable).
    Structure the output exactly like the input 'New Metrics' list.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                category: { type: Type.STRING },
                date: { type: Type.STRING },
                referenceRange: { type: Type.STRING },
                status: { type: Type.STRING },
              },
              required: ["name", "value", "unit", "date", "status"]
            }
          }
        }
      }
    }
  });

  if (response.text) {
    const result = JSON.parse(response.text);
    return result.metrics;
  }
  
  // Fallback: return original if AI fails
  return newMetrics;
};

export const getHolisticAdvice = async (
  query: string, 
  healthData: HealthMetric[], 
  history: {role: string, text: string}[]
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a concise summary of the user's current health profile
  const profileSummary = healthData.map(m => 
    `- ${m.name}: ${m.latestValue} ${m.latestUnit} (${m.status}) on ${m.latestDate}`
  ).join('\n');

  const systemInstruction = `
    You are a world-class functional medicine doctor and holistic health AI.
    You have access to the user's comprehensive health data including blood work, hormones, body composition (dexa), and wearables.
    
    Rules:
    1. ALWAYS reference specific biomarkers from the user's data to support your arguments.
    2. Correlate different data points (e.g., Low Vitamin D with Hormonal imbalances, or Body Fat % with metabolic markers).
    3. Provide actionable, science-backed advice citing recent literature where possible.
    4. Be empathetic but objective.
    5. If a metric is out of range, explain potential causes and lifestyle interventions.
    
    Current Patient Data Profile:
    ${profileSummary}
  `;

  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: systemInstruction,
    },
    history: history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }))
  });

  const result = await chat.sendMessage({ message: query });
  return result.text;
};