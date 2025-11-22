import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  Upload, 
  MessageSquare, 
  Search, 
  Settings, 
  FileText,
  Plus,
  X,
  Menu,
  Sparkles,
  Clipboard,
  File,
  Trash2,
  CheckCircle,
  AlertCircle,
  Filter
} from 'lucide-react';
import MetricCard from './components/MetricCard';
import DetailChart from './components/DetailChart';
import { HealthMetric, MetricCategory, MetricValue } from './types';
import { parseHealthData, getHolisticAdvice, normalizeHealthData } from './services/geminiService';
import ReactMarkdown from 'react-markdown';

// --- Mock Data for "Demo Mode" based on prompt ---
const DEMO_OCR_TEXT = `
TESTOSTERONE, TOTAL, MS 427 ng/dL (Range: 250-1100)
TESTOSTERONE, FREE 102.0 pg/mL (Range: 35.0-155.0)
HOMOCYSTEINE 8.9 umol/L (Range: < 12.9)
VITAMIN D, 25-OH, TOTAL 20 ng/mL (Low) (Range: 30-100)
TSH 2.76 mIU/L (Range: 0.40-4.50)
LDL CHOLESTEROL 105 mg/dL (High) (Range: <100)
APOLIPOPROTEIN B 79 mg/dL (Optimal <90)
HBA1C 5.1 % (Range: <5.7)
CRP, HS 0.3 mg/L (Optimal <1.0)
FERRITIN 91 ng/mL (Range: 38-380)
Body Fat 18.5 % (Range: 10-20)
Lean Muscle Mass 165 lbs (Normal)
`;

