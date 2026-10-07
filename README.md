# Proyecto Frontend Araneda

Frontend React del Portal de Pedidos Araneda.

## Stack

- React + TypeScript + Vite
- Microsoft Entra ID / Azure AD con `@azure/msal-browser`
- Consumo de API REST `/v1`
- Preparado para Vercel

## Ejecutar

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables principales:

```bash
VITE_MICROSOFT_TENANT_ID=
VITE_MICROSOFT_CLIENT_ID=
VITE_MICROSOFT_API_SCOPE=
VITE_API_URL=
```
