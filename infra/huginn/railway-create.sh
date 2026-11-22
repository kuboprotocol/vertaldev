#!/usr/bin/env bash
# Cria Postgres + Huginn num projeto do Railway pela API GraphQL (backboard.railway.com).
# Uso: RAILWAY_API_TOKEN=... PROJECT_ID=... ENVIRONMENT_ID=... SEED_EMAIL=... ./railway-create.sh
# Gera e imprime SÓ o usuário admin; a senha fica em ./huginn-admin.secret (chmod 600). Apague depois de salvar no Cofre.
set -euo pipefail
: "${RAILWAY_API_TOKEN:?}" "${PROJECT_ID:?}" "${ENVIRONMENT_ID:?}" "${SEED_EMAIL:?}"
gql() { curl -fsS https://backboard.railway.com/graphql/v2 -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H 'Content-Type: application/json' -d "$1"; }
umask 077
PG_PASSWORD=$(openssl rand -hex 24)
APP_SECRET_TOKEN=$(openssl rand -hex 64)
SEED_USERNAME="admin_$(openssl rand -hex 3)"
SEED_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')
INVITATION_CODE=$(openssl rand -hex 12)
printf 'SEED_USERNAME=%s\nSEED_PASSWORD=%s\n' "$SEED_USERNAME" "$SEED_PASSWORD" > huginn-admin.secret

PG=$(gql "$(jq -nc --arg p "$PROJECT_ID" --arg e "$ENVIRONMENT_ID" --arg pw "$PG_PASSWORD" '{query:"mutation($i:ServiceCreateInput!){serviceCreate(input:$i){id}}",variables:{i:{projectId:$p,environmentId:$e,name:"huginn-postgres",source:{image:"ghcr.io/railwayapp-templates/postgres-ssl:18"},variables:{POSTGRES_DB:"huginn",POSTGRES_USER:"huginn",POSTGRES_PASSWORD:$pw,PGDATA:"/var/lib/postgresql/data/pgdata",PGPORT:"5432",PGUSER:"${{POSTGRES_USER}}",PGPASSWORD:"${{POSTGRES_PASSWORD}}",PGDATABASE:"${{POSTGRES_DB}}",PGHOST:"${{RAILWAY_PRIVATE_DOMAIN}}",DATABASE_URL:"postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}",SSL_CERT_DAYS:"820"}}}}')" | jq -r .data.serviceCreate.id)
gql "$(jq -nc --arg p "$PROJECT_ID" --arg e "$ENVIRONMENT_ID" --arg s "$PG" '{query:"mutation($i:VolumeCreateInput!){volumeCreate(input:$i){id}}",variables:{i:{projectId:$p,environmentId:$e,serviceId:$s,mountPath:"/var/lib/postgresql/data"}}}')" >/dev/null

HG=$(gql "$(jq -nc --arg p "$PROJECT_ID" --arg e "$ENVIRONMENT_ID" --arg ast "$APP_SECRET_TOKEN" --arg su "$SEED_USERNAME" --arg sp "$SEED_PASSWORD" --arg se "$SEED_EMAIL" --arg ic "$INVITATION_CODE" '{query:"mutation($i:ServiceCreateInput!){serviceCreate(input:$i){id}}",variables:{i:{projectId:$p,environmentId:$e,name:"huginn",source:{image:"ghcr.io/huginn/huginn"},variables:{DATABASE_URL:"${{huginn-postgres.DATABASE_URL}}",DATABASE_ADAPTER:"postgresql",APP_SECRET_TOKEN:$ast,DOMAIN:"${{RAILWAY_PUBLIC_DOMAIN}}",FORCE_SSL:"true",PORT:"3000",INVITATION_CODE:$ic,SEED_USERNAME:$su,SEED_PASSWORD:$sp,SEED_EMAIL:$se,TIMEZONE:"Brasilia",REQUIRE_CONFIRMED_EMAIL:"false",WEB_CONCURRENCY:"1",RAILS_MAX_THREADS:"3",DELAYED_JOB_MAX_MEMORY:"384",RAILS_LOG_TO_STDOUT:"true",START_SMOKESCREEN:"true"}}}}')" | jq -r .data.serviceCreate.id)
DOMAIN=$(gql "$(jq -nc --arg e "$ENVIRONMENT_ID" --arg s "$HG" '{query:"mutation($i:ServiceDomainCreateInput!){serviceDomainCreate(input:$i){domain}}",variables:{i:{serviceId:$s,environmentId:$e,targetPort:3000}}}')" | jq -r .data.serviceDomainCreate.domain)
# O domínio é criado depois do 1º deploy: redeploy para o DOMAIN apontar para ele.
gql "$(jq -nc --arg e "$ENVIRONMENT_ID" --arg s "$HG" '{query:"mutation($s:String!,$e:String!){serviceInstanceRedeploy(serviceId:$s,environmentId:$e)}",variables:{s:$s,e:$e}}')" >/dev/null
echo "Huginn: https://$DOMAIN  (admin: $SEED_USERNAME; senha em ./huginn-admin.secret)"
