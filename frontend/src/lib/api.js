import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function apiFetch(path, params = {}) {
  const url = new URL(`${API_BASE}/api${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const { data: { session } } = await supabase.auth.getSession();
  const headers = {};
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function getMentions(filters = {}) {
  return apiFetch('/mentions', filters);
}

export async function getMention(id) {
  return apiFetch(`/mentions/${id}`);
}

export async function getStockMentions(ticker) {
  return apiFetch(`/stocks/${encodeURIComponent(ticker)}`);
}

export async function getSpeakers() {
  return apiFetch('/speakers');
}

export async function getSpeakerMentions(name) {
  return apiFetch(`/speakers/${encodeURIComponent(name)}`);
}

export async function getEpisodes(params = {}) {
  return apiFetch('/episodes', params);
}

export async function getEpisode(id) {
  return apiFetch(`/episodes/${id}`);
}

export async function getPodcasts() {
  return apiFetch('/podcasts');
}
