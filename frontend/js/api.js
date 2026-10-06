/**
 * api.js — All backend calls go through here.
 * Base URL auto-detects localhost vs production.
 */
const API = (() => {
  const BASE = window.location.origin + '/api';

  async function req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  return {
    getSession: async () => { const res=await fetch(BASE+'/auth/session'); return res.json(); },
    login: (email,password) => req('POST','/auth/login',{email,password}),
    logout: () => req('POST','/auth/logout'),
    // Accounts
    getAccounts:    ()          => req('GET',    '/accounts'),
    createAccount:  (data)      => req('POST',   '/accounts', data),
    updateAccount:  (id, data)  => req('PUT',    `/accounts/${id}`, data),
    deleteAccount:  (id)        => req('DELETE', `/accounts/${id}`),

    // Items
    getItems:       (params={}) => req('GET',    '/items?' + new URLSearchParams(params)),
    createItem:     (data)      => req('POST',   '/items', data),
    updateItem:     (id, data)  => req('PUT',    `/items/${id}`, data),
    confirmItem:    (id)        => req('PATCH',  `/items/${id}/confirm`),
    deleteItem:     (id)        => req('DELETE', `/items/${id}`),

    // Settings
    getSettings:    ()          => req('GET',    '/settings'),
    updateSettings: (data)      => req('PUT',    '/settings', data),

    // Integration
    getIntegration: ()          => req('GET',    '/integration'),
    getEmbedToken:  async ()    => {
      const res = await fetch(BASE + '/integration/embed-token');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.text();
    },
    connectGmail:   (acctId, authId) => req('POST', `/integration/gmail/connect/${acctId}`, { authId }),
    unlinkAccount:  (acctId)    => req('POST',   `/integration/unlink/${acctId}`),
    toggleInteg:    ()          => req('POST',   '/integration/toggle'),
    connectSlack:   (authId)    => req('POST',   '/integration/slack/connect',{authId}),
    getSlackStatus: ()          => req('GET',    '/integration/slack/status'),
    getSlackOptions:(type)      => req('GET',    `/integration/slack/options/${type}`),
    setSlackDestination:(data)  => req('POST',   '/integration/slack/destination',data),
    toggleSlack:    (enabled)   => req('POST',   '/integration/slack/toggle',{enabled}),
    disconnectSlack:()          => req('POST',   '/integration/slack/disconnect'),
    getInvoices:    (params={}) => req('GET',    '/invoices?'+new URLSearchParams(params)),
    deleteInvoice:  (id)        => req('DELETE', `/invoices/${id}`),
    replyInvoice:   (id, data)  => req('POST',   `/invoices/${id}/reply`, data),

    // Activity
    getActivity:    ()          => req('GET',    '/activity'),
    clearActivity:  ()          => req('DELETE', '/activity'),

    // Notifications
    getNotifications: ()        => req('GET',    '/notifications'),
    markRead:       (id)        => req('PATCH',  `/notifications/${id}/read`),
    markAllRead:    ()          => req('POST',   '/notifications/read-all'),
  };
})();
