#!/bin/bash

# 🚀 Script de Deploy Completo - Supabase, Cloudflare e Railway
# Usage: ./scripts/deploy-all.sh [supabase|cloudflare|railway|all]

set -e

COLOR_RESET='\033[0m'
COLOR_BLUE='\033[0;34m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'

log_info() {
    echo -e "${COLOR_BLUE}ℹ️  $1${COLOR_RESET}"
}

log_success() {
    echo -e "${COLOR_GREEN}✅ $1${COLOR_RESET}"
}

log_warning() {
    echo -e "${COLOR_YELLOW}⚠️  $1${COLOR_RESET}"
}

log_error() {
    echo -e "${COLOR_RED}❌ $1${COLOR_RESET}"
}

# ============================================================
# SUPABASE DEPLOYMENT
# ============================================================
deploy_supabase() {
    log_info "Iniciando deployment no Supabase..."

    # Verificar se Supabase CLI está instalado
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI não encontrado. Instale com: npm install -g supabase"
        return 1
    fi

    # Verificar se tem token
    if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
        log_warning "SUPABASE_ACCESS_TOKEN não está configurado"
        log_info "Para fazer deploy, você precisa:"
        log_info "1. Gerar token em: https://app.supabase.com/account/tokens"
        log_info "2. Executar: export SUPABASE_ACCESS_TOKEN='seu_token'"
        log_info "3. Depois: ./scripts/deploy-all.sh supabase"
        return 1
    fi

    log_info "Verificando conexão com projeto Supabase..."
    supabase status || {
        log_warning "Projeto não está linkado. Fazendo link..."
        supabase link --project-ref sccizjlpwezsgaxkclot
    }

    log_info "Fazendo push das migrations..."
    supabase db push

    log_info "Deployando edge functions..."
    supabase functions deploy

    log_success "Supabase deployment completo!"
}

# ============================================================
# CLOUDFLARE DEPLOYMENT
# ============================================================
deploy_cloudflare() {
    log_info "Iniciando deployment no Cloudflare..."

    # Verificar se Wrangler está instalado
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler não encontrado. Instale com: npm install -g wrangler"
        return 1
    fi

    # Verificar se está autenticado
    if ! wrangler whoami &> /dev/null; then
        log_warning "Não autenticado no Cloudflare"
        log_info "Execute: wrangler login"
        return 1
    fi

    log_info "Building para Cloudflare..."
    npm run build:cloudflare

    log_info "Deployando no Cloudflare..."
    npx wrangler deploy

    log_success "Cloudflare deployment completo!"
    log_info "Acesse: https://vertal.dev"
}

# ============================================================
# RAILWAY DEPLOYMENT
# ============================================================
deploy_railway() {
    log_info "Iniciando deployment no Railway..."

    # Verificar se Railway CLI está instalado
    if ! command -v railway &> /dev/null; then
        log_warning "Railway CLI não encontrado"
        log_info "Instale com: npm install -g @railway/cli"
        log_info "Ou: curl -fsSL railway.app/install.sh | bash"
        return 1
    fi

    # Verificar se está autenticado
    if ! railway whoami &> /dev/null; then
        log_warning "Não autenticado no Railway"
        log_info "Execute: railway login"
        return 1
    fi

    log_info "Verificando conexão com projeto Railway..."
    railway status || {
        log_warning "Projeto não está linkado"
        log_info "Crie um novo projeto via: https://railway.app/dashboard"
        log_info "E faça link com: railway link"
        return 1
    }

    log_info "Building para Railway..."
    npm run build

    log_info "Deployando no Railway..."
    railway up

    log_success "Railway deployment completo!"
}

# ============================================================
# DEPLOYMENT COMPLETO
# ============================================================
deploy_all() {
    log_info "🚀 Iniciando deployment completo em todas as plataformas..."

    FAILED=0

    # Supabase
    if deploy_supabase; then
        log_success "✅ Supabase OK"
    else
        log_warning "⚠️  Supabase falhou ou pulado"
        FAILED=$((FAILED + 1))
    fi

    echo ""

    # Cloudflare
    if deploy_cloudflare; then
        log_success "✅ Cloudflare OK"
    else
        log_warning "⚠️  Cloudflare falhou ou pulado"
        FAILED=$((FAILED + 1))
    fi

    echo ""

    # Railway
    if deploy_railway; then
        log_success "✅ Railway OK"
    else
        log_warning "⚠️  Railway falhou ou pulado"
        FAILED=$((FAILED + 1))
    fi

    echo ""
    echo "================================================"
    if [ $FAILED -eq 0 ]; then
        log_success "🎉 Deployment completo com sucesso!"
        log_info "Aplicação está rodando em:"
        log_info "  • Frontend: https://vertal.dev"
        log_info "  • API: Supabase + Cloudflare Workers"
        log_info "  • Backend: Railway (se configurado)"
    else
        log_warning "⚠️  Alguns deployments falharam ($FAILED plataformas)"
        log_info "Veja os erros acima e tente novamente"
    fi
    echo "================================================"
}

# ============================================================
# MAIN
# ============================================================
DEPLOY_TARGET="${1:-all}"

case "$DEPLOY_TARGET" in
    supabase)
        deploy_supabase
        ;;
    cloudflare)
        deploy_cloudflare
        ;;
    railway)
        deploy_railway
        ;;
    all)
        deploy_all
        ;;
    *)
        log_error "Uso: $0 [supabase|cloudflare|railway|all]"
        exit 1
        ;;
esac
