import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Send, Plus, Menu, X, Shield, BookOpen, AlertCircle, FileText, Loader2 } from 'lucide-react';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [knowledgeParts, setKnowledgeParts] = useState([]);
  const messagesEndRef = useRef(null);
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  useEffect(() => {
    // Load knowledge base data dynamically via manifest
    const loadKnowledge = async () => {
      try {
        const response = await fetch('/data/manifest.json');
        if (!response.ok) throw new Error('Manifest not found');
        const manifest = await response.json();
        
        const parts = [];
        for (const file of manifest) {
          try {
            const fileRes = await fetch(`/data/${encodeURIComponent(file.name)}`);
            if (!fileRes.ok) continue;

            if (file.type === 'application/pdf') {
              const arrayBuffer = await fileRes.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              parts.push({
                inlineData: {
                  data: base64,
                  mimeType: 'application/pdf'
                }
              });
            } else if (file.type === 'text/plain') {
              const text = await fileRes.text();
              parts.push({ text: `\n[${file.name} 내용]\n${text}\n` });
            }
          } catch (e) {
            console.error(`Failed to load ${file.name}:`, e);
          }
        }
        setKnowledgeParts(parts);
      } catch (err) {
        console.error('Failed to load knowledge manifest:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    
    loadKnowledge();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    
    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: '오류: 환경변수(VITE_GEMINI_API_KEY)에 Gemini API 키가 설정되지 않았습니다. .env.local 파일을 확인해주세요.' 
      }]);
      setIsLoading(false);
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const systemInstructionText = `당신은 한국 초등학교 학교폭력 대응을 위한 '학교폭력 도우미' 챗봇입니다.
다음 제공되는 법령 및 가이드북 자료(PDF 및 텍스트)를 기반으로만 답변하세요. 제공된 자료에 없는 내용은 임의로 지어내지 말고(Hallucination 방지), "해당 내용은 법령을 직접 참고하시기 바랍니다."라고 안내하세요.
답변 끝에는 항상 참조한 문서명 및 제n조 n항 등 출처를 명시하세요.
학부모용과 교사용 질문의 의도를 파악하여 각자의 입장에서 필요한 절차를 우선적으로 답변해주세요.`;

      const systemInstructionParts = [
        { text: systemInstructionText },
        ...knowledgeParts
      ];

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        systemInstruction: { parts: systemInstructionParts },
      });

      // Prepare history for Gemini API
      const chatHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({
        history: chatHistory,
      });

      const result = await chat.sendMessage(text);
      const responseText = result.response.text();
      
      setMessages(prev => [...prev, { role: 'model', content: responseText }]);
      
      // Save to history (first message acts as title)
      if (messages.length === 0) {
        setHistory(prev => [{ id: Date.now(), title: text.substring(0, 20) + '...', messages: [...messages, userMessage, { role: 'model', content: responseText }] }, ...prev]);
      }
    } catch (error) {
      console.error('API Error:', error);
      setMessages(prev => [...prev, { role: 'model', content: '죄송합니다. 오류가 발생했습니다: ' + error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSuggestionClick = (text) => {
    handleSend(text);
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen bg-brand-50 items-center justify-center flex-col gap-4">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <p className="text-brand-900 font-medium">법령 및 가이드북 데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-brand-50 font-sans">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-white shadow-xl z-30 transform transition-transform duration-300 md:relative md:translate-x-0 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-brand-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-brand-500" />
            학교폭력 도우미
          </h2>
          <button className="md:hidden text-slate-500 hover:text-slate-700" onClick={() => setSidebarOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white py-3 px-4 rounded-xl transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5" />
            새 대화 시작
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-0">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">이전 대화 목록</h3>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">저장된 대화가 없습니다.</p>
            ) : (
              history.map(item => (
                <button 
                  key={item.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-brand-50 text-sm text-slate-700 transition-colors truncate flex items-center gap-3 border border-transparent hover:border-brand-100"
                >
                  <MessageSquare className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  {item.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Knowledge Base Status */}
        <div className="p-4 border-t border-brand-100 bg-slate-50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-2">
            <FileText className="w-4 h-4" />
            학습된 문서 ({knowledgeParts.length}개)
          </div>
          <p className="text-[10px] text-slate-400">PDF 및 텍스트 기반 RAG 작동 중</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-white md:rounded-l-2xl md:shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] overflow-hidden relative">
        {/* Header */}
        <header className="h-16 flex items-center px-4 border-b border-brand-50 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <button 
            className="md:hidden mr-4 text-slate-500 hover:text-brand-600 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
            <h1 className="font-bold text-brand-900">학교폭력 도우미 AI</h1>
            <span className="text-xs text-brand-500">법령 기반 신뢰할 수 있는 답변</span>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 fade-in">
              <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center shadow-inner">
                <Shield className="w-10 h-10 text-brand-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">무엇을 도와드릴까요?</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                  업로드된 학교폭력 관련 법령, 가이드북, 매뉴얼을 기반으로 정확하고 신뢰할 수 있는 정보를 제공합니다.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <button 
                  onClick={() => handleSuggestionClick("학부모입니다. 자녀가 학교폭력을 당한 것 같은데 초기 대응 절차를 알려주세요.")}
                  className="flex flex-col items-start p-5 bg-white border border-brand-100 rounded-2xl hover:border-brand-400 hover:shadow-md transition-all text-left"
                >
                  <AlertCircle className="w-6 h-6 text-brand-500 mb-3" />
                  <span className="font-semibold text-slate-800 mb-1">학부모용 초기 대응</span>
                  <span className="text-xs text-slate-500">피해 의심 시 대처 및 신고 방법 안내</span>
                </button>
                <button 
                  onClick={() => handleSuggestionClick("담임 교사입니다. 우리 반에서 학교폭력 사안을 인지했을 때의 처리 매뉴얼을 알려주세요.")}
                  className="flex flex-col items-start p-5 bg-white border border-brand-100 rounded-2xl hover:border-brand-400 hover:shadow-md transition-all text-left"
                >
                  <BookOpen className="w-6 h-6 text-brand-500 mb-3" />
                  <span className="font-semibold text-slate-800 mb-1">교사용 사안 처리 매뉴얼</span>
                  <span className="text-xs text-slate-500">사안 인지 시 보고 및 조치 절차</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 md:p-5 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-brand-500 text-white rounded-tr-sm' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm md:prose-base prose-blue max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:text-slate-800">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm p-5 shadow-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-brand-50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]">
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="학교폭력 관련 법령이나 대처법에 대해 질문해보세요..."
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-full py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all shadow-inner"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-full transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-3">
            AI의 답변은 제공된 법령과 매뉴얼을 기반으로 하지만, 실제 법적 효력을 갖지 않으며 참고용으로만 사용하시기 바랍니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
