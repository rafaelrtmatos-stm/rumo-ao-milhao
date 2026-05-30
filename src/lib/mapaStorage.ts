/**
 * mapaStorage.ts
 * Upload binário de mapas para Supabase Storage.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const BUCKET = 'mapas';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Comprime imagem para WEBP e faz upload binário. Retorna URL pública. */
export async function uploadMapaImagem(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);

  // 1. Converter para WEBP comprimido
  const webpBlob = await comprimirParaWebP(file, 0.82);
  onProgress?.(40);

  // 2. Garantir que é um File com tipo correto
  const webpFile = new File([webpBlob], `mapa.webp`, { type: 'image/webp' });
  const nome = `${empreendimentoId}_${Date.now()}.webp`;

  // 3. Tentar upload direto
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nome, webpFile, {
      contentType: 'image/webp',
      upsert: true,
      duplex: 'half',
    } as any);

  if (!error) {
    onProgress?.(90);
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nome);
    onProgress?.(100);
    return urlData.publicUrl;
  }

  console.warn('[storage] Upload direto falhou:', error.message, '— tentando com path de usuário');

  // 4. Fallback: tentar com userId no path
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || 'shared';
  const nomeAlt = `${userId}/${nome}`;

  const { error: error2 } = await supabase.storage
    .from(BUCKET)
    .upload(nomeAlt, webpFile, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (!error2) {
    onProgress?.(90);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeAlt);
    onProgress?.(100);
    return data.publicUrl;
  }

  // 5. Último fallback: base64 (funciona sem storage)
  console.warn('[storage] Upload WEBP falhou, usando base64:', error2.message);
  onProgress?.(70);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new Error('Falha ao ler imagem: ' + error2.message));
    reader.readAsDataURL(webpFile);
  });
}

/** Comprime File para WEBP via Canvas. */
async function comprimirParaWebP(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX = 4000;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob falhou')),
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

/** Upload de PDF — armazena binário, retorna URL. */
export async function uploadMapaPDF(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);
  const nome = `${empreendimentoId}_${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nome, file, { contentType: 'application/pdf', upsert: true });

  if (!error) {
    onProgress?.(90);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
    onProgress?.(100);
    return data.publicUrl;
  }

  // Fallback com userId
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || 'shared';
  const nomeAlt = `${userId}/${nome}`;
  const { error: error2 } = await supabase.storage
    .from(BUCKET)
    .upload(nomeAlt, file, { contentType: 'application/pdf', upsert: true });

  if (!error2) {
    onProgress?.(90);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeAlt);
    onProgress?.(100);
    return data.publicUrl;
  }

  // Último fallback: base64
  console.warn('[storage] Upload PDF falhou, usando base64:', error2.message);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler PDF: ' + error2.message));
    reader.readAsDataURL(file);
  });
}

/** Pré-cacheia a URL no Service Worker para acesso offline imediato. */
export function precacheMapaUrl(url: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_URL', url });
  }
}
