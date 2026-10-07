import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

const microsoftTenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID
const microsoftClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID
const apiScope = import.meta.env.VITE_MICROSOFT_API_SCOPE || `api://${microsoftClientId}/access_as_user`

export const isAuthConfigured = Boolean(microsoftTenantId && microsoftClientId)

export const authClient = new PublicClientApplication({
  auth: {
    clientId: microsoftClientId || 'missing-client-id',
    authority: microsoftTenantId ? `https://login.microsoftonline.com/${microsoftTenantId}` : undefined,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
})

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', apiScope],
}

export async function initializeAuth() {
  await authClient.initialize()
  const response = await authClient.handleRedirectPromise()
  if (response?.account) authClient.setActiveAccount(response.account)
  const account = authClient.getActiveAccount() ?? authClient.getAllAccounts()[0] ?? null
  if (account) authClient.setActiveAccount(account)
  return account
}

export async function signInMicrosoft() {
  const result = await authClient.loginPopup(loginRequest)
  authClient.setActiveAccount(result.account)
  return result.account
}

export async function signOutMicrosoft() {
  const account = authClient.getActiveAccount()
  if (account) await authClient.logoutPopup({ account })
  authClient.setActiveAccount(null)
}

export function getActiveAccount(): AccountInfo | null {
  return authClient.getActiveAccount() ?? authClient.getAllAccounts()[0] ?? null
}

export async function getAccessToken() {
  const account = getActiveAccount()
  if (!account) throw new Error('No hay una sesion activa.')

  try {
    const result = await authClient.acquireTokenSilent({ ...loginRequest, account })
    return result.accessToken
  } catch {
    const result = await authClient.acquireTokenPopup({ ...loginRequest, account })
    return result.accessToken
  }
}
