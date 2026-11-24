---
title: "Scanner de documentos para PDF no navegador — digitalize papéis sem nuvem | Vertal"
description: "Scanner de documentos gratuito no Vertal: transforme fotos de contratos, recibos e cartas em PDF nítido, com recorte automático de bordas e filtro preto e branco. Processa no seu navegador, sem enviar a imagem para a nuvem."
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
- Ter uma alternativa **gratuita** ao Microsoft Lens, que foi descontinuado.

## Como usar

1. Abra o Vertal Chat e clique em **Scanner de documentos** no painel criativo (ou peça no chat).
2. Toque em **Adicionar foto** e fotografe o papel, ou escolha uma imagem salva.
3. Arraste os **quatro cantos** até a borda da folha.
4. Escolha o filtro: **P&B (texto)** para documentos escritos, **Cinza** para manter sombras e fotos, ou **Colorida** sem filtro.
5. Toque em **Confirmar página**. Repita para as demais páginas.
6. Toque em **Exportar PDF**. O arquivo `documento-escaneado-AAAA-MM-DD.pdf` é baixado.

## Privacidade: o documento não sai do aparelho

- O recorte em perspectiva, o filtro e a montagem do PDF rodam **no seu navegador**.
- A imagem não é enviada para nenhum servidor do Vertal durante a digitalização.
- Nada de telemetria ou rastreamento na digitalização.

## Limites desta versão

- Os cantos são **ajustados à mão**. A detecção automática de bordas ainda não existe no Vertal.
- **Ainda não há OCR**: o PDF guarda a imagem, mas o texto não é pesquisável. Esse é o próximo passo.
- Fotos muito grandes são reduzidas para 2400 px no maior lado, para não travar o aparelho.

## Perguntas frequentes

**O scanner é gratuito?**
Sim. Digitalizar e exportar PDF não consome créditos do Vertal.

**Funciona offline?**
A digitalização e a exportação dependem do navegador já carregado. Depois que o painel abre, o processamento não precisa de conexão com servidores do Vertal.

**Serve para escanear no celular?**
Sim. No celular, o botão de foto abre a câmera traseira. No computador, ele abre o seletor de arquivos.

**Qual a diferença para o Microsoft Lens?**
O Lens usa a nuvem da Microsoft para parte do processamento. Aqui a imagem fica no seu aparelho, e o código é de um projeto open source auditável.

**Posso digitalizar várias páginas num único PDF?**
Sim. Adicione quantas fotos quiser; cada uma vira uma página A4 no PDF final.

## Veja também

- [Vertal Office](VERTAL_OFFICE.md): edite e organize documentos depois de escaneá-los.
