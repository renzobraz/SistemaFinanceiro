
import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  DollarSign,
  PieChart as PieChartIcon,
  RefreshCw,
  Upload,
  Users,
  Tag,
  Briefcase,
  BarChart3,
  UserCog,
  Settings as SettingsIcon,
  Wand2,
  Search,
} from 'lucide-react';

const TOC = [
  { href: '#saldo', label: '1. Saldo Bancário e Filtros' },
  { href: '#transferencias', label: '2. Transferências entre Contas' },
  { href: '#investimentos', label: '3. Como Controlar Investimentos' },
  { href: '#status', label: '4. Status: Pago vs Pendente' },
  { href: '#importacoes', label: '5. Importações (Nota, Fatura, Planilha)' },
  { href: '#participantes', label: '6. Participantes por Carteira' },
  { href: '#categorias', label: '7. Categorias: Sugestão de Tipo' },
  { href: '#carteiras-gerenciadas', label: '8. Carteiras Gerenciadas' },
  { href: '#relatorios', label: '9. Relatórios' },
  { href: '#equipe', label: '10. Equipe e Permissões' },
  { href: '#configuracoes', label: '11. Configurações' },
  { href: '#offline', label: '12. Modo Offline e Sincronização' },
];

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

        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Índice</p>
          <div className="flex flex-wrap gap-2">
            {TOC.map(item => (
              <a
                key={item.href}
                href={item.href}
                className="text-xs font-semibold text-blue-700 bg-white border border-blue-100 hover:bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="p-8 space-y-8">

          <section id="saldo" className="space-y-4 scroll-mt-4">
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
              <p className="text-xs italic text-slate-500">
                Se o saldo de um Banco/Carteira parecer errado (ex.: negativo sem sentido), o motivo mais comum é um cadastro duplicado
                (o mesmo banco criado duas vezes por engano numa importação) — veja a seção 6 para corrigir usando "Unificar Selecionados".
              </p>
            </div>
          </section>

          <section id="transferencias" className="space-y-4 scroll-mt-4">
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

          <section id="investimentos" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <PieChartIcon className="w-5 h-5 text-blue-500" />
              3. Como Controlar Investimentos?
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Para que o <strong>Relatório de Performance</strong> (aba Investimentos) funcione corretamente, siga este fluxo ao cadastrar e movimentar ativos:
              </p>
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 space-y-4">
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-slate-700 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">0</div>
                  <div className="space-y-1 text-slate-700">
                    <p><strong>REQUISITO CRUCIAL:</strong> No menu <strong>Cadastros &gt; Participantes</strong>, o ativo deve ter o campo <strong>"Tipo"</strong> preenchido (ex: Renda Fixa, CDB, Tesouro Direto).
                    <br/><span className="text-red-600 font-bold">Atenção:</span> Preencher apenas a "Categoria" não é suficiente; o sistema usa o "Tipo" para filtrar o que deve aparecer no relatório de ativos.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <div className="space-y-1">
                    <p><strong>Aporte/Compra:</strong> Lance um <strong>Débito</strong> selecionando o Ativo, ou importe direto pela Nota de Corretagem (seção 5) — o Saldo do Banco diminuirá e o valor passará a compor sua carteira.</p>
                    <p className="text-[11px] text-slate-500">Para Renda Fixa, se você não informar a <strong>Quantidade</strong>, o sistema assumirá automaticamente "1 unidade" para facilitar o controle por valor bruto.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <div className="space-y-1">
                    <p><strong>Rendimentos (Automático):</strong> No Relatório de Performance, use o botão <RefreshCw className="inline w-3 h-3 text-emerald-500" /> nos ativos sem ticker.</p>
                    <p className="text-[11px] text-slate-500 italic">Ao informar o novo saldo bruto, o sistema calcula o juros e cria automaticamente um lançamento de <strong>Crédito</strong> para ajustar seu saldo bancário real.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-amber-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
                  <div className="space-y-1">
                    <p><strong>Ativos sem Ticker:</strong> CDB, LCI, Tesouro Direto e Fundos dependem exclusivamente das suas atualizações manuais de saldo bruto para o cálculo de lucro real.</p>
                  </div>
                </div>
              </div>
              <p className="text-xs italic text-slate-500">
                * Por que não usar Transferência direto para o Ativo? Porque a transferência gera uma entrada (crédito) na conta destino, o que o sistema interpretaria como uma "venda" ou "recebimento" no relatório de performance.
              </p>
              <p className="text-xs text-slate-500">
                Quer separar uma parte da carteira que é administrada por um banco/gestor (ex.: carteira administrada, robô-advisor)? Veja <strong>"Carteiras Gerenciadas"</strong> (seção 8) para acompanhar essa fatia isoladamente.
              </p>
            </div>
          </section>

          <section id="status" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              4. Status: Pago vs Pendente
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

          <section id="importacoes" className="space-y-5 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Upload className="w-5 h-5 text-indigo-600" />
              5. Importações (Nota de Corretagem, Fatura de Cartão, Planilha)
            </h2>
            <div className="text-slate-600 space-y-5 leading-relaxed text-sm">
              <div>
                <h3 className="font-bold text-slate-800 mb-2">Nota de Corretagem (PDF)</h3>
                <p>
                  Em Investimentos &gt; "Incluir nota", envie o PDF da corretora. O sistema tenta ler os negócios automaticamente
                  (com IA como reforço quando o formato foge do padrão) e detecta duplicidade pela nota/data/banco.
                </p>
                <p className="mt-2">
                  As taxas do "Resumo Financeiro" da nota (Liquidação/CCP, Registro, Termo/Opções, Emolumentos, Transferência de
                  Ativos, Corretagem, ISS, IRRF) são separadas automaticamente na tela de revisão — cada uma vira um campo
                  editável, para você conferir contra a nota, e um lançamento próprio (por participante) na hora de confirmar, em
                  vez de um único valor genérico de "taxas". Se a nota tiver um formato que o sistema não reconheça, ele cai de
                  volta no campo único de sempre, sem travar a importação.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-2">Fatura de Cartão de Crédito (PDF, CSV ou XLSX)</h3>
                <p>
                  Em Contas a Pagar/Receber &gt; "Importar fatura", aceita o PDF original da fatura, o CSV, ou o XLSX exportado
                  pelo app do banco (funciona tanto para a fatura já paga quanto para a fatura em aberto). Os lançamentos são
                  conciliados automaticamente com as Contas a Pagar pendentes daquele banco.
                </p>
                <p className="mt-2">
                  O sistema também <strong>aprende sozinho</strong>: ao confirmar categoria/participante para um estabelecimento
                  (ex. "UBER *TRIP"), ele lembra da escolha e já sugere o mesmo na próxima fatura com a mesma descrição — mesmo em
                  outra carteira, ele reaproveita a categoria mas cria/usa o participante daquela carteira específica. Não existe
                  hoje uma tela para ver ou apagar essas sugestões aprendidas; se uma sugestão ficou errada, basta corrigir na
                  hora da importação — a próxima sugestão para aquela descrição será atualizada.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-2">Planilha de Movimentação Bancária (CSV)</h3>
                <p>
                  Em Movimentação Bancária &gt; "Importar planilha", para trazer um extrato genérico (de qualquer banco/planilha
                  de controle) em CSV. O sistema tenta adivinhar qual coluna é Data, Valor, Banco, Categoria e Participante, mas
                  <strong> sempre confira o mapeamento antes de continuar</strong> — se a coluna errada for escolhida (ex.: Data no
                  lugar de Banco), o sistema cria um cadastro de banco/categoria/participante novo para cada valor diferente
                  encontrado naquela coluna, gerando muitos cadastros indesejados.
                </p>
                <p className="mt-2">
                  Categorias, participantes e bancos citados na planilha que ainda não existem são criados automaticamente na
                  carteira escolhida para a importação.
                </p>
              </div>
            </div>
          </section>

          <section id="participantes" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Users className="w-5 h-5 text-teal-600" />
              6. Participantes por Carteira e Limpeza de Cadastros
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Cada <strong>Participante</strong> pertence a uma carteira específica — o mesmo nome (ex.: um fornecedor que
                aparece em duas empresas/carteiras diferentes) precisa de um cadastro próprio em cada carteira. Por isso, com
                "Todas (Ver Tudo)" selecionado, não é possível cadastrar um participante novo: escolha a carteira certa primeiro.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="flex items-center gap-1.5 text-slate-800 mb-1"><Search className="w-3.5 h-3.5 text-teal-600" /> Verificar Carteiras</strong>
                  Em Cadastros &gt; Participantes, mostra quem tem movimentação em carteira diferente da cadastrada (ou sem
                  carteira definida) e corrige com um clique — ou de uma vez só, para todos os casos encontrados.
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="flex items-center gap-1.5 text-slate-800 mb-1"><Wand2 className="w-3.5 h-3.5 text-amber-600" /> Sugerir Unificação / Limpar Duplicados</strong>
                  Encontra cadastros com nome igual ou muito parecido (em qualquer tipo de cadastro: Bancos, Categorias,
                  Participantes etc.) e uni­fica em um só, movendo os lançamentos vinculados automaticamente.
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="flex items-center gap-1.5 text-slate-800 mb-1"><Wand2 className="w-3.5 h-3.5 text-blue-600" /> Unificar Selecionados</strong>
                  Marque manualmente 2 ou mais cadastros de qualquer tipo (mesmo sem nome parecido) e escolha qual é o correto —
                  os demais são unificados nele e apagados. Útil quando "Excluir" é bloqueado por lançamentos vinculados (ex.:
                  vários bancos criados por engano numa importação).
                </div>
              </div>
            </div>
          </section>

          <section id="categorias" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Tag className="w-5 h-5 text-pink-600" />
              7. Categorias: Sugestão Automática de Tipo
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Ao lançar uma movimentação e escolher a Categoria, o campo <strong>Tipo</strong> (Débito/Crédito) é preenchido
                automaticamente com o que já foi mais usado para aquela categoria nos lançamentos existentes — por exemplo,
                categorias de receita como "Proventos" tendem a sugerir Crédito. A sugestão continua 100% editável logo em
                seguida, e uma categoria nova (sem histórico) ou usada de forma equilibrada não altera o Tipo já selecionado.
              </p>
            </div>
          </section>

          <section id="carteiras-gerenciadas" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Briefcase className="w-5 h-5 text-cyan-600" />
              8. Carteiras Gerenciadas
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Para acompanhar separadamente uma fatia da carteira administrada por um banco/gestor (carteira administrada,
                mandato de um robô-advisor etc.), cadastre em <strong>Cadastros &gt; Cart. Gerenciadas</strong>: nome, gestor/instituição,
                a carteira à qual pertence, data de início, cor de identificação e observações.
              </p>
              <p>
                Depois de criada, ela aparece como opção ao lançar compra/venda de ativos e na importação de nota de corretagem
                (em vez de "— Compra Avulsa —"). A tela calcula automaticamente, por carteira gerenciada: total aportado,
                resgates, proventos recebidos, saldo de custo, rentabilidade realizada, composição atual dos ativos e — quando há
                cotação disponível — o valor de mercado estimado e o ganho/perda não realizado. Pode ser encerrada (mantendo o
                histórico) ou excluída (os lançamentos apenas perdem a referência, sem serem apagados).
              </p>
            </div>
          </section>

          <section id="relatorios" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <BarChart3 className="w-5 h-5 text-violet-600" />
              9. Relatórios
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Fluxo de Caixa</strong>
                  Mostra a evolução do saldo (mensal ou diário) e projeta o futuro considerando os "Pendentes". Deixe marcados
                  apenas os bancos/carteiras que devem entrar no cálculo do saldo — os demais são ignorados tanto no saldo
                  quanto nas transações consideradas.
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Análise de Gastos</strong>
                  Só olha para Débitos. Agrupa por Categoria, Centro de Custo ou Participante, em gráficos (pizza + barras) ou
                  numa tabela mensal (pivot) — bom para ver quem/o quê está puxando as despesas e como isso muda mês a mês.
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Distribuição de Lucros</strong>
                  Para participantes marcados como "Sócio" (com % de participação cadastrado). Calcula o resultado do período
                  por banco, separando Saldo em Bancos de Saldo em Caixa (permite ajustar manualmente o valor a distribuir, ex.
                  líquido de impostos) e aplica o % de cada sócio — com um comparativo mês a mês.
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                  <strong className="block text-slate-800 mb-1">Relatórios</strong>
                  Painel mais novo e resumido: KPIs do período, insights escritos por IA, gráfico de fluxo de caixa e de
                  despesas, tabela de lançamentos e exportação em PDF/Excel — tudo com os mesmos filtros (data, banco, carteira,
                  categoria etc.). Não substitui os relatórios acima, é um resumo rápido adicional.
                </div>
              </div>
            </div>
          </section>

          <section id="equipe" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserCog className="w-5 h-5 text-slate-600" />
              10. Equipe e Permissões
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <p>
                Só é relevante se você trabalha com contador, sócio ou outra pessoa que precisa acessar o sistema. Em
                Configurações &gt; Gerenciar Equipe: primeiro crie um "Perfil de Acesso" (o que cada perfil pode ver/editar/excluir/exportar,
                módulo por módulo), depois convide a pessoa por e-mail escolhendo, carteira por carteira, qual perfil se aplica a ela.
                Sendo o único usuário do sistema, pode ignorar esta seção.
              </p>
            </div>
          </section>

          <section id="configuracoes" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <SettingsIcon className="w-5 h-5 text-slate-600" />
              11. Configurações
            </h2>
            <div className="text-slate-600 space-y-3 leading-relaxed text-sm">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Filtro de Inicialização:</strong> define o que abre por padrão (tela, período, status, banco e carteira), salvo na nuvem para qualquer dispositivo.</li>
                <li><strong>Conexão Banco de Dados:</strong> a conexão com o Supabase é fixa (não editável por segurança); aqui só é possível verificar se as tabelas existem e copiar os scripts SQL prontos caso falte alguma.</li>
                <li><strong>Configuração E-mail</strong> e <strong>Relatórios Agendados:</strong> configuram o envio de convites de equipe e relatórios recorrentes por e-mail.</li>
              </ul>
            </div>
          </section>

          <section id="offline" className="space-y-4 scroll-mt-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              12. Modo Offline e Sincronização
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
