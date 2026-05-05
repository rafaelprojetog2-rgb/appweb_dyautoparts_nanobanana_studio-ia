// ============================================================
// CONFIGURAR: Substitua pelos valores do seu projeto Supabase
// ============================================================
const SUPABASE_URL = 'https://ccpxhbvmmabrttqsmqaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcHhoYnZtbWFicnR0cXNtcWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjU5ODIsImV4cCI6MjA5MjA0MTk4Mn0.0cAmazh1Yv_Nj5ISxBPHrdDq7Gk2R29BJIGI8PXji7A';
// ============================================================

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[Supabase] Client inicializado com URL:', SUPABASE_URL);

function getStoragePath(file, tipo = 'imagem') {
    const name = file.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]/g, '');
    
    const timestamp = Date.now();
    
    if (tipo === 'kit') {
        return `produtos/kits/${timestamp}-${name}`;
    }
    if (tipo === 'manual') {
        return `produtos/manuais/${timestamp}-${name}`;
    }
    return `produtos/imagens/${timestamp}-${name}`;
}

async function uploadFile(file, tipo = 'imagem') {
    const supabase = window.supabaseClient;
    
    if (!file) return null;
    
    const path = getStoragePath(file, tipo);
    console.log('[UPLOAD] Path:', path);
    
    const { data, error } = await supabase
        .storage
        .from('assets')
        .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type
        });
    
    if (error) {
        console.error('[UPLOAD] Erro:', error);
        throw new Error('Erro ao enviar arquivo: ' + error.message);
    }
    
    console.log('[UPLOAD] Sucesso:', data.path);
    return data.path;
}

function getPublicUrl(path) {
    if (!path) return null;
    
    const { data } = window.supabaseClient
        .storage
        .from('assets')
        .getPublicUrl(path);
    
    console.log('[URL] Publica:', data.publicUrl);
    return data.publicUrl;
}

async function deleteFile(path) {
    if (!path) return;
    
    const supabase = window.supabaseClient;
    
    console.log('[DELETE FILE] Tentando remover:', path);
    
    const { error } = await supabase
        .storage
        .from('assets')
        .remove([path]);
    
    if (error) {
        console.error('[DELETE FILE] Erro:', error);
    } else {
        console.log('[DELETE FILE] Removido com sucesso:', path);
    }
}