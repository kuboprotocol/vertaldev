---
title: "Scanner de documentos para PDF no navegador — digitalize papéis sem nuvem | Vertal"
description: "Scanner de documentos no Vertal: transforme fotos de contratos, recibos e cartas em PDF nítido, com recorte de perspectiva e filtro preto e branco. PDF por 4 créditos. Processa no seu navegador, sem enviar a imagem para a nuvem."
keywords: "scanner de documentos, escanear documento, digitalizar documento, foto para PDF, scanner offline, scanner sem nuvem, app de scanner, alternativa Microsoft Lens, escanear no celular, PDF de foto, scanner privado, MakeACopy, Vertal"
---

# Scanner de documentos para PDF, direto no navegador

O **Scanner de documentos** do Vertal transforma fotos de papel em um PDF limpo e legível. Você fotografa o documento com o celular ou envia uma imagem do computador, ajusta os cantos da folha, escolhe o filtro e baixa o PDF. A foto não sai do seu aparelho.

Ele vive no **Painel Criativo** do Vertal Chat. Você pode abri-lo pelo menu de painéis ou pedir no chat: "escaneie este documento".

> **Créditos:** a ideia e o fluxo de digitalização vêm do [MakeACopy](https://github.com/egdels/makeacopy), um scanner de documentos open source para Android (licença Apache-2.0) que funciona offline, feito por egdels. O Vertal reescreveu esses conceitos em TypeScript para rodar no navegador. Nenhum código do app Android foi copiado.

## Para que serve

- Digitalizar **contratos, recibos, notas fiscais, cartas e formulários** com a câmera do celular.
- Fazer um **PDF a partir de fotos** em poucos toques, com várias páginas.
- Substituir apps de scanner que exigem conta ou enviam seus documentos para a nuvem.
- Ter uma alternativa ao Microsoft Lens, que foi descontinuado, sem enviar o documento para a nuvem.

## Como usar

1. Abra o Vertal Chat e clique em **Scanner de documentos** no painel criativo (ou peça no chat).
2. Toque em **Adicionar foto** e fotografe o papel, ou escolha uma imagem salva.
3. Arraste os **quatro cantos** até a borda da folha.
4. Escolha o filtro: **P&B (texto)** para documentos escritos, **Cinza** para manter sombras e fotos, ou **Colorida** sem filtro.
5. Toque em **Confirmar página**. Repita para as demais páginas.
6. Toque em **Exportar PDF**. O arquivo `documento-escaneado-AAAA-MM-DD.pdf` é baixado.

## Android, iPhone, iPad e Mac

O mesmo scanner roda em todas as plataformas. A diferença está em como a foto entra e como o PDF sai.

| Plataforma | Como entra a foto | Como sai o PDF | Como acessar |
|---|---|---|---|
| **Android** | Câmera ou galeria, pelo seletor do sistema | Painel "Compartilhar" (Arquivos, Drive, e-mail, impressão) | App nativo Vertal (Capacitor) ou `/scanner` no navegador |
| **iPhone e iPad** | Câmera ou galeria, pelo seletor do sistema | Painel "Compartilhar" (Arquivos, iCloud Drive, Mail, impressão) | App nativo Vertal (Capacitor) ou `/scanner` no Safari |
| **Mac** | Arquivo de imagem (ou câmera do Mac, se o navegador permitir) | Download pelo navegador | `/scanner` no Safari ou Chrome, ou instalado como app pela opção de PWA |
| **Windows e Linux** | Arquivo de imagem | Download pelo navegador | `/scanner` no navegador |

Na web, o botão de adicionar foto abre o seletor de arquivos. No app nativo aparecem dois botões: **Fotografar** (câmera) e **Galeria**.

### Gerar os apps nativos

O projeto usa Capacitor. As pastas `android/` e `ios/` são geradas e não ficam versionadas:

```bash
npm install
npm run build
npx cap add android   # uma vez
npx cap add ios       # uma vez (requer macOS e Xcode)
npx cap sync
npx cap run android   # ou: npx cap open ios
```

Plugins usados pelo scanner: `@capacitor/camera`, `@capacitor/filesystem` e `@capacitor/share`.

### Permissões

- **iOS:** o `Info.plist` precisa de `NSCameraUsageDescription` (texto mostrado ao pedir a câmera) e de `NSPhotoLibraryUsageDescription` (galeria). Sem eles, o iOS fecha o app ao tocar em Fotografar.
- **Android:** nenhuma permissão extra. A câmera abre pelo app do sistema e a galeria pelo seletor de fotos.

### Mac: por que não há app nativo

O Capacitor gera apps para Android e iOS, não para Mac. Hoje o caminho é o navegador ou o app instalado como PWA. Um app do Mac pela tecnologia do iPad (Mac Catalyst, via Xcode) é possível a partir do projeto iOS, mas não está configurado nem testado.

## Privacidade: o documento não sai do aparelho

- O recorte em perspectiva, o filtro e a montagem do PDF rodam **no seu navegador**.
- A imagem não é enviada para nenhum servidor do Vertal durante a digitalização.
- Nada de telemetria ou rastreamento na digitalização.

## Créditos

A exportação cobra **4 créditos** do seu saldo, via a função `scanner-export`. O preço fica em `supabase/functions/_shared/scanner.ts` e é o mesmo que o painel mostra no botão. Se faltar saldo, o PDF não é entregue e a mensagem explica o motivo. Fazer a exportação exige entrar na conta, então a página `/scanner` pede login ao salvar.

## Limites desta versão

- Os cantos são **ajustados à mão**. A detecção automática de bordas ainda não existe no Vertal.
- **Ainda não há OCR**: o PDF guarda a imagem, mas o texto não é pesquisável. Esse é o próximo passo.
- Fotos muito grandes são reduzidas para 2400 px no maior lado, para não travar o aparelho.

## Perguntas frequentes

**Quanto custa?**
4 créditos por PDF exportado. Ajustar cantos, trocar o filtro e adicionar páginas não cobra nada; o débito acontece uma vez, quando você salva o PDF. Sem saldo, o PDF não é gerado.

**Funciona offline?**
O recorte e o filtro rodam no aparelho. Salvar o PDF exige conexão e conta, porque a cobrança de 4 créditos é feita no servidor.

**Serve para escanear no celular?**
Sim. No Android e no iPhone, o app nativo abre a câmera ou a galeria. No navegador do celular, o botão de foto abre a câmera traseira.

**Qual a diferença para o Microsoft Lens?**
O Lens usa a nuvem da Microsoft para parte do processamento. Aqui a imagem fica no seu aparelho, e o código é de um projeto open source auditável.

**Posso digitalizar várias páginas num único PDF?**
Sim. Adicione quantas fotos quiser; cada uma vira uma página A4 no PDF final.

## Veja também

- [Vertal Office](VERTAL_OFFICE.md): edite e organize documentos depois de escaneá-los.
