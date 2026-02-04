
import React from 'react';
import { 
  BookOpen, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRightLeft, 
  Filter,
  DollarSign
} from 'lucide-react';

export const HelpManual: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-blue-50/50 flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Manual do Sistema</h1>
            <p className="text-slate-500">Regras de negócio e guia de utilização do FinControl Pro.</p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <DollarSign className="w-5 h-5 text-blue-600" />
              1. Saldo Bancário e Filtros
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                <strong className="text-slate-800">Regra de Ouro:</strong> O Saldo Atual exibido no topo do sistema (Dashboard e Movimentação) é sempre o 
                <span className="inline-block px-2 py-0.5 mx-1 bg-green-100 text-green-700 rounded font-bold text-xs">SALDO REAL</span> 
                da conta, considerando <strong>todo o histórico</strong> de transações pagas até o momento.
              </p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-700 text-xs">
                <p className="mb-2 font-bold">Como funciona ao filtrar por data?</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Se você filtrar, por exemplo, apenas "Janeiro de 2026", a lista mostrará apenas as transações desse mês.</li>
                  <li>Porém, a coluna <strong>"Saldo"</strong> na lista começará considerando o valor que você tinha em conta no dia 31 de Dezembro de 2025.</li>
                  <li>Isso garante que você veja a evolução real do caixa, sem "quebras" visuais causadas pelo filtro.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              2. Transferências entre Contas
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Para mover dinheiro entre contas (ex: Itaú para Carteira), utilize o modo <strong>"Transferência"</strong> no formulário de lançamento.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <li className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Como é salvo?</strong>
                  O sistema cria automaticamente dois lançamentos vinculados: uma <span className="text-red-600 font-bold">Saída</span> na conta de origem e uma <span className="text-green-600 font-bold">Entrada</span> na conta de destino.
                </li>
                <li className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Edição e Exclusão</strong>
                  Ao editar ou excluir uma perna da transferência, o sistema perguntará se você deseja aplicar a ação à outra parte automaticamente.
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              3. Status: Pago vs Pendente
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>O sistema diferencia claramente o que é previsão do que é realidade:</p>
              <div className="flex gap-4 flex-col sm:flex-row">
                 <div className="flex-1 bg-yellow-50 border border-yellow-100 p-4 rounded-lg">
                    <span className="text-yellow-700 font-bold uppercase text-xs tracking-wider mb-1 block">Pendente</span>
                    <p>Contas a pagar ou receber futuras. Elas aparecem no <strong>Fluxo de Caixa</strong> para projeção, mas <strong>NÃO</strong> afetam o saldo atual das contas bancárias.</p>
                 </div>
                 <div className="flex-1 bg-green-50 border border-green-100 p-4 rounded-lg">
                    <span className="text-green-700 font-bold uppercase text-xs tracking-wider mb-1 block">Pago</span>
                    <p>Transações efetivadas. Apenas estas compõem o saldo real dos bancos e carteiras.</p>
                 </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              4. Modo Offline e Sincronização
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                O sistema funciona prioritariamente conectado ao <strong>Supabase</strong>. Caso a conexão caia ou não esteja configurada:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>O sistema entra em modo <strong>OFFLINE</strong> (indicado no topo).</li>
                <li>Você pode continuar visualizando os dados que já foram carregados.</li>
                <li>Novos lançamentos serão salvos temporariamente no navegador, mas <strong>atenção</strong>: dados locais podem ser perdidos se o cache do navegador for limpo.</li>
                <li>Recomendamos configurar a conexão na aba <strong>Configurações</strong> para segurança dos dados.</li>
              </ul>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
