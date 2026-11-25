# Licenças de terceiros (Vertal Agentes e Vertal Fluxos)

> Documento interno do Vertal Dev. **Não** existe entrada para isto na interface:
> para o usuário, os produtos se chamam **Vertal Agentes** e **Vertal Fluxos**
> (ver "Marca branca" em [HUGINN.md](./HUGINN.md)).

O Vertal Agentes e o Vertal Fluxos rodam sobre dois projetos de código aberto.
O Vertal Chat conversa com cada instância pela API HTTP (`creative-router`,
ferramentas `huginn` e `automatisch`); nenhum código desses projetos é copiado
para este repositório.

## Vertal Agentes → Huginn

- Projeto: Huginn — https://github.com/huginn/huginn
- Licença: **MIT**
- Aviso de copyright (deve acompanhar cópias ou partes substanciais do software):

```
The MIT License

Copyright (c) 2013, Andrew Cantino (Iteration Labs, LLC)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

A MIT permite renomear o produto para o usuário final. O aviso acima precisa
continuar junto do código e das imagens implantadas da instância (o repositório
de origem e o container já o trazem; não remova o arquivo `LICENSE`).

## Vertal Fluxos → Automatisch (Community Edition)

- Projeto: Automatisch — https://github.com/automatisch/automatisch
- Licença: **GNU AGPL-3.0** (Community Edition). Arquivos com `.ee.` no nome são
  da Enterprise Edition, sob licença comercial própria: **não** use nem
  habilite recursos EE sem contrato.
- Texto da licença: https://www.gnu.org/licenses/agpl-3.0.html
  (e `LICENSE.agpl` no repositório do projeto).

### Uso em rede (AGPL-3.0, seção 13) — oferta de código-fonte

A AGPL estende a obrigação de fornecer o código-fonte a quem usa o programa
**pela rede**. Na prática, para o Vertal Fluxos:

1. **Instância sem modificações** (imagem oficial, só configurada por variáveis
   de ambiente): basta manter os avisos de licença e copyright do projeto. O
   código-fonte correspondente é o do repositório oficial na versão implantada.
2. **Instância modificada** (qualquer patch no código do Automatisch, inclusive
   tema, textos ou marca dentro da própria interface do Automatisch): é
   obrigatório oferecer a **todos os usuários que interagem com ela pela rede**
   o código-fonte correspondente da versão modificada, sob a AGPL-3.0, de graça
   e por um meio usual (por exemplo, um repositório público com o fork exato que
   está no ar). Mantenha esse fork publicado e com a tag da versão implantada.
3. O Vertal Chat e o painel de agentes são programas separados que só chamam a
   API HTTP da instância; o código deles não passa a ser AGPL por isso. Não copie
   código do Automatisch para este repositório.
4. Registre aqui o link do código-fonte sempre que uma instância modificada for
   ao ar:
   - Código-fonte da instância do Vertal Fluxos: _(sem modificações até agora)_

> Este resumo não é parecer jurídico. Antes de alterar o código do Automatisch
> ou de expor a interface dele diretamente aos clientes, valide com o jurídico.

## Marca

"Huginn" e "Automatisch" são nomes dos respectivos projetos. Na interface do
Vertal eles não aparecem (regra de marca branca); nesta documentação, aparecem
apenas para cumprir as licenças e orientar a equipe.

## Vertal CRM → Atomic CRM (MIT)

O Vertal CRM adapta código do Atomic CRM (Marmelab, MIT): modelo de dados, Kanban, CSV e organização das telas.
Aviso completo em `src/components/vertal-crm/LICENSE.atomic-crm.md` e em `THIRD_PARTY_NOTICES.md`. Na interface: só “Vertal CRM”.
