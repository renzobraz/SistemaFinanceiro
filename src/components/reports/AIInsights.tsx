import React, { useState, useEffect } from 'react';
import { Sparkles, BrainCircuit, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAIInsights } from '../../services/geminiService';
import { Transaction, Bank, Category, CostCenter, Participant, Wallet, AssetType, AssetSector, AssetTicker } from '../../../types';
import ReactMarkdown from 'react-markdown';

interface Registries {
  banks: Bank[];
  categories: Category[];
  costCenters: CostCenter[];
  participants: Participant[];
  wallets: Wallet[];
  assetTypes: AssetType[];
  assetSectors: AssetSector[];
  assetTickers: AssetTicker[];
}

interface AIInsightsProps {
  transactions: Transaction[];
  registries: Registries;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ transactions, registries }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    if (transactions.length === 0) {
      setInsights("Adicione algumas transações para que eu possa analisar seu perfil financeiro!");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getAIInsights({ transactions, registries });
      setInsights(result);
    } catch (err) {
      setError("Não foi possível carregar os insights. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [transactions]); // Recarrega se as transações mudarem significativamente (ex: troca de filtro)

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-12 opacity-[0.03] translate-x-1/4 -translate-y-1/4">
        <BrainCircuit className="w-64 h-64 text-blue-600" />
      </div>

      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl">
            <Sparkles className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Insights Inteligentes</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Análise por Inteligência Artificial</p>
          </div>
        </div>
        
        <button 
          onClick={fetchInsights}
          disabled={loading}
          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
          title="Recarregar Análise"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="relative mb-4">
                <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <BrainCircuit className="w-6 h-6 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm font-bold text-slate-500 animate-pulse">
                Processando seus dados e gerando recomendações...
              </p>
            </motion.div>
          ) : error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="p-4 bg-red-50 rounded-full">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-sm font-bold text-slate-500 max-w-xs">{error}</p>
              <button 
                onClick={fetchInsights}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Tentar Novamente
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="prose prose-slate prose-sm max-w-none prose-headings:text-slate-800 prose-p:text-slate-600 prose-strong:text-slate-900"
            >
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 lg:p-8">
                <ReactMarkdown>{insights || ""}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
