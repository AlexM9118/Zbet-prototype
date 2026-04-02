export const SAFE_THRESHOLD = 0.62;
export const MAX_TICKET_LEG_ODDS = 1.6;
export const MIN_MATCH_RECO_ODDS = 1.22;
export const IDEAL_MATCH_RECO_ODDS = 1.34;
export const GOALS_LINES = [1.5, 2.5, 3.5, 4.5];
export const CORNERS_LINES = [8.5, 9.5, 10.5];
export const CARDS_LINES = [3.5, 4.5, 5.5];

export const TICKET_CONFIGS = [
  { key: "safe", target: 5, name: "Conservator", badge: "Mai sigur", desc: "Selecții mai prudente, pentru o zi mai stabila si o cota grupata mai compacta.", minOdds: 1.15, maxOdds: 1.38, preferredPicks: [4, 5] },
  { key: "value", target: 10, name: "Echilibrat", badge: "Cel mai echilibrat", desc: "Cel mai bun raport intre cota, probabilitate si diversitate de selecții.", minOdds: 1.22, maxOdds: 1.5, preferredPicks: [5, 6] },
  { key: "boost", target: 20, name: "Curajos", badge: "Mai agresiv", desc: "Varianta cu upside mai mare, dar pastrata in zona unui risc controlat.", minOdds: 1.28, maxOdds: 1.6, preferredPicks: [6, 7] }
];
