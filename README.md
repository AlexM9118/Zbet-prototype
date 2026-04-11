# Zbet-prototype

Acesta este repo-ul nou pentru directia `ZBet`, construit mobile-first in jurul fluxului de analiza meci cu meci.

Status curent:
- UI nou pentru analiza pe competitie / meci
- repo pregatit sa devina sursa principala
- date locale si workflow-uri mutate din proiectul vechi

Date si build:
- `data/ui/*` pentru consumul din aplicatie
- `data/history/*` si `data/stats/*` pentru istoric si backtesting
- `data/oddspapi_*.json` pentru rebuild-ul UI dupa refresh OddsPapi

Workflow-uri:
- `pages.yml` publica site-ul
- `oddspapi-run.yml` ruleaza refresh manual OddsPapi
- `oddspapi-scheduled.yml` ruleaza refresh programat OddsPapi
- `history-weekly.yml` actualizeaza zilnic istoricul/statisticile

Concept:
- utilizatorul alege competitia
- poate analiza toate meciurile din liga
- poate selecta un meci individual
- primeste 1-2 recomandari + justificare
- poate extinde:
  - toate pietele
  - forma si comparatia
  - istoric / backtest
