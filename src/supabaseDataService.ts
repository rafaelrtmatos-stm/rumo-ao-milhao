import { supabase } from './supabaseClient';
import { Empreendimento, Cliente, Venda, AppConfig } from './types';

const TABLE = 'user_app_data';

async function getData<T>(key: string, defaultValue: T): Promise<T> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return defaultValue;

  const { data, error } = await supabase
    .from(TABLE)
    .select('data_value')
    .eq('user_id', user.id)
    .eq('data_key', key)
    .maybeSingle();

  if (error || !data) return defaultValue;
  return data.data_value as T;
}

async function setData<T>(key: string, value: T): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: user.id,
        data_key: key,
        data_value: value as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,data_key' }
    );

  if (error) throw error;
}

function createSubscription<T>(
  key: string,
  callback: (data: T) => void,
) {
  const channel = supabase
    .channel(`app_data_${key}_${Date.now()}`)
    .on(
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `data_key=eq.${key}`,
      },
      (payload: any) => {
        if (payload.new?.data_value !== undefined) {
          callback(payload.new.data_value as T);
        }
      }
    )
    .subscribe();

  return { unsubscribe: () => supabase.removeChannel(channel) };
}

export const supabaseDataService = {
  async getEmpreendimentos(): Promise<Empreendimento[]> {
    return getData<Empreendimento[]>('empreendimentos', []);
  },
  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    await setData('empreendimentos', items);
  },

  async getClientes(): Promise<Cliente[]> {
    return getData<Cliente[]>('clientes', []);
  },
  async saveClientes(items: Cliente[]): Promise<void> {
    await setData('clientes', items);
  },

  async getVendas(): Promise<Venda[]> {
    return getData<Venda[]>('vendas', []);
  },
  async saveVendas(items: Venda[]): Promise<void> {
    await setData('vendas', items);
  },

  async getAppConfig(): Promise<AppConfig> {
    return getData<AppConfig>('config', { theme: 'standard', vendedores: [] });
  },
  async saveAppConfig(config: AppConfig): Promise<void> {
    await setData('config', config);
  },

  subscribeToEmpreendimentos(cb: (d: Empreendimento[]) => void) {
    return createSubscription<Empreendimento[]>('empreendimentos', cb);
  },
  subscribeToClientes(cb: (d: Cliente[]) => void) {
    return createSubscription<Cliente[]>('clientes', cb);
  },
  subscribeToVendas(cb: (d: Venda[]) => void) {
    return createSubscription<Venda[]>('vendas', cb);
  },
};
