# Atomic CRM — aviso de licença (MIT)

Partes do **Vertal CRM** (modelo de dados, status de contato, tipos de tarefa, agrupamento e reordenação do Kanban,
formato CSV de importação/exportação e a organização das telas de contato/negócio/painel) foram adaptadas do
**Atomic CRM**, de Marmelab: https://github.com/marmelab/atomic-crm (commit `bfcb138bd549b03fa7c4a8c03c8212b6fd08b8bf`).

Arquivos com código adaptado:
- `supabase/functions/_shared/vertalCrm/core.ts`
- `supabase/migrations/20261125160000_vertal_crm.sql`
- `src/components/vertal-crm/*` (esta pasta)

Mudanças principais: multi-tenant por workspace com RLS, vários funis com etapas personalizadas, React 18 + shadcn/ui
do Vertal Dev sem react-admin, @dnd-kit no lugar de @hello-pangea/dnd, IA cobrada por crédito, textos pt-BR/en/es.

Texto original da licença:

The MIT License (MIT)

Copyright (c) 2024-present, Francois Zaninotto, Marmelab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
