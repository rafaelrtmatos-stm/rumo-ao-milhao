import { Empreendimento, Cliente, Venda, AppConfig } from './types';

const STORAGE_KEYS = {
  EMPREENDIMENTOS: 'lotes_empreendimentos',
  CLIENTES: 'lotes_clientes',
  VENDAS: 'lotes_vendas',
  CONFIG: 'lotes_config',
};

export const storageService = {
  getEmpreendimentos: (): Empreendimento[] => {
    const data = localStorage.getItem(STORAGE_KEYS.EMPREENDIMENTOS);
    return data ? JSON.parse(data) : [];
  },
  saveEmpreendimentos: (data: Empreendimento[]) => {
    localStorage.setItem(STORAGE_KEYS.EMPREENDIMENTOS, JSON.stringify(data));
  },

  getClientes: (): Cliente[] => {
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTES);
    return data ? JSON.parse(data) : [];
  },
  saveClientes: (data: Cliente[]) => {
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(data));
  },

  getVendas: (): Venda[] => {
    const data = localStorage.getItem(STORAGE_KEYS.VENDAS);
    return data ? JSON.parse(data) : [];
  },
  saveVendas: (data: Venda[]) => {
    localStorage.setItem(STORAGE_KEYS.VENDAS, JSON.stringify(data));
  },

  getAppConfig: (): AppConfig => {
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (data) return JSON.parse(data);
    return {
      theme: 'standard'
    };
  },
  saveAppConfig: (data: AppConfig) => {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(data));
  },
};
