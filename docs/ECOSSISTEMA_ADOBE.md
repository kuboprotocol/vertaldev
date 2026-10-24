# Referência: ecossistema Adobe Creative Cloud

Documento de referência interno. Não aparece na interface do Vertal: o painel Design Premium usa
somente ferramentas gratuitas (ver `src/components/creative/FreeCreativeTools.tsx`).

## Apps de referência

| Categoria | App | Para que serve | Site oficial |
|---|---|---|---|
| Design | Adobe Express | Posts, stories e banners prontos para publicar | https://express.adobe.com |
| Design | Photoshop | Edição em camadas, máscaras e retoque | https://www.adobe.com/products/photoshop.html |
| Design | Illustrator | Vetores, logotipos e ícones | https://www.adobe.com/products/illustrator.html |
| Design | InDesign | Diagramação de páginas, e-books e catálogos | https://www.adobe.com/products/indesign.html |
| Design | Fresco | Pintura digital e desenho | https://www.adobe.com/products/fresco.html |
| Foto | Lightroom | Organização e ajuste de cor em lotes | https://www.adobe.com/products/photoshop-lightroom.html |
| IA generativa | Firefly | Geração de imagens e efeitos de texto com IA | https://firefly.adobe.com |
| Vídeo e motion | Premiere Pro | Edição de vídeo em linha do tempo | https://www.adobe.com/products/premiere.html |
| Vídeo e motion | After Effects | Motion graphics e títulos animados | https://www.adobe.com/products/aftereffects.html |
| Vídeo e motion | Audition | Edição e restauração de áudio | https://www.adobe.com/products/audition.html |
| Documentos | Acrobat | Criação, edição e assinatura de PDF | https://www.adobe.com/acrobat.html |
| Recursos | Adobe Fonts | Biblioteca de fontes licenciadas | https://fonts.adobe.com |
| Recursos | Adobe Stock | Fotos, vetores, vídeos e modelos licenciados | https://stock.adobe.com |
| Recursos | Behance | Portfólio e vitrine de trabalhos criativos | https://www.behance.net |

## Fluxo de produção de referência

1. Montar a arte no editor manual do Vertal.
2. Gerar variações com a IA do painel.
3. Refinar cor e retoque no Express ou no Photoshop.
4. Vetorizar logotipos e ícones no Illustrator.
5. Animar no After Effects para stories e reels.
6. Entregar em PDF pelo Acrobat.

## Integração

Não há integração por API com a Adobe. Serviços como o Firefly Services exigem credenciais de
desenvolvedor da Adobe e devem ser chamados por uma edge function do Supabase, nunca pelo front.
