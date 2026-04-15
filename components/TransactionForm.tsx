import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  X,
  Save,
  ArrowRightLeft,
  Plus,
  Loader2,
  Search,
  User,
  Repeat,
  CalendarClock,
  RotateCcw,
} from "lucide-react";
import {
  Transaction,
  Bank,
  Category,
  CostCenter,
  Participant,
  Wallet,
  TransactionStatus,
} from "../types";

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Transaction | Transaction[]) => Promise<void>;
  onAddParticipant: (name: string) => Promise<Participant>;
  initialData?: Transaction | null;
  partnerData?: Transaction | null;
  defaultStatus?: TransactionStatus;
  preSelectedBankId?: string;
  preSelectedWalletId?: string;
  registries: {
    banks: Bank[];
    categories: Category[];
    costCenters: CostCenter[];
    participants: Participant[];
    wallets: Wallet[];
  };
}

const emptyTransaction: Omit<Transaction, "id"> = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  docNumber: "",
  value: 0,
  type: "DEBIT",
  status: "PENDING",
  bankId: "",
  categoryId: "",
  costCenterId: "",
  participantId: "",
  walletId: "",
};

type FormMode = "DEFAULT" | "TRANSFER";
type RecurrenceFrequency = "MONTHLY" | "WEEKLY" | "YEARLY";

const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fallback se falhar
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

import { FixedSizeList as List } from "react-window";

