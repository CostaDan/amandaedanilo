# Site de casamento

Este projeto é uma landing page para organização e confirmação de presença de um casamento, com informações do evento, lista de presentes e integração para pagamentos.

## Estrutura

- index.html: estrutura principal da página
- style.css: estilos visuais e responsividade
- js/: scripts da interface, validações, banco e pagamentos
- worker/: Cloudflare Worker para integração com gateway de pagamento

## Publicação no GitHub

1. Crie um repositório no GitHub.
2. Envie os arquivos para o repositório.
3. Configure o GitHub Pages para servir a pasta raiz do projeto.
4. Para a parte de pagamentos, defina as variáveis de ambiente no Cloudflare Worker antes de habilitar o fluxo completo.

## Itens importantes antes de aprovar a publicação

- Remover ou substituir dados pessoais reais de contato e PIX.
- Configurar as variáveis de ambiente do Worker no Cloudflare.
- Definir a URL do worker em produção se o fluxo de pagamento for ativado.
- Revisar o arquivo worker/.env.example e não commitar arquivos .env reais.
