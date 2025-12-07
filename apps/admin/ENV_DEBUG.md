# Como Verificar se Variáveis de Ambiente Estão Disponíveis Durante o Build

## 🔍 Verificação no Vercel

### 1. Verificar no Dashboard do Vercel

1. Acesse: **Vercel Dashboard → Seu Projeto → Settings → Environment Variables**
2. Procure por `VITE_API_URL`
3. **IMPORTANTE**: Verifique se está marcado para:
   - ✅ **Production** 
   - ✅ **Preview**
   - ✅ **Development**

### 2. Verificar se está disponível durante BUILD

No Vercel, variáveis podem estar disponíveis em:
- **Build Time**: Disponível durante `vercel build` (necessário para Vite substituir `import.meta.env`)
- **Runtime**: Disponível apenas quando a aplicação está rodando

**Para verificar:**
1. Na página de Environment Variables, clique em `VITE_API_URL`
2. Veja se há uma opção "Available during Build" ou similar
3. Se não houver essa opção, a variável está disponível em ambos por padrão

### 3. Verificar nos Logs de Build

Após fazer deploy, verifique os logs:
1. Vá em **Deployments → Seu Deploy → Build Logs**
2. Procure por `[BUILD]` nos logs
3. O script `check-env.js` mostrará se `VITE_API_URL` está disponível

## 🔍 Verificação no Infisical

### 1. Verificar Integração

1. Acesse: **Infisical Dashboard → Integrations → Vercel**
2. Verifique se a integração está ativa
3. Verifique se o projeto correto está conectado

### 2. Verificar Sincronização

1. No Infisical, vá para o seu projeto
2. Verifique se `VITE_API_URL` existe no ambiente correto (Development/Staging/Production)
3. **IMPORTANTE**: Infisical pode não expor variáveis durante o BUILD por padrão

### 3. Limitação do Infisical

⚠️ **Problema conhecido**: Infisical pode sincronizar variáveis apenas para **Runtime**, não para **Build Time**.

**Solução**: 
- Configure a variável diretamente no Vercel (não apenas via Infisical)
- Ou configure o Infisical para expor durante o build (se suportado)

## 🧪 Teste Local

Para testar se as variáveis estão disponíveis durante o build:

```bash
# No diretório apps/admin
VITE_API_URL=https://sua-api.com bun run build
```

Se funcionar localmente mas não no Vercel, o problema é a configuração do Vercel/Infisical.

## 📊 Script de Debug

O script `scripts/check-env.js` roda automaticamente antes do build e mostra:
- ✅ Quais variáveis estão disponíveis
- ❌ Quais estão faltando
- 📋 Todas as variáveis `VITE_*` encontradas
- 🌐 Informações do Vercel

## 🔧 Solução Rápida

Se as variáveis não estão disponíveis durante o build:

1. **Opção 1**: Configure diretamente no Vercel (não via Infisical)
   - Vercel Dashboard → Settings → Environment Variables
   - Adicione `VITE_API_URL` manualmente
   - Marque para Production, Preview, Development

2. **Opção 2**: Use variável sem prefixo `VITE_` para server-side
   - Crie `API_URL` (sem VITE_)
   - Use no servidor via `process.env.API_URL`
   - Mantenha `VITE_API_URL` apenas para client-side

3. **Opção 3**: Injete via runtime usando Nitro
   - Use `runtimeConfig` do Nitro
   - Injete via SSR (já implementado no código)