const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const HighlightMatch = ({ text, search }: { text: string; search: string }) => {
  if (!text) return null;
  if (!search || typeof search !== 'string' || !search.trim()) return <>{text}</>;
  
  const terms = search
    .toLowerCase()
    .split(" ")
    .filter((t) => t.trim() !== "");
  if (terms.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const isMatch = terms.some((t) => t.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <strong key={i} className="font-extrabold text-blue-700">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
};

export const TransactionForm: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  onSave,
  onAddParticipant,
  initialData,
  partnerData,
  defaultStatus = "PENDING",
  preSelectedBankId,
  preSelectedWalletId,
  registries,
}) => {
  const [formData, setFormData] =
    useState<Omit<Transaction, "id">>(emptyTransaction);
  const [id, setId] = useState<string>("");
  const [mode, setMode] = useState<FormMode>("DEFAULT");
  const [targetBankId, setTargetBankId] = useState("");
  const [targetWalletId, setTargetWalletId] = useState("");
  const [linkedId, setLinkedId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Exchange State
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [spread, setSpread] = useState<number>(0);
  const [iof, setIof] = useState<number>(0);
  const [vet, setVet] = useState<number>(0);
  const [originalValue, setOriginalValue] = useState<number>(0);
  const [originalCurrency, setOriginalCurrency] = useState<string>("");

  // Recurrence State
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrenceCount, setRecurrenceCount] = useState(2);
  const [recurrenceFreq, setRecurrenceFreq] =
    useState<RecurrenceFrequency>("MONTHLY");

  const [participantSearch, setParticipantSearch] = useState("");
  const deferredParticipantSearch = useDeferredValue(participantSearch);
  const [isParticipantDropdownOpen, setIsParticipantDropdownOpen] =
    useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedBanks = useMemo(
    () => [...registries.banks].sort((a, b) => a.name.localeCompare(b.name)),
    [registries.banks],
  );
  const sortedCategories = useMemo(
    () =>
      [...registries.categories].sort((a, b) => a.name.localeCompare(b.name)),
    [registries.categories],
  );
  const sortedCostCenters = useMemo(
    () =>
      [...registries.costCenters].sort((a, b) => a.name.localeCompare(b.name)),
    [registries.costCenters],
  );
  const sortedWallets = useMemo(
    () => [...registries.wallets].sort((a, b) => a.name.localeCompare(b.name)),
    [registries.wallets],
  );

  const filteredParticipants = useMemo(() => {
    const search = (deferredParticipantSearch || "").toLowerCase();
    const searchTerms = search
      .split(" ")
      .filter((t) => t.trim() !== "");

    return registries.participants.filter((p) => {
      if (!p || !p.name) return false;
      if (searchTerms.length === 0) return true;
      const nameLower = p.name.toLowerCase();
      return searchTerms.every((term) => nameLower.includes(term));
    });
  }, [registries.participants, deferredParticipantSearch]);

  const exactMatchExists = useMemo(() => {
    const search = (deferredParticipantSearch || "").trim().toLowerCase();
    if (!search) return false;
    return registries.participants.some(
      (p) => p && p.name && p.name.toLowerCase() === search
    );
  }, [registries.participants, deferredParticipantSearch]);

  const similarParticipant = useMemo(() => {
    const search = (deferredParticipantSearch || "").trim().toLowerCase();
    if (exactMatchExists || search.length < 3) return null;
    let closest = null;
    let minDistance = Infinity;
    for (const p of registries.participants) {
      if (!p || !p.name) continue;
      const dist = getLevenshteinDistance(
        p.name.toLowerCase(),
        search
      );
      if (dist < minDistance && dist <= 2) {
        minDistance = dist;
        closest = p;
      }
    }
    return closest;
  }, [registries.participants, deferredParticipantSearch, exactMatchExists]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [participantSearch, isParticipantDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsParticipantDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  useEffect(() => {
    if (exchangeRate > 0) {
      const calculatedVet = exchangeRate * (1 + (spread + iof) / 100);
      setVet(Number(calculatedVet.toFixed(4)));
    }
  }, [exchangeRate, spread, iof]);

  useEffect(() => {
    if (!isOpen) return;
    setIsSaving(false);
    setIsParticipantDropdownOpen(false);

    if (initialData) {
      const newFormData = { ...initialData };

      if (initialData.linkedId) {
        setMode("TRANSFER");
        if (initialData.type === "CREDIT" && partnerData) {
          newFormData.bankId = partnerData.bankId;
          newFormData.walletId = partnerData.walletId;
          setTargetBankId(initialData.bankId);
          setTargetWalletId(initialData.walletId);
        } else {
          if (partnerData) {
            setTargetBankId(partnerData.bankId);
            setTargetWalletId(partnerData.walletId);
          } else {
            setTargetBankId("");
            setTargetWalletId("");
          }
        }
        
        // Load exchange fields if they exist
        setExchangeRate(initialData.exchangeRate || 0);
        setSpread(initialData.spread || 0);
        setIof(initialData.iof || 0);
        setVet(initialData.vet || 0);
        setOriginalValue(initialData.originalValue || 0);
        setOriginalCurrency(initialData.originalCurrency || "");
      } else {
        setMode("DEFAULT");
        setTargetBankId("");
        setTargetWalletId("");
        setExchangeRate(0);
        setSpread(0);
        setIof(0);
        setVet(0);
        setOriginalValue(0);
        setOriginalCurrency("");
      }

      setFormData(newFormData);
      setId(initialData.id);
      setLinkedId(initialData.linkedId);

      setIsRecurrent(false);
      setRecurrenceCount(2);

      const participant = registries.participants.find(
        (p) => p.id === initialData.participantId,
      );
      setParticipantSearch(participant?.name || "");
      setDiscountValue(0);
    } else {
      setFormData({
        ...emptyTransaction,
        status: defaultStatus,
        bankId: preSelectedBankId || "",
        walletId: preSelectedWalletId || "",
      });
      setId("");
      setLinkedId(undefined);
      setMode("DEFAULT");
      setTargetBankId("");
      setTargetWalletId("");
      setParticipantSearch("");
      setDiscountValue(0);
      setIsRecurrent(false);
      setRecurrenceCount(2);
      setRecurrenceFreq("MONTHLY");
      setExchangeRate(0);
      setSpread(0);
      setIof(0);
      setVet(0);
      setOriginalValue(0);
      setOriginalCurrency("");
    }
  }, [
    initialData,
    partnerData,
    isOpen,
    defaultStatus,
    registries.participants,
    preSelectedBankId,
    preSelectedWalletId,
  ]);

  useEffect(() => {
    // Se temos quantidade e preço unitário, calculamos o valor total
    if (formData.quantity && formData.unitPrice) {
      const calculatedValue = Number((formData.quantity * formData.unitPrice).toFixed(2));
      if (Math.abs(formData.value - calculatedValue) > 0.01) {
        setFormData(prev => ({
          ...prev,
          value: calculatedValue
        }));
      }
    } 
    // Se temos valor total e quantidade, calculamos o preço unitário
    else if (formData.value && formData.quantity && !formData.unitPrice) {
      const calculatedUnitPrice = Number((formData.value / formData.quantity).toFixed(6));
      setFormData(prev => ({
        ...prev,
        unitPrice: calculatedUnitPrice
      }));
    }
  }, [formData.quantity, formData.unitPrice, formData.value]);

  const handleQuickAddParticipant = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!participantSearch.trim() || isAddingParticipant) return;
    setIsAddingParticipant(true);
    try {
      const newP = await onAddParticipant(participantSearch.trim());
      setFormData((prev) => ({ ...prev, participantId: newP.id }));
      setParticipantSearch(newP.name);
      setIsParticipantDropdownOpen(false);
    } finally {
      setIsAddingParticipant(false);
    }
  };

  const calculateDate = (
    startDate: string,
    offset: number,
    freq: RecurrenceFrequency,
  ): string => {
    const [y, m, d] = startDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    if (freq === "MONTHLY") {
      date.setMonth(date.getMonth() + offset);
      if (date.getDate() !== d) {
        date.setDate(0);
      }
    } else if (freq === "WEEKLY") {
      date.setDate(date.getDate() + offset * 7);
    } else if (freq === "YEARLY") {
      date.setFullYear(date.getFullYear() + offset);
    }

    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const formatCurrencyInput = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const handleCurrencyInputChange = (e: React.ChangeEvent<HTMLInputElement>, callback: (val: number) => void) => {
    const digits = e.target.value.replace(/\D/g, "");
    const numericValue = digits ? parseFloat(digits) / 100 : 0;
    callback(numericValue);
  };

  const handleSubmit = async (e: React.FormEvent, withDiscount = false) => {
    e.preventDefault();
    if (isSaving) return;

    // Validação de Investimento
    const category = registries.categories.find(c => c.id === formData.categoryId);
    const participant = registries.participants.find(p => p.id === formData.participantId);
    const bank = registries.banks.find(b => b.id === formData.bankId);
    const isInvestmentBank = bank?.type === 'INVESTMENT';

    const isDividendOrTax = category?.name.toLowerCase() === 'proventos' || 
                           category?.name.toLowerCase() === 'impostos s/ proventos';

    const isInvestment = !!participant?.category && isInvestmentBank && !isDividendOrTax;

    if (isInvestment) {
      if (!formData.quantity || formData.quantity <= 0) {
        alert("Para investimentos, a quantidade é obrigatória e deve ser maior que zero.");
        return;
      }
      if (!formData.unitPrice || formData.unitPrice <= 0) {
        alert("Para investimentos, o preço unitário é obrigatório.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const transactionsToSave: Transaction[] = [];
      const isNew = !id;
      const loops = isNew && isRecurrent ? Math.max(1, recurrenceCount) : 1;

      // Se estivermos gerando um desconto simultâneo, precisamos de um linkedId comum
      const refundLinkedId = withDiscount ? (linkedId || generateUUID()) : undefined;

      for (let i = 0; i < loops; i++) {
        const currentData = { ...formData };

        if (i > 0) {
          currentData.date = calculateDate(formData.date, i, recurrenceFreq);
          // Mantém o status original (não força PENDING), respeitando a seleção do usuário
        }

        if (loops > 1) {
          currentData.description = `${formData.description} (${i + 1}/${loops})`;
        }

        if (mode === "TRANSFER") {
          const currentLinkedId =
            i === 0 && linkedId ? linkedId : generateUUID();

          const sourceBank = registries.banks.find(
            (b) => b.id === formData.bankId,
          );
          const targetBank = registries.banks.find(
            (b) => b.id === targetBankId,
          );
          const sourceWallet = registries.wallets.find(
            (w) => w.id === formData.walletId,
          );
          const targetWallet = registries.wallets.find(
            (w) => w.id === targetWalletId,
          );

          let debitLegId = "";
          let creditLegId = "";

          if (i === 0 && initialData) {
            if (initialData.linkedId) {
              if (initialData.type === "DEBIT") {
                debitLegId = initialData.id;
                creditLegId = partnerData?.id || "";
              } else {
                creditLegId = initialData.id;
                debitLegId = partnerData?.id || "";
              }
            } else {
              debitLegId = initialData.id;
              creditLegId = "";
            }
          }

          const isMultiCurrency = sourceBank && targetBank && sourceBank.currency !== targetBank.currency;

          // Debit Leg (Always in source currency)
          transactionsToSave.push({
            ...currentData,
            id: debitLegId,
            description: `Transf. p/ ${targetBank?.name || "Destino"} ${loops > 1 ? `(${i + 1}/${loops})` : ""}`,
            type: "DEBIT",
            linkedId: currentLinkedId,
            bankId: formData.bankId,
            walletId: formData.walletId,
            exchangeRate,
            spread,
            iof,
            vet,
            originalValue: isMultiCurrency ? formData.value : undefined,
            originalCurrency: isMultiCurrency ? sourceBank.currency : undefined
          });

          // Credit Leg (In target currency if multi-currency)
          const creditValue = isMultiCurrency && vet > 0 ? formData.value / vet : formData.value;

          transactionsToSave.push({
            ...currentData,
            id: creditLegId,
            value: creditValue,
            description: `Transf. de ${sourceBank?.name || "Origem"} ${loops > 1 ? `(${i + 1}/${loops})` : ""}`,
            type: "CREDIT",
            linkedId: currentLinkedId,
            bankId: targetBankId,
            walletId: targetWalletId,
            exchangeRate,
            spread,
            iof,
            vet,
            originalValue: isMultiCurrency ? formData.value : undefined,
            originalCurrency: isMultiCurrency ? sourceBank.currency : undefined
          });
        } else {
          transactionsToSave.push({
            ...currentData,
            id: i === 0 ? id : "",
            linkedId: i === 0 ? refundLinkedId : undefined,
          });
        }
      }

      if (withDiscount && discountValue > 0) {
        // Cria a transação de desconto baseada na original
        const refund: Transaction = {
          ...formData,
          id: "", // Novo ID
          value: discountValue,
          type: formData.type === "DEBIT" ? "CREDIT" : "DEBIT",
          description: `Desconto: ${formData.description}`,
          linkedId: refundLinkedId,
          status: "PAID", // Descontos costumam ser considerados pagos imediatamente
        };
        transactionsToSave.push(refund);
      }

      await onSave(transactionsToSave);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar lançamento:", error);
      alert("Erro ao salvar lançamento. Tente novamente.");
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 disabled:bg-gray-50 disabled:text-gray-400";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex flex-col border-b border-gray-100 bg-gray-50">
          <div className="flex justify-between items-center p-6 pb-2">
            <h2 className="text-xl font-bold text-slate-800">
              {id ? "Editar Lançamento" : "Novo Lançamento"}
            </h2>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex px-6 gap-6">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setMode("DEFAULT")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${mode === "DEFAULT" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
            >
              Receita / Despesa
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setMode("TRANSFER");
                const cat = sortedCategories.find((c) =>
                  c.name.toLowerCase().includes("transferência"),
                );
                if (cat) setFormData((p) => ({ ...p, categoryId: cat.id }));
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${mode === "TRANSFER" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Transferência
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto bg-white flex-1 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data
              </label>
              <input
                type="date"
                required
                disabled={isSaving}
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <input
                type="text"
                disabled={isSaving}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className={inputClass}
                placeholder="Ex: Pagamento Fornecedor"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className={id ? "md:col-span-1" : "md:col-span-1"}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                disabled={isSaving}
                value={formatCurrencyInput(formData.value)}
                onChange={(e) => handleCurrencyInputChange(e, (v) => setFormData({ ...formData, value: v }))}
                className={inputClass}
              />
            </div>

            {/* Campos de Investimento (Quantidade e Preço Unitário) */}
            {(() => {
              const category = registries.categories.find(c => c.id === formData.categoryId);
              const participant = registries.participants.find(p => p.id === formData.participantId);
              const bank = registries.banks.find(b => b.id === formData.bankId);
              const isInvestmentBank = bank?.type === 'INVESTMENT';

              const isDividendOrTax = category?.name.toLowerCase() === 'proventos' || 
                                     category?.name.toLowerCase() === 'impostos s/ proventos';

              const isInvestment = !!participant?.category && isInvestmentBank && !isDividendOrTax;
              
              if (!isInvestment) return null;

              return (
                <>
                  <div className="md:col-span-1 animate-fade-in">
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      disabled={isSaving}
                      value={formData.quantity || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-blue-800 placeholder:text-blue-300"
                      placeholder="Ex: 100"
                    />
                  </div>
                  <div className="md:col-span-1 animate-fade-in">
                    <label className="block text-sm font-medium text-blue-700 mb-1">
                      Preço Unit. (R$)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      disabled={isSaving}
                      value={formData.unitPrice || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-blue-800 placeholder:text-blue-300"
                      placeholder="Ex: 10.50"
                    />
                  </div>
                </>
              );
            })()}

            {id && (
              <div className="md:col-span-1 animate-fade-in">
                <label className="block text-sm font-medium text-emerald-700 mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Desconto (R$)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isSaving}
                  value={formatCurrencyInput(discountValue)}
                  onChange={(e) => handleCurrencyInputChange(e, setDiscountValue)}
                  className="w-full px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-emerald-800 placeholder:text-emerald-300"
                  placeholder="Valor parcial..."
                />
              </div>
            )}
            {mode === "DEFAULT" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  disabled={isSaving}
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as any })
                  }
                  className={inputClass}
                >
                  <option value="DEBIT">Débito</option>
                  <option value="CREDIT">Crédito</option>
                </select>
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <span className="text-xs font-bold text-blue-600 uppercase bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex items-center gap-2">
                  <ArrowRightLeft className="w-3 h-3" /> Modo Transferência
                </span>
              </div>
            )}

            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isSaving}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={formData.status === "PAID"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.checked ? "PAID" : "PENDING",
                    })
                  }
                />
                <span className="text-sm font-medium text-gray-700">
                  Pago / Recebido
                </span>
              </label>

              {!id && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    checked={isRecurrent}
                    onChange={(e) => setIsRecurrent(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-purple-500" /> Repetir?
                  </span>
                </label>
              )}
            </div>

            <div className={mode === "TRANSFER" ? "invisible" : ""}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nº Doc
              </label>
              <input
                type="text"
                disabled={isSaving}
                value={formData.docNumber}
                onChange={(e) =>
                  setFormData({ ...formData, docNumber: e.target.value })
                }
                className={inputClass}
              />
            </div>
          </div>

          {isRecurrent && !id && (
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-purple-700 uppercase mb-1">
                  Frequência
                </label>
                <select
                  value={recurrenceFreq}
                  onChange={(e) => setRecurrenceFreq(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="MONTHLY">Mensal</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-purple-700 uppercase mb-1">
                  Quantidade (Parcelas)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="2"
                    max="360"
                    value={recurrenceCount}
                    onChange={(e) =>
                      setRecurrenceCount(parseInt(e.target.value) || 2)
                    }
                    className="w-24 px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                  <span className="text-xs text-purple-600 italic">vezes</span>
                </div>
              </div>
            </div>
          )}

          <div
            className={`grid grid-cols-1 gap-6 ${mode === "TRANSFER" ? "md:grid-cols-4" : "md:grid-cols-3"}`}
          >
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Carteira/Portfólio
              </label>
              <select
                required
                disabled={isSaving}
                value={formData.walletId}
                onChange={(e) =>
                  setFormData({ ...formData, walletId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {sortedWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                {mode === "TRANSFER" ? "Conta/Banco Origem" : "Conta/Banco"}
              </label>
              <select
                required
                disabled={isSaving}
                value={formData.bankId}
                onChange={(e) =>
                  setFormData({ ...formData, bankId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {sortedBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {mode === "TRANSFER" && (
              <>
                <div>
                  <label className="block text-xs font-bold text-blue-600 uppercase mb-1">
                    Carteira Destino
                  </label>
                  <select
                    required
                    disabled={isSaving}
                    value={targetWalletId}
                    onChange={(e) => setTargetWalletId(e.target.value)}
                    className={`${inputClass} border-blue-200 bg-blue-50/30`}
                  >
                    <option value="">Selecione...</option>
                    {sortedWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-600 uppercase mb-1">
                    Conta/Banco Destino
                  </label>
                  <select
                    required
                    disabled={isSaving}
                    value={targetBankId}
                    onChange={(e) => setTargetBankId(e.target.value)}
                    className={`${inputClass} border-blue-200 bg-blue-50/30`}
                  >
                    <option value="">Selecione...</option>
                    {sortedBanks.map((b) => (
                      <option
                        key={b.id}
                        value={b.id}
                        disabled={b.id === formData.bankId}
                      >
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {mode === "TRANSFER" && formData.bankId && targetBankId && (
            (() => {
              const sourceBank = registries.banks.find(b => b.id === formData.bankId);
              const targetBank = registries.banks.find(b => b.id === targetBankId);
              
              if (sourceBank && targetBank && sourceBank.currency !== targetBank.currency) {
                return (
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 animate-fade-in space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                      <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wider">Câmbio e Taxas ({sourceBank.currency} → {targetBank.currency})</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Cotação Comercial</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={exchangeRate || ''}
                          onChange={(e) => setExchangeRate(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: 5.15"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Spread (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={spread || ''}
                          onChange={(e) => setSpread(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: 1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-1">IOF (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={iof || ''}
                          onChange={(e) => setIof(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: 1.1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-blue-700 uppercase mb-1">VET (Final)</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={vet || ''}
                          onChange={(e) => setVet(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-blue-100 border border-blue-300 rounded-lg text-sm font-bold text-blue-800 outline-none"
                          placeholder="VET"
                        />
                      </div>
                    </div>

                    {vet > 0 && formData.value > 0 && (
                      <div className="pt-2 border-t border-blue-100 flex justify-between items-center">
                        <span className="text-xs text-blue-600 font-medium">Valor Estimado no Destino:</span>
                        <span className="text-lg font-bold text-blue-800">
                          {targetBank.currency} {(formData.value / vet).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()
          )}

          <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Participante
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={isSaving}
                  value={participantSearch}
                  onChange={(e) => {
                    setParticipantSearch(e.target.value);
                    setIsParticipantDropdownOpen(true);
                  }}
                  onFocus={() => setIsParticipantDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (!isParticipantDropdownOpen) {
                      if (e.key === "ArrowDown" || e.key === "Enter") {
                        setIsParticipantDropdownOpen(true);
                      }
                      return;
                    }
                
                    const showAddButton = deferredParticipantSearch.trim() && !exactMatchExists;
                    const showSimilar = !!similarParticipant;
                    
                    let itemsCount = filteredParticipants.length;
                    if (showAddButton) itemsCount += 1;
                    if (showSimilar) itemsCount += 1;
                
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedIndex((prev) => (prev < itemsCount - 1 ? prev + 1 : prev));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (focusedIndex === -1 && showAddButton) {
                        handleQuickAddParticipant(e as any);
                      } else if (focusedIndex >= 0) {
                        let currentIndex = focusedIndex;
                        if (showAddButton) {
                          if (currentIndex === 0) {
                            handleQuickAddParticipant(e as any);
                            return;
                          }
                          currentIndex -= 1;
                        }
                        if (showSimilar) {
                          if (currentIndex === 0) {
                            setFormData({ ...formData, participantId: similarParticipant!.id });
                            setParticipantSearch(similarParticipant!.name);
                            setIsParticipantDropdownOpen(false);
                            return;
                          }
                          currentIndex -= 1;
                        }
                        
                        const p = filteredParticipants[currentIndex];
                        if (p) {
                          setFormData({ ...formData, participantId: p.id });
                          setParticipantSearch(p.name);
                          setIsParticipantDropdownOpen(false);
                        }
                      }
                    } else if (e.key === "Escape") {
                      setIsParticipantDropdownOpen(false);
                    }
                  }}
                  className={`${inputClass} pr-10`}
                  placeholder="Buscar..."
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {participantSearch ? (
                    <User className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </div>
              </div>

              {isParticipantDropdownOpen && !isSaving && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden transform origin-top animate-fade-in">
                  {deferredParticipantSearch.trim() && !exactMatchExists && (
                      <button
                        type="button"
                        onClick={handleQuickAddParticipant}
                        className={`w-full text-left p-4 text-white font-bold flex items-center gap-2 transition-colors ${
                          focusedIndex === 0 ? "bg-blue-700 ring-2 ring-inset ring-white" : "bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        <Plus className="w-5 h-5" />
                        <span>Cadastrar Novo: "{deferredParticipantSearch}"</span>
                      </button>
                  )}

                  {similarParticipant && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, participantId: similarParticipant.id });
                          setParticipantSearch(similarParticipant.name);
                          setIsParticipantDropdownOpen(false);
                        }}
                        className={`w-full text-left p-3 bg-amber-50 text-amber-900 border-b border-amber-100 flex items-center gap-2 transition-colors ${
                          focusedIndex === (deferredParticipantSearch.trim() && !exactMatchExists ? 1 : 0) 
                            ? "bg-amber-100 ring-2 ring-inset ring-amber-500" 
                            : "hover:bg-amber-100"
                        }`}
                      >
                        <Search className="w-4 h-4 text-amber-600" />
                        <span className="text-sm">
                          Você quis dizer <strong>{similarParticipant.name}</strong>?
                        </span>
                      </button>
                  )}

                  <div className="py-1">
                    {filteredParticipants.length > 0 ? (
                      <List
                        height={Math.min(filteredParticipants.length * 56, 250)}
                        itemCount={filteredParticipants.length}
                        itemSize={56}
                        width="100%"
                        className="custom-scrollbar"
                      >
                        {({ index, style }) => {
                          const p = filteredParticipants[index];
                          const offset = (deferredParticipantSearch.trim() && !exactMatchExists ? 1 : 0) + (similarParticipant ? 1 : 0);
                          const isFocused = focusedIndex === index + offset;

                          return (
                            <button
                              style={style}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, participantId: p.id });
                                setParticipantSearch(p.name);
                                setIsParticipantDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${
                                index % 2 === 0 ? "bg-white" : "bg-slate-50"
                              } hover:bg-blue-50 hover:text-blue-700 ${
                                isFocused ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                                {p.name.substring(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium truncate">
                                <HighlightMatch text={p.name} search={deferredParticipantSearch} />
                              </span>
                            </button>
                          );
                        }}
                      </List>
                    ) : (
                      <div className="p-4 text-center text-gray-400 text-sm italic">
                        {deferredParticipantSearch.trim()
                          ? "Nenhum participante encontrado."
                          : "Nenhum participante cadastrado."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Categoria
              </label>
              <select
                required
                disabled={isSaving}
                value={formData.categoryId}
                onChange={(e) =>
                  setFormData({ ...formData, categoryId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {sortedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Centro de Custo
              </label>
              <select
                disabled={isSaving}
                value={formData.costCenterId}
                onChange={(e) =>
                  setFormData({ ...formData, costCenterId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {sortedCostCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>

          {id && mode === "DEFAULT" && (
            <button
              type="button"
              disabled={isSaving || discountValue <= 0}
              onClick={(e) => handleSubmit(e, true)}
              className="px-6 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium rounded-lg hover:bg-emerald-100 flex items-center gap-2 transition-colors disabled:opacity-50"
              title={discountValue > 0 ? `Salva as alterações e cria um desconto de R$ ${discountValue.toFixed(2)}` : "Digite um valor de desconto para usar esta opção"}
            >
              <RotateCcw className="w-4 h-4" />
              Salvar + Desconto
            </button>
          )}

          <button
            type="submit"
            disabled={isSaving}
            onClick={(e) => handleSubmit(e, false)}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 disabled:bg-blue-400"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving
              ? "Salvando..."
              : `Salvar ${isRecurrent && !id ? "Lançamentos" : "Lançamento"}`}
          </button>
        </div>
      </div>
    </div>
  );
};