const App = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'advisor'>('dashboard');
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<HealthMetric | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [showOutOfRangeOnly, setShowOutOfRangeOnly] = useState(false);
  
  // Upload State
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload Success State
  const [uploadResult, setUploadResult] = useState<{added: string[], updated: string[]} | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  // --- Effects ---
  useEffect(() => {
    // Check for saved metrics
    const savedMetrics = localStorage.getItem('health_metrics');
    if (savedMetrics) {
      setMetrics(JSON.parse(savedMetrics));
    }
  }, []);

  const saveMetrics = (newMetrics: HealthMetric[]) => {
    setMetrics(newMetrics);
    localStorage.setItem('health_metrics', JSON.stringify(newMetrics));
  };

  // --- Handlers ---

  const handleDeleteMetric = (id: string) => {
    if (window.confirm('Are you sure you want to delete this entire metric and all its history? This cannot be undone.')) {
      const newMetrics = metrics.filter(m => m.id !== id);
      saveMetrics(newMetrics);
      setSelectedMetric(null);
    }
  };

  const handleDeleteDataPoint = (metricId: string, index: number) => {
    if (!window.confirm('Are you sure you want to delete this specific data point?')) return;

    const newMetrics = metrics.map(m => {
      if (m.id !== metricId) return m;

      const newDataPoints = [...m.dataPoints];
      // index passed is from the reversed list in UI, so we need to calculate real index if we passed that, 
      // BUT the UI loop logic passes the correct index relative to the source array.
      newDataPoints.splice(index, 1);

      if (newDataPoints.length === 0) return null; // Will be filtered out

      // Recalculate latest stats
      // Assuming sorted by date ascending
      const latest = newDataPoints[newDataPoints.length - 1];

      return {
        ...m,
        dataPoints: newDataPoints,
        latestValue: latest.value,
        latestUnit: latest.unit,
        latestDate: latest.date,
        status: (latest.isOutOfRange ? 'High' : 'Normal') as any // Simple fallback status, or keep old
      };
    }).filter((m): m is HealthMetric => m !== null);

    saveMetrics(newMetrics);

    // Update current view
    const updated = newMetrics.find(m => m.id === metricId);
    if (updated) {
      setSelectedMetric(updated);
    } else {
      setSelectedMetric(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setTextInput(''); 
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setTextInput('');
    }
  };

  const handleProcessData = async () => {
    if (!textInput && !selectedFile) return;

    setIsProcessing(true);
    try {
      let inputData: string | { mimeType: string; data: string };
      const sourceName = selectedFile ? selectedFile.name : 'Manual Text Input';

      if (selectedFile) {
        if (selectedFile.type === 'application/pdf') {
          const base64 = await fileToBase64(selectedFile);
          inputData = { mimeType: 'application/pdf', data: base64 };
        } else {
          const text = await fileToText(selectedFile);
          inputData = text;
        }
      } else {
        inputData = textInput;
      }

      // Step 1: Parse Raw Data
      const result = await parseHealthData(inputData);
      
      // Step 2: Normalize against existing metrics
      const normalizedNewMetrics = await normalizeHealthData(result.metrics, metrics);

      // Step 3: Merge Logic
      const updatedMetrics = [...metrics];
      const newAddedNames: string[] = [];
      const newUpdatedNames: string[] = [];
      
      normalizedNewMetrics.forEach(parsed => {
        const existingIndex = updatedMetrics.findIndex(m => m.name === parsed.name);
        
        const newDataPoint: MetricValue = {
          date: parsed.date || new Date().toISOString().split('T')[0],
          value: parsed.value,
          unit: parsed.unit,
          referenceRange: parsed.referenceRange,
          isOutOfRange: parsed.status !== 'Normal' && parsed.status !== 'Optimal',
          sourceDoc: sourceName
        };

        if (existingIndex >= 0) {
          const duplicate = updatedMetrics[existingIndex].dataPoints.find(
            dp => dp.date === newDataPoint.date && dp.value === newDataPoint.value
          );

          if (!duplicate) {
            updatedMetrics[existingIndex].dataPoints.push(newDataPoint);
            updatedMetrics[existingIndex].dataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            updatedMetrics[existingIndex].latestValue = newDataPoint.value;
            updatedMetrics[existingIndex].latestUnit = newDataPoint.unit;
            updatedMetrics[existingIndex].latestDate = newDataPoint.date;
            updatedMetrics[existingIndex].status = parsed.status as any;
            
            newUpdatedNames.push(parsed.name);
          }
        } else {
          updatedMetrics.push({
            id: Math.random().toString(36).substr(2, 9),
            name: parsed.name,
            category: (parsed.category as MetricCategory) || MetricCategory.Other,
            dataPoints: [newDataPoint],
            latestValue: parsed.value,
            latestUnit: parsed.unit,
            latestDate: newDataPoint.date,
            status: parsed.status as any
          });
          newAddedNames.push(parsed.name);
        }
      });

      saveMetrics(updatedMetrics);
      setTextInput('');
      setSelectedFile(null);
      
      setUploadResult({ added: newAddedNames, updated: newUpdatedNames });
      
    } catch (error) {
      alert("Error parsing or normalizing data. Please ensure the file format is valid.");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatting(true);

    try {
      const response = await getHolisticAdvice(userMsg, metrics, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: response || "I couldn't generate a response." }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: "Error connecting to AI. Please check your connection." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleLoadDemo = () => {
    setTextInput(DEMO_OCR_TEXT);
    setSelectedFile(null);
  };

  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || m.category === categoryFilter;
      const matchesRange = !showOutOfRangeOnly || (m.status === 'High' || m.status === 'Low');
      return matchesSearch && matchesCategory && matchesRange;
    });
  }, [metrics, searchQuery, categoryFilter, showOutOfRangeOnly]);

  const groupedMetrics = useMemo(() => {
    if (categoryFilter !== 'All') return null;

    const groups: Record<string, HealthMetric[]> = {};
    filteredMetrics.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return groups;
  }, [filteredMetrics, categoryFilter]);

  const categories = ['All', ...Array.from(new Set(metrics.map(m => m.category)))];
  // Preferred sort order for categories when grouping
  const categorySortOrder = [
    MetricCategory.Blood,
    MetricCategory.Urine,
    MetricCategory.Hormones,
    MetricCategory.Body,
    MetricCategory.Vitamins,
    MetricCategory.Activity,
    MetricCategory.Genetics,
    MetricCategory.Other
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
      
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 bg-white border-r border-gray-200 flex-shrink-0 fixed h-full z-20 lg:relative flex flex-col justify-between transition-all duration-300">
        <div>
            <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-gray-100">
            <Activity className="text-teal-600 h-8 w-8" />
            <span className="hidden lg:block ml-3 font-bold text-xl tracking-tight text-teal-900">HolisticAI</span>
            </div>
            
            <nav className="mt-6 px-2 lg:px-4 space-y-1">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center justify-center lg:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-teal-50 text-teal-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Activity className="h-5 w-5" />
                <span className="hidden lg:block ml-3 font-medium">Dashboard</span>
            </button>
            <button 
                onClick={() => setActiveTab('advisor')}
                className={`w-full flex items-center justify-center lg:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === 'advisor' ? 'bg-teal-50 text-teal-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Sparkles className="h-5 w-5" />
                <span className="hidden lg:block ml-3 font-medium">AI Advisor</span>
            </button>
            <button 
                onClick={() => setActiveTab('upload')}
                className={`w-full flex items-center justify-center lg:justify-start px-3 py-3 rounded-lg transition-colors ${activeTab === 'upload' ? 'bg-teal-50 text-teal-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Upload className="h-5 w-5" />
                <span className="hidden lg:block ml-3 font-medium">Import Data</span>
            </button>
            </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-20 lg:ml-0 overflow-y-auto p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
        
        <div className="lg:hidden mb-6 flex items-center justify-between">
             <div className="font-bold text-lg text-teal-900">Holistic Health AI</div>
        </div>

        {activeTab === 'dashboard' && (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Health Dashboard</h1>
                <p className="text-slate-500 mt-1">Your comprehensive biological overview.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search metrics..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-full sm:w-64"
                  />
                </div>
                <button 
                    onClick={() => setActiveTab('upload')}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Result</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6">
                 <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar flex-1">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                categoryFilter === cat 
                                ? 'bg-teal-600 text-white' 
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={showOutOfRangeOnly} 
                        onChange={e => setShowOutOfRangeOnly(e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <AlertCircle className={`h-4 w-4 ${showOutOfRangeOnly ? 'text-red-500' : 'text-gray-400'}`} />
                    <span className="whitespace-nowrap">Out of Range Only</span>
                </label>
            </div>

            {filteredMetrics.length > 0 ? (
                <>
                  {groupedMetrics ? (
                    // Grouped View
                    <div className="space-y-10">
                      {categorySortOrder.concat(Object.keys(groupedMetrics).filter(k => !categorySortOrder.includes(k as MetricCategory)) as MetricCategory[])
                        .map(cat => {
                        const catMetrics = groupedMetrics[cat as string];
                        if (!catMetrics || catMetrics.length === 0) return null;
                        
                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-4 mb-4">
                                <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide">{cat}</h3>
                                <div className="h-px flex-1 bg-gray-200"></div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {catMetrics.map(metric => (
                                    <MetricCard 
                                        key={metric.id} 
                                        metric={metric} 
                                        onClick={() => setSelectedMetric(metric)} 
                                    />
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Single List View (Filtered)
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredMetrics.map(metric => (
                        <MetricCard 
                            key={metric.id} 
                            metric={metric} 
                            onClick={() => setSelectedMetric(metric)} 
                        />
                    ))}
                    </div>
                  )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-gray-300 text-center p-6">
                    <div className="bg-teal-50 p-4 rounded-full mb-4">
                        <Activity className="h-8 w-8 text-teal-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">No Data Found</h3>
                    <p className="text-gray-500 max-w-sm mt-2 mb-6">
                        {showOutOfRangeOnly 
                            ? "Great news! No metrics are currently flagged as out of range based on your search." 
                            : "Upload your lab PDFs, genetic data, or wearable exports to get started."
                        }
                    </p>
                    {!showOutOfRangeOnly && (
                         <button 
                            onClick={() => setActiveTab('upload')}
                            className="text-teal-600 font-medium hover:text-teal-700 underline"
                        >
                            Go to Import
                        </button>
                    )}
                </div>
            )}
          </>
        )}

        {activeTab === 'upload' && (
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Import Health Data</h1>
            
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                
                <div 
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer mb-6 ${
                        selectedFile ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                    }`}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".pdf,.json,.csv,.txt" 
                        onChange={handleFileChange}
                    />
                    
                    {selectedFile ? (
                        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-200">
                            <div className="h-14 w-14 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-3">
                                <FileText className="h-7 w-7" />
                            </div>
                            <p className="font-semibold text-gray-900 text-lg">{selectedFile.name}</p>
                            <p className="text-sm text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFile(null);
                                }}
                                className="mt-4 text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                            >
                                <Trash2 className="h-4 w-4" /> Remove
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="h-14 w-14 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-3">
                                <Upload className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-700">Click or Drag to Upload</h3>
                            <p className="text-sm text-gray-500 mt-1 max-w-sm">
                                Support for PDF, JSON, CSV, or TXT files. <br/>
                                <span className="text-xs opacity-75">Files are processed locally or securely via AI API.</span>
                            </p>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs font-semibold text-gray-400 uppercase">Or paste text</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                <textarea
                    value={textInput}
                    onChange={(e) => {
                        setTextInput(e.target.value);
                        if (e.target.value) setSelectedFile(null);
                    }}
                    placeholder="Paste raw content here..."
                    className="w-full h-32 p-4 bg-slate-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono text-sm mb-4"
                />

                <div className="flex justify-between mt-2">
                    <button
                        onClick={handleLoadDemo}
                        className="text-gray-500 text-sm hover:text-teal-600 flex items-center gap-1"
                    >
                        <Clipboard className="h-3 w-3" /> Use Demo Data
                    </button>
                    <button
                        onClick={handleProcessData}
                        disabled={isProcessing || (!textInput && !selectedFile)}
                        className={`px-6 py-2 rounded-lg text-white font-medium transition-all flex items-center gap-2 ${
                            isProcessing || (!textInput && !selectedFile) ? 'bg-gray-300 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 shadow-md hover:shadow-lg'
                        }`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                {selectedFile ? 'Processing...' : 'Analyzing...'}
                            </>
                        ) : (
                            'Process Data'
                        )}
                    </button>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'advisor' && (
          <div className="h-[calc(100vh-6rem)] flex flex-col max-w-4xl mx-auto">
            <div className="flex-1 bg-white rounded-t-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-white flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-teal-600" />
                    <div>
                        <h2 className="font-semibold text-gray-900">Holistic Health Advisor</h2>
                        <p className="text-xs text-gray-500">Powered by Gemini 3 Pro • Context-Aware</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                    {chatHistory.length === 0 && (
                        <div className="text-center mt-10 opacity-60">
                            <div className="inline-block p-4 rounded-full bg-teal-50 mb-4">
                                <MessageSquare className="h-8 w-8 text-teal-600" />
                            </div>
                            <p className="text-gray-600">Ask me about your blood work, correlations, or how to improve your biomarkers.</p>
                        </div>
                    )}
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] lg:max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-teal-600 text-white rounded-br-none' 
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                            }`}>
                                {msg.role === 'user' ? (
                                    msg.text
                                ) : (
                                    <div className="prose prose-sm max-w-none prose-teal prose-p:my-2 prose-headings:my-3 prose-ul:my-2">
                                        <ReactMarkdown>
                                            {msg.text}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isChatting && (
                         <div className="flex justify-start">
                            <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-bl-none shadow-sm">
                                <div className="flex space-x-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                         </div>
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                            placeholder="E.g., What do my low Vitamin D and high LDL suggest?"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!chatInput.trim() || isChatting}
                            className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedMetric(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{selectedMetric.name}</h2>
                        <span className="text-gray-500 text-sm">{selectedMetric.category}</span>
                    </div>
                    <button onClick={() => setSelectedMetric(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-6 w-6" />
                    </button>
                </div>
                
                <div className="p-6">
                     <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-xl">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Latest</span>
                            <div className="text-2xl font-bold text-slate-900 mt-1">{selectedMetric.latestValue} <span className="text-sm font-normal text-gray-500">{selectedMetric.latestUnit}</span></div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Status</span>
                            <div className={`text-lg font-bold mt-1 ${
                                selectedMetric.status === 'Optimal' ? 'text-emerald-600' : 
                                selectedMetric.status === 'High' || selectedMetric.status === 'Low' ? 'text-red-600' : 'text-gray-700'
                            }`}>
                                {selectedMetric.status}
                            </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Date</span>
                            <div className="text-lg font-medium text-slate-700 mt-1">{selectedMetric.latestDate}</div>
                        </div>
                     </div>

                     <h3 className="font-semibold text-gray-900 mb-2">History & Trends</h3>
                     <div className="bg-white border border-gray-100 rounded-xl p-2 mb-6">
                        <DetailChart metric={selectedMetric} />
                     </div>

                     <h3 className="font-semibold text-gray-900 mb-3">Data History</h3>
                     <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0">
                              <tr>
                                <th className="px-4 py-2">Date</th>
                                <th className="px-4 py-2">Value</th>
                                <th className="px-4 py-2">Source</th>
                                <th className="px-4 py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {[...selectedMetric.dataPoints].reverse().map((dp, idx) => {
                                 // Calculate original index because we are reversing the map
                                 // original list: [A, B, C] -> displayed: [C, B, A]
                                 // if idx=0 (C), original index = length - 1 - 0 = 2. 
                                 const originalIndex = selectedMetric.dataPoints.length - 1 - idx;
                                 
                                 return (
                                   <tr key={idx} className="hover:bg-gray-50">
                                     <td className="px-4 py-2 whitespace-nowrap text-gray-700">{dp.date}</td>
                                     <td className="px-4 py-2 font-medium text-gray-900">
                                        {dp.value} {dp.unit}
                                        {dp.isOutOfRange && <AlertCircle className="inline-block ml-2 h-3 w-3 text-red-500" />}
                                     </td>
                                     <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[120px]" title={dp.sourceDoc}>
                                        {dp.sourceDoc || 'Manual Input'}
                                     </td>
                                     <td className="px-4 py-2 text-right">
                                       <button 
                                        onClick={() => handleDeleteDataPoint(selectedMetric.id, originalIndex)} 
                                        className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                                        title="Delete data point"
                                       >
                                         <Trash2 className="h-4 w-4" />
                                       </button>
                                     </td>
                                   </tr>
                                 );
                              })}
                            </tbody>
                          </table>
                        </div>
                     </div>

                     <div className="mt-6">
                        <h3 className="font-semibold text-gray-900 mb-3">Interpretation</h3>
                        <p className="text-gray-600 text-sm leading-relaxed">
                            {selectedMetric.description || "Use the AI Advisor to analyze this specific metric in the context of your other health data."}
                        </p>
                        <div className="flex items-center justify-between mt-4">
                            <button 
                                onClick={() => {
                                    setSelectedMetric(null);
                                    setActiveTab('advisor');
                                    setChatInput(`What does a ${selectedMetric.name} level of ${selectedMetric.latestValue} ${selectedMetric.latestUnit} mean for my health?`);
                                }}
                                className="text-teal-600 text-sm font-medium hover:underline flex items-center gap-1"
                            >
                                <MessageSquare className="h-4 w-4" /> Ask AI about this
                            </button>
                        </div>
                     </div>
                     
                     <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-[10px] text-gray-300 font-mono">ID: {selectedMetric.id}</span>
                        <button 
                            onClick={() => handleDeleteMetric(selectedMetric.id)}
                            className="text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Trash2 className="h-4 w-4" /> Delete Metric
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Upload Success Modal */}
      {uploadResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setUploadResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-4">
               <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6" />
               </div>
            </div>
            <h2 className="text-xl font-bold text-center text-gray-900 mb-2">Processing Complete</h2>
            <p className="text-center text-gray-500 mb-6">Your health data has been successfully analyzed and integrated.</p>
            
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-6">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">New Metrics Added</span>
                    <span className="text-sm font-bold text-gray-900 bg-white px-2 py-1 rounded border border-gray-200">{uploadResult.added.length}</span>
                </div>
                 <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Existing Metrics Updated</span>
                    <span className="text-sm font-bold text-gray-900 bg-white px-2 py-1 rounded border border-gray-200">{uploadResult.updated.length}</span>
                </div>
            </div>

            {(uploadResult.added.length > 0 || uploadResult.updated.length > 0) && (
               <div className="mb-6">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Details</p>
                  <div className="max-h-32 overflow-y-auto text-xs text-gray-500 space-y-1">
                    {uploadResult.added.map((name, i) => (
                        <div key={`add-${i}`} className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Added: {name}
                        </div>
                    ))}
                    {uploadResult.updated.map((name, i) => (
                        <div key={`upd-${i}`} className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Updated: {name}
                        </div>
                    ))}
                  </div>
               </div>
            )}

            <button 
              onClick={() => {
                setUploadResult(null);
                setActiveTab('dashboard');
              }}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors"
            >
                View Dashboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;