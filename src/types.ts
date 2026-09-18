export interface ParametrosBusca {
  termos: string[];
  regiao_alvo: string;
}

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface ResultadoProcessado {
  id: string;
  nome_loja: string;
  endereco: string;
  bairro: string;
  telefone: string;
  link_whatsapp: string;
  coordenadas: Coordenadas | null;
}

export interface TerminalRota {
  id: string;
  nome: string;
  endereco: string;
  coordenadas: Coordenadas;
}

export interface LeadExtractionPayload {
  parametros_busca: ParametrosBusca;
  resultados_processados: ResultadoProcessado[];
}

export interface SearchPage extends LeadExtractionPayload {
  fonte: 'Google Places';
  consultado_em: string;
  proximas_paginas: Record<string, string>;
}

export interface SearchRequest extends ParametrosBusca {
  proximas_paginas?: Record<string, string>;
}
